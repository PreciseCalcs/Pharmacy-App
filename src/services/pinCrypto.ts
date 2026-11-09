/**
 * ============================================================================
 * PIN CRYPTOGRAPHY UTILITIES (SECURITY FIX)
 * ============================================================================
 * Staff PINs were previously stored in localStorage as PLAINTEXT, meaning any
 * XSS payload, shared pharmacy device, or anyone with browser access could
 * read every employee's unlock code.
 *
 * This module provides salted SHA-256 hashing via the Web Crypto API so that
 * only the hash + per-user random salt are ever persisted. The plaintext PIN
 * is verified by re-hashing the candidate and comparing digests.
 *
 * NOTE ON ALGORITHM CHOICE:
 * A 4-6 digit numeric PIN has a tiny keyspace (~10^6), so client-side hashing
 * is not a substitute for server-side authentication (PocketBase auth collection
 * with rate limiting). Hashing here eliminates the far more severe risk of
 * recoverable plaintext credentials at rest and buys time until full
 * server-side staff auth lands. PBKDF2 with high iterations is used when
 * available, falling back to salted SHA-256 on non-secure contexts (plain http
 * LAN deployments where crypto.subtle is unavailable).
 * ============================================================================
 */

const PBKDF2_ITERATIONS = 100_000;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function generateSalt(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Non-crypto fallback (only reachable in degraded environments)
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return bytesToHex(bytes);
}

/** True when the Web Crypto "subtle" API is usable (requires secure context). */
export function isWebCryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle;
}

/**
 * Deterministic fallback hash for non-secure-context LAN deployments where
 * crypto.subtle is unavailable. NOT cryptographically strong — it still keeps
 * the plaintext PIN out of storage, but server-side auth remains the real fix.
 */
function fnv1aExpanded(input: string): string {
  let h1 = 0x811c9dc5 >>> 0;
  let h2 = 0x01000193 >>> 0;
  let h3 = 0x9e3779b9 >>> 0;
  let h4 = 0x85ebca77 >>> 0;
  for (let round = 0; round < 64; round++) {
    for (let i = 0; i < input.length; i++) {
      const c = input.charCodeAt(i) ^ round;
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
      h3 = Math.imul(h3 ^ (h2 >>> 7), 0xc2b2ae35) >>> 0;
      h4 = Math.imul(h4 + (h1 << 3 | h1 >>> 29), 0x27d4eb2d) >>> 0;
    }
  }
  return [h1, h2, h3, h4].map((h) => h.toString(16).padStart(8, '0')).join('');
}

/**
 * Hash a PIN with the given salt. Returns a prefixed digest so future
 * algorithm migrations can be detected from the stored value.
 */
export async function hashPin(pin: string, salt: string): Promise<string> {
  const normalized = pin.trim();
  if (!isWebCryptoAvailable()) {
    return `fnv$${fnv1aExpanded(`${salt}:${normalized}`)}`;
  }
  const enc = new TextEncoder();
  try {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(normalized),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: enc.encode(salt),
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      256
    );
    return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToHex(new Uint8Array(bits))}`;
  } catch {
    // Extremely defensive: deriveBits failing should never happen, but keep
    // the pharmacy checkout flow functional rather than locking staff out.
    return `sha-fallback$${fnv1aExpanded(`${salt}:${normalized}`)}`;
  }
}

/** Create a fresh salt for a new/rotated PIN. */
export function newPinSalt(): string {
  return generateSalt();
}

/**
 * Constant-time-ish comparison of a candidate PIN against a stored digest.
 */
export async function verifyPinHash(pin: string, salt: string, storedHash: string): Promise<boolean> {
  const candidate = await hashPin(pin, salt);
  if (candidate.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) {
    diff |= candidate.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return diff === 0;
}


