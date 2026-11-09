import { UserAccount } from '../types/pharmacy';
import { hashPin, newPinSalt, verifyPinHash } from './pinCrypto';

const STAFF_STORAGE_KEY = 'zahid_med_users_v2';
const ACTIVE_USER_KEY = 'zahid_active_user_v2';
const LOCK_STATE_KEY = 'zahid_screen_locked_v2';

/**
 * SECURITY FIX: Staff PINs are no longer stored in plaintext.
 * Only a per-user random salt and a PBKDF2/SHA-256 digest are persisted.
 * Legacy records (created before this fix) that still carry a plaintext
 * `pin` field are migrated on first load: the PIN is hashed, and the
 * plaintext value is wiped from localStorage.
 */
interface LegacyUserRecord extends Partial<UserAccount> {
  pin?: string;
}

// Seed accounts keep their well-known default PINs for first-run usability,
// but the values are hashed+salted at creation time instead of being stored raw.
const DEFAULT_USER_SEEDS: Array<Omit<UserAccount, 'pinHash' | 'pinSalt'> & { seedPin: string }> = [
  {
    id: 'usr_owner_01',
    name: 'Dr. Zahid Hussain',
    role: 'owner',
    seedPin: '7788',
    phone: '03067617080',
    email: 'zahid.pharmacy.multan@gmail.com',
    isActive: true,
  },
  {
    id: 'usr_pharma_02',
    name: 'Duty Pharmacist',
    role: 'pharmacist',
    seedPin: '1234',
    phone: '03001234567',
    email: 'pharmacist@zahidmed.com',
    isActive: true,
  },
  {
    id: 'usr_cash_03',
    name: 'Counter Cashier',
    role: 'cashier',
    seedPin: '0000',
    phone: '03019876543',
    email: 'cashier@zahidmed.com',
    isActive: true,
  },
];

async function buildDefaultUsers(): Promise<UserAccount[]> {
  const users: UserAccount[] = [];
  for (const seed of DEFAULT_USER_SEEDS) {
    const { seedPin, ...rest } = seed;
    const pinSalt = newPinSalt();
    const pinHash = await hashPin(seedPin, pinSalt);
    users.push({ ...rest, pinSalt, pinHash });
  }
  return users;
}

/** Migrate any legacy plaintext-PIN record to a salted hash and drop the plaintext. */
async function migrateLegacyUsers(raw: unknown): Promise<UserAccount[] | null> {
  if (!Array.isArray(raw)) return null;
  let migrated = false;
  const out: UserAccount[] = [];
  for (const item of raw) {
    const rec = item as LegacyUserRecord;
    if (!rec || typeof rec.id !== 'string' || typeof rec.name !== 'string') {
      return null; // Unrecognized shape — fall back to defaults
    }
    if (typeof rec.pin === 'string' && !rec.pinHash) {
      // Legacy plaintext PIN: hash it now, never persist the plaintext again.
      const pinSalt = newPinSalt();
      const pinHash = await hashPin(rec.pin, pinSalt);
      const { pin: _plaintext, ...rest } = rec;
      out.push({ ...(rest as UserAccount), pinSalt, pinHash });
      migrated = true;
    } else if (typeof rec.pinHash === 'string' && typeof rec.pinSalt === 'string') {
      const { pin: _plaintext, ...rest } = rec; // strip any leftover plaintext too
      out.push(rest as UserAccount);
      if (_plaintext !== undefined) migrated = true;
    } else {
      return null;
    }
  }
  return migrated ? out : out.length > 0 ? out : null;
}

class StaffAuthService {
  private users: UserAccount[] = [];
  private currentUser: UserAccount | null = null;
  private locked: boolean = false;
  /** Serialized init so callers can await readiness after an async migration. */
  private ready: Promise<void>;

  constructor() {
    this.ready = this.init();
  }

  /** Resolves once user storage has been loaded/migrated. */
  public whenReady(): Promise<void> {
    return this.ready;
  }

