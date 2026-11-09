import { UserAccount } from '../types/pharmacy';

const STAFF_STORAGE_KEY = 'zahid_med_users_v2';
const ACTIVE_USER_KEY = 'zahid_active_user_v2';
const LOCK_STATE_KEY = 'zahid_screen_locked_v2';
const HASH_PREFIX = 'zms_h1$';
const SALT = 'zahid_med_multan_2026_salt';

/**
 * Deterministic synchronous PIN hash so plaintext PINs are never stored in localStorage
 */
function hashPin(rawPin: string): string {
  if (rawPin.startsWith(HASH_PREFIX)) return rawPin;
  const input = `${SALT}:${rawPin.trim()}`;
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const combined = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  return `${HASH_PREFIX}${combined}`;
}

const DEFAULT_USERS: UserAccount[] = [
  {
    id: 'usr_owner_01',
    name: 'Dr. Zahid Hussain',
    role: 'owner',
    pin: hashPin('7788'),
    phone: '03067617080',
    email: 'zahid.pharmacy.multan@gmail.com',
    isActive: true,
  },
  {
    id: 'usr_pharma_02',
    name: 'Duty Pharmacist',
    role: 'pharmacist',
    pin: hashPin('1234'),
    phone: '03001234567',
    email: 'pharmacist@zahidmed.com',
    isActive: true,
  },
  {
    id: 'usr_cash_03',
    name: 'Counter Cashier',
    role: 'cashier',
    pin: hashPin('0000'),
    phone: '03019876543',
    email: 'cashier@zahidmed.com',
    isActive: true,
  },
];

class StaffAuthService {
  private users: UserAccount[] = [];
  private currentUser: UserAccount | null = null;
  private locked: boolean = false;
  private failedAttempts: number = 0;
  private lockoutUntil: number = 0;

  constructor() {
    this.init();
  }

