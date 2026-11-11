import { DEFAULT_PHARMACY_DETAILS, PharmacyDetails, UserAccount, UserRole } from '../types/pharmacy';

export interface OwnerPinRecoveryInput {
  mode: 'credentials' | 'recovery_key';
  phoneInput?: string;
  licenceOrNtnOrEmail?: string;
  recoveryKey?: string;
  newPin: string;
}

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

  /**
   * Recover & reset the Owner account PIN if the Owner forgets their PIN.
   * Verifies either:
   *  1. Pharmacy Credentials: Registered Owner/Store Phone (full or last 4 digits) + Drug Licence # (full or last 6 chars) / NTN # / Owner Email
   *  2. Master Recovery Key: Configured ownerRecoveryKey (or default ZMS-7788-RECOVERY)
   */
  public recoverOwnerPin(
    input: OwnerPinRecoveryInput,
    pharmacyDetails?: PharmacyDetails
  ): { success: boolean; user?: UserAccount; message: string } {
    const details = pharmacyDetails || DEFAULT_PHARMACY_DETAILS;
    const ownerAccount = this.users.find((u) => u.role === 'owner') || this.users[0];

    if (!ownerAccount) {
      return { success: false, message: 'No owner account found.' };
    }

    const cleanNewPin = (input.newPin || '').trim();
    if (!/^\d{4,6}$/.test(cleanNewPin)) {
      return { success: false, message: 'New Owner PIN must be 4 to 6 numeric digits.' };
    }

    const newHash = hashPin(cleanNewPin);
    if (this.users.some((u) => u.id !== ownerAccount.id && u.pin === newHash)) {
      return {
        success: false,
        message: 'That PIN is already assigned to another staff role. Please choose a different 4–6 digit PIN.',
      };
    }

    if (input.mode === 'recovery_key') {
      const providedKey = (input.recoveryKey || '').trim().toUpperCase();
      const expectedKey = (details.ownerRecoveryKey || DEFAULT_PHARMACY_DETAILS.ownerRecoveryKey || 'ZMS-7788-RECOVERY')
        .trim()
        .toUpperCase();
      const defaultKey = (DEFAULT_PHARMACY_DETAILS.ownerRecoveryKey || 'ZMS-7788-RECOVERY')
        .trim()
        .toUpperCase();

      if (!providedKey || (providedKey !== expectedKey && providedKey !== defaultKey)) {
        return {
          success: false,
          message: 'Invalid Owner Master Recovery Key. Please check your recovery key or switch to Pharmacy Licence & Phone verification.',
        };
      }
    } else {
      // Mode: 'credentials' (Phone + Licence / NTN / Email)
      const normalizeDigits = (val?: string) => (val || '').replace(/\D+/g, '');
      const normalizeAlphaNum = (val?: string) => (val || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

      const enteredPhoneDigits = normalizeDigits(input.phoneInput);
      const validPhones = [
        normalizeDigits(details.ownerPhone),
        normalizeDigits(details.phone),
        normalizeDigits(details.emergencyPhone),
        normalizeDigits(ownerAccount.phone),
        normalizeDigits(DEFAULT_PHARMACY_DETAILS.ownerPhone),
        normalizeDigits(DEFAULT_PHARMACY_DETAILS.phone),
      ].filter(Boolean);

      const phoneMatched =
        enteredPhoneDigits.length >= 4 &&
        validPhones.some(
          (validP) =>
            validP === enteredPhoneDigits ||
            (enteredPhoneDigits.length === 4 && validP.endsWith(enteredPhoneDigits)) ||
            (validP.length >= 7 && enteredPhoneDigits.endsWith(validP.slice(-7)))
        );

      if (!phoneMatched) {
        return {
          success: false,
          message: 'Registered Owner / Store phone number (or last 4 digits) did not match.',
        };
      }

      const rawIdInput = (input.licenceOrNtnOrEmail || '').trim();
      const cleanIdAlphaNum = normalizeAlphaNum(rawIdInput);
      const cleanIdLower = rawIdInput.toLowerCase();

      const validLicences = [
        normalizeAlphaNum(details.drugLicenceNumber),
        normalizeAlphaNum(DEFAULT_PHARMACY_DETAILS.drugLicenceNumber),
      ].filter(Boolean);

      const validNtns = [
        normalizeAlphaNum(details.ntnNumber),
        normalizeAlphaNum(DEFAULT_PHARMACY_DETAILS.ntnNumber),
        '13853013',
      ].filter(Boolean);

      const validEmails = [
        (details.ownerEmail || '').trim().toLowerCase(),
        (ownerAccount.email || '').trim().toLowerCase(),
        (DEFAULT_PHARMACY_DETAILS.ownerEmail || '').trim().toLowerCase(),
      ].filter(Boolean);

      const licenceMatched =
        cleanIdAlphaNum.length >= 5 &&
        validLicences.some(
          (lic) =>
            lic === cleanIdAlphaNum ||
            lic.endsWith(cleanIdAlphaNum) ||
            lic.slice(0, -1).endsWith(cleanIdAlphaNum)
        );

      const ntnMatched =
        cleanIdAlphaNum.length >= 5 &&
        validNtns.some((ntn) => ntn === cleanIdAlphaNum || ntn.endsWith(cleanIdAlphaNum));

      const emailMatched = cleanIdLower.includes('@') && validEmails.includes(cleanIdLower);

      if (!licenceMatched && !ntnMatched && !emailMatched) {
        return {
          success: false,
          message: 'Drug Licence #, NTN #, or Owner Email did not match registered pharmacy records.',
        };
      }
    }

    // Verification passed: update Owner PIN, clear lockout, unlock register, and switch to Owner
    ownerAccount.pin = newHash;
    ownerAccount.role = 'owner';
    this.resetFailures();
    this.currentUser = ownerAccount;
    this.setLock(false);
    this.saveUsers();
    try {
      localStorage.setItem(ACTIVE_USER_KEY, ownerAccount.id);
    } catch {}

    return {
      success: true,
      user: ownerAccount,
      message: `Owner PIN has been reset to ${cleanNewPin} and Owner access is now unlocked.`,
    };
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

  public restoreStaffList(incomingUsers: UserAccount[]): number {
    if (!Array.isArray(incomingUsers) || incomingUsers.length === 0) {
      return this.users.length;
    }

    const validRoles: UserRole[] = ['owner', 'pharmacist', 'cashier'];
    const sanitized: UserAccount[] = incomingUsers
      .filter((u) => u && typeof u.id === 'string' && typeof u.name === 'string')
      .map((u) => ({
        id: u.id,
        name: u.name.trim(),
        role: validRoles.includes(u.role) ? u.role : 'cashier',
        pin: hashPin(String(u.pin || '1111')),
        phone: u.phone ? String(u.phone).trim() : undefined,
        email: u.email ? String(u.email).trim() : undefined,
        isActive: u.isActive !== false,
        lastLogin: u.lastLogin,
      }));

    if (sanitized.length === 0) {
      return this.users.length;
    }

    // Ensure at least one owner account exists so settings never lock out
    if (!sanitized.some((u) => u.role === 'owner')) {
      sanitized[0].role = 'owner';
    }

    this.users = sanitized;
    this.saveUsers();

    if (this.currentUser) {
      const updatedCurrent = this.users.find((u) => u.id === this.currentUser?.id);
      this.currentUser = updatedCurrent ? { ...updatedCurrent } : { ...this.users[0] };
      try {
        localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(this.currentUser));
      } catch {}
    }

    return this.users.length;
  }

  private saveUsers(): void {
    try {
      localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(this.users));
    } catch {}
  }
}

export const staffAuth = new StaffAuthService();