  private async init(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      const saved = localStorage.getItem(STAFF_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const migrated = await migrateLegacyUsers(parsed);
        if (migrated) {
          this.users = migrated;
          this.saveUsers(); // overwrite legacy plaintext immediately
        } else if (Array.isArray(parsed) && parsed.length > 0) {
          this.users = parsed as UserAccount[];
        } else {
          throw new Error('unrecognized storage shape');
        }
      } else {
        this.users = await buildDefaultUsers();
        this.saveUsers();
      }

      const activeId = localStorage.getItem(ACTIVE_USER_KEY);
      if (activeId) {
        this.currentUser = this.users.find((u) => u.id === activeId) || this.users[0];
      } else {
        this.currentUser = this.users[0];
        localStorage.setItem(ACTIVE_USER_KEY, this.currentUser.id);
      }

      const lockState = localStorage.getItem(LOCK_STATE_KEY);
      this.locked = lockState === 'true';
    } catch {
      this.users = await buildDefaultUsers();
      this.currentUser = this.users[0];
      this.saveUsers();
    }
  }

  public getStaffList(): UserAccount[] {
    // Never expose credential material to UI code.
    return this.users.map(({ pinHash: _h, pinSalt: _s, ...safe }) => safe as UserAccount);
  }

  public getCurrentUser(): UserAccount {
    if (!this.currentUser) {
      this.currentUser = this.users[0];
    }
    return { ...this.currentUser };
  }

  public isLocked(): boolean {
    return this.locked;
  }

  public setLock(state: boolean): void {
    this.locked = state;
    try {
      localStorage.setItem(LOCK_STATE_KEY, state ? 'true' : 'false');
    } catch {}
  }

  public async verifyPin(pin: string): Promise<UserAccount | null> {
    await this.ready;
    for (const user of this.users) {
      if (!user.isActive) continue;
      if (await verifyPinHash(pin, user.pinSalt, user.pinHash)) {
        return { ...user };
      }
    }
    return null;
  }

  public async unlock(pin: string): Promise<{ success: boolean; user?: UserAccount; message?: string }> {
    const user = await this.verifyPin(pin);
    if (!user) {
      return { success: false, message: 'Invalid security PIN' };
    }
    this.currentUser = user;
    this.setLock(false);
    try {
      localStorage.setItem(ACTIVE_USER_KEY, user.id);
    } catch {}
    return { success: true, user };
  }

  public async switchUser(pin: string): Promise<{ success: boolean; user?: UserAccount; message?: string }> {
    const user = await this.verifyPin(pin);
    if (!user) {
      return { success: false, message: 'Incorrect PIN. Please re-enter.' };
    }
    this.currentUser = user;
    try {
      localStorage.setItem(ACTIVE_USER_KEY, user.id);
    } catch {}
    return { success: true, user };
  }

  public async changePin(
    userId: string,
    oldPin: string,
    newPin: string
  ): Promise<{ success: boolean; message: string }> {
    await this.ready;
    const user = this.users.find((u) => u.id === userId);
    if (!user) {
      return { success: false, message: 'User not found' };
    }
    if (!(await verifyPinHash(oldPin, user.pinSalt, user.pinHash))) {
      return { success: false, message: 'Current PIN is incorrect' };
    }
    if (!/^\d{4,6}$/.test(newPin)) {
      return { success: false, message: 'New PIN must be 4 to 6 numeric digits' };
    }

    user.pinSalt = newPinSalt();
    user.pinHash = await hashPin(newPin, user.pinSalt);
    this.saveUsers();
    if (this.currentUser?.id === userId) {
      this.currentUser = { ...user };
    }
    return { success: true, message: 'Security PIN updated successfully' };
  }

  public async addStaff(
    data: Omit<UserAccount, 'id' | 'pinHash' | 'pinSalt'> & { pin: string }
  ): Promise<{ success: boolean; message?: string; user?: UserAccount }> {
    await this.ready;
    const { pin, ...profile } = data;
    if (!/^\d{4,6}$/.test(pin)) {
      return { success: false, message: 'PIN must be 4 to 6 numeric digits' };
    }
    if (await this.isPinTaken(pin)) {
      return { success: false, message: 'PIN is already in use by another staff member' };
    }

    const pinSalt = newPinSalt();
    const pinHash = await hashPin(pin, pinSalt);
    const newUser: UserAccount = {
      ...profile,
      pinSalt,
      pinHash,
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    };
    this.users.push(newUser);
    this.saveUsers();
    return { success: true, user: { ...newUser } };
  }

  public async updateStaff(
    user: UserAccount & { pin?: string }
  ): Promise<{ success: boolean; message?: string }> {
    await this.ready;
    const target = this.users.find((u) => u.id === user.id);
    if (!target) return { success: false, message: 'User not found' };

    const next: UserAccount = { ...target, ...user };
    if (typeof user.pin === 'string' && user.pin.length > 0) {
      if (!/^\d{4,6}$/.test(user.pin)) {
        return { success: false, message: 'PIN must be 4 to 6 numeric digits' };
      }
      if (await this.isPinTaken(user.pin, user.id)) {
        return { success: false, message: 'PIN is already in use by another staff member' };
      }
      next.pinSalt = newPinSalt();
      next.pinHash = await hashPin(user.pin, next.pinSalt);
    }
    delete (next as { pin?: string }).pin;

    this.users = this.users.map((u) => (u.id === user.id ? next : u));
    if (this.currentUser?.id === user.id) {
      this.currentUser = { ...next };
    }
    this.saveUsers();
    return { success: true };
  }

  public async editUserAccount(
    userId: string,
    updates: Partial<Pick<UserAccount, 'name' | 'role' | 'phone' | 'email' | 'isActive'>> & {
      pin?: string;
    }
  ): Promise<{ success: boolean; message?: string }> {
    await this.ready;
    const target = this.users.find((u) => u.id === userId);
    if (!target) return { success: false, message: 'User not found' };

    const { pin, ...profileUpdates } = updates;
    Object.assign(target, profileUpdates);

    if (pin) {
      if (!/^\d{4,6}$/.test(pin)) {
        return { success: false, message: 'PIN must be 4 to 6 numeric digits' };
      }
      if (await this.isPinTaken(pin, userId)) {
        return { success: false, message: 'PIN is already assigned to another staff member' };
      }
      target.pinSalt = newPinSalt();
      target.pinHash = await hashPin(pin, target.pinSalt);
    }

    if (this.currentUser?.id === userId) {
      this.currentUser = { ...target };
    }
    this.saveUsers();
    return { success: true };
  }

  public deleteStaff(userId: string): { success: boolean; message?: string } {
    if (this.users.length <= 1) {
      return { success: false, message: 'Cannot delete the sole remaining staff account' };
    }
    if (this.currentUser?.id === userId) {
      return { success: false, message: 'Cannot delete the currently logged in user' };
    }

    this.users = this.users.filter((u) => u.id !== userId);
    this.saveUsers();
    return { success: true };
  }

  /** True if `pin` matches any stored account (optionally excluding one id). */
  private async isPinTaken(pin: string, exceptId?: string): Promise<boolean> {
    for (const u of this.users) {
      if (u.id === exceptId) continue;
      if (await verifyPinHash(pin, u.pinSalt, u.pinHash)) return true;
    }
    return false;
  }

  private saveUsers(): void {
    try {
      // Defensive: strip any accidental plaintext `pin` field before persisting.
      const sanitized = this.users.map((u) => {
        const rec: Record<string, unknown> = { ...u };
        delete rec.pin;
        return rec;
      });
      localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(sanitized));
    } catch {}
  }
}

export const staffAuth = new StaffAuthService();