  private init(): void {
    if (typeof window === 'undefined') return;

    try {
      const saved = localStorage.getItem(STAFF_STORAGE_KEY);
      if (saved) {
        const parsed: UserAccount[] = JSON.parse(saved);
        // Migrate any legacy plaintext PINs to hashed format automatically
        let migrated = false;
        this.users = parsed.map((u) => {
          if (u.pin && !u.pin.startsWith(HASH_PREFIX)) {
            migrated = true;
            return { ...u, pin: hashPin(u.pin) };
          }
          return u;
        });
        if (migrated) {
          this.saveUsers();
        }
      } else {
        this.users = [...DEFAULT_USERS];
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
      this.users = [...DEFAULT_USERS];
      this.currentUser = this.users[0];
    }
  }

  private checkLockout(): { lockedOut: boolean; remainingSeconds: number } {
    const now = Date.now();
    if (this.lockoutUntil > now) {
      return {
        lockedOut: true,
        remainingSeconds: Math.ceil((this.lockoutUntil - now) / 1000),
      };
    }
    return { lockedOut: false, remainingSeconds: 0 };
  }

  private recordFailure(): string {
    this.failedAttempts += 1;
    if (this.failedAttempts >= 5) {
      this.lockoutUntil = Date.now() + 30_000; // 30s lockout after 5 bad attempts
      this.failedAttempts = 0;
      return 'Too many failed attempts. Keypad locked for 30 seconds.';
    }
    return 'Incorrect security PIN. Please try again.';
  }

  private resetFailures(): void {
    this.failedAttempts = 0;
    this.lockoutUntil = 0;
  }

  public getStaffList(): UserAccount[] {
    return [...this.users];
  }

  public getCurrentUser(): UserAccount {
    if (!this.currentUser) {
      this.currentUser = this.users[0] || DEFAULT_USERS[0];
    }
    return this.currentUser;
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

  public verifyPin(pin: string, targetUserId?: string): UserAccount | null {
    const { lockedOut } = this.checkLockout();
    if (lockedOut) return null;

    const candidateHash = hashPin(pin);
    const user = this.users.find((u) => {
      if (!u.isActive) return false;
      if (targetUserId && u.id !== targetUserId) return false;
      return u.pin === candidateHash;
    });
    return user || null;
  }

  public unlock(pin: string): { success: boolean; user?: UserAccount; message?: string } {
    const { lockedOut, remainingSeconds } = this.checkLockout();
    if (lockedOut) {
      return {
        success: false,
        message: `Keypad locked. Wait ${remainingSeconds}s before retrying.`,
      };
    }

    const user = this.verifyPin(pin);
    if (!user) {
      return { success: false, message: this.recordFailure() };
    }

    this.resetFailures();
    this.currentUser = user;
    this.setLock(false);
    try {
      localStorage.setItem(ACTIVE_USER_KEY, user.id);
    } catch {}
    return { success: true, user };
  }

  public switchUser(
    pin: string,
    targetUserId?: string
  ): { success: boolean; user?: UserAccount; message?: string } {
    const { lockedOut, remainingSeconds } = this.checkLockout();
    if (lockedOut) {
      return {
        success: false,
        message: `Too many attempts. Try again in ${remainingSeconds}s.`,
      };
    }

    const user = this.verifyPin(pin, targetUserId);
    if (!user) {
      return { success: false, message: this.recordFailure() };
    }

    this.resetFailures();
    this.currentUser = user;
    try {
      localStorage.setItem(ACTIVE_USER_KEY, user.id);
    } catch {}
    return { success: true, user };
  }

  public changePin(
    userId: string,
    oldPin: string,
    newPin: string
  ): { success: boolean; message: string } {
    const user = this.users.find((u) => u.id === userId);
    if (!user) {
      return { success: false, message: 'User not found' };
    }
    if (user.pin !== hashPin(oldPin)) {
      return { success: false, message: 'Current PIN is incorrect' };
    }
    if (!/^\d{4,6}$/.test(newPin)) {
      return { success: false, message: 'New PIN must be 4 to 6 numeric digits' };
    }
    const newHash = hashPin(newPin);
    if (this.users.some((u) => u.id !== userId && u.pin === newHash)) {
      return { success: false, message: 'PIN is already in use by another staff member' };
    }

    user.pin = newHash;
    this.saveUsers();
    return { success: true, message: 'Security PIN updated successfully' };
  }

  public addStaff(
    data: Omit<UserAccount, 'id'>
  ): { success: boolean; message?: string; user?: UserAccount } {
    if (!/^\d{4,6}$/.test(data.pin)) {
      return { success: false, message: 'PIN must be 4 to 6 numeric digits' };
    }
    const pinHash = hashPin(data.pin);
    if (this.users.some((u) => u.pin === pinHash)) {
      return { success: false, message: 'PIN is already in use by another staff member' };
    }
    const newUser: UserAccount = {
      ...data,
      pin: pinHash,
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    };
    this.users.push(newUser);
    this.saveUsers();
    return { success: true, user: newUser };
  }

  public updateStaff(user: UserAccount): { success: boolean; message?: string } {
    const pinHash = user.pin.startsWith(HASH_PREFIX) ? user.pin : hashPin(user.pin);
    const conflict = this.users.some((u) => u.id !== user.id && u.pin === pinHash);
    if (conflict) {
      return { success: false, message: 'PIN is already in use by another staff member' };
    }
    const updatedUser = { ...user, pin: pinHash };
    this.users = this.users.map((u) => (u.id === user.id ? updatedUser : u));
    if (this.currentUser?.id === user.id) {
      this.currentUser = updatedUser;
    }
    this.saveUsers();
    return { success: true };
  }

  public editUserAccount(
    userId: string,
    updates: Partial<Pick<UserAccount, 'name' | 'role' | 'pin' | 'phone' | 'email'>>
  ): { success: boolean; message?: string } {
    const target = this.users.find((u) => u.id === userId);
    if (!target) return { success: false, message: 'User not found' };

    const nextUpdates = { ...updates };
    if (nextUpdates.pin && nextUpdates.pin.trim() !== '') {
      if (!/^\d{4,6}$/.test(nextUpdates.pin.trim())) {
        return { success: false, message: 'New PIN must be 4 to 6 numeric digits' };
      }
      const nextHash = hashPin(nextUpdates.pin.trim());
      const conflict = this.users.some((u) => u.id !== userId && u.pin === nextHash);
      if (conflict) {
        return { success: false, message: 'PIN is already assigned to another staff member' };
      }
      nextUpdates.pin = nextHash;
    } else {
      delete nextUpdates.pin;
    }

    Object.assign(target, nextUpdates);
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

  private saveUsers(): void {
    try {
      localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(this.users));
    } catch {}
  }
}

export const staffAuth = new StaffAuthService();
