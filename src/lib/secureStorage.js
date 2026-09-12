// ── P-02 / PG-10: encrypted-at-rest storage layer ────────────────────────────
// Intercepts window.localStorage's getItem/setItem/removeItem for mi_* keys
// so every existing call site (167 of them across 25 files, none of which
// go through a shared store abstraction — see DEC-027) keeps working
// completely unchanged: they still call localStorage.getItem/setItem and
// transparently get plaintext in, ciphertext out. Only method-level
// overrides are needed — nothing in this codebase accesses localStorage via
// bracket/property syntax (verified by grep), only getItem/setItem/removeItem.
//
// The DEK lives in memory only (a module-level variable — never persisted,
// never logged). On unlock, every existing mi_* ciphertext blob is decrypted
// once into an in-memory plaintext cache; reads are synchronous against that
// cache (WebCrypto is async, localStorage.getItem is not — this is how the
// two are reconciled without an async rewrite of every call site). Writes
// update the cache synchronously and persist ciphertext to real localStorage
// in the background.
import * as vault from "./vault.js";
import { appendAudit } from "../rie/auditLog.js";

export const VAULT_KEY = "mi_vault";
const MIGRATION_INTERRUPTED_KEY = "mi_vault_migration_interrupted";

// Operational metadata, not patient health data — never encrypted, never
// routed through the in-memory cache.
const PIN_WRAP_KEY = "mi_pin_wrap"; // companion PIN quick-unlock: PIN-KEK-wrapped DEK envelope
const EXEMPT_KEYS = new Set([
  VAULT_KEY,
  MIGRATION_INTERRUPTED_KEY,
  "mi_schema_version",
  "mi_migration_interrupted",
  "mi_auth_hash", // PIN quick-unlock hash (point 6) — not vault security material
  PIN_WRAP_KEY,   // wrapped-key envelope, same storage class as mi_vault itself
  "mi_is_demo",   // demo marker — must be readable while locked to gate demo/real transitions
]);

let dek = null;                    // in-memory only
const plaintextCache = new Map();  // mi_* key -> decrypted string value
let installed = false;
let pendingWrites = 0;             // in-flight async encrypt+persist ops

const native = {
  getItem: Storage.prototype.getItem,
  setItem: Storage.prototype.setItem,
  removeItem: Storage.prototype.removeItem,
};
function nativeGet(key) { return native.getItem.call(localStorage, key); }
function nativeSet(key, value) { return native.setItem.call(localStorage, key, value); }
function nativeRemove(key) { return native.removeItem.call(localStorage, key); }

function isManaged(key) { return typeof key === "string" && key.startsWith("mi_") && !EXEMPT_KEYS.has(key); }

/** Ciphertext blobs are distinguishable from plaintext app data by exact shape. */
function isCiphertextShape(raw) {
  try {
    const o = JSON.parse(raw);
    return !!o && typeof o === "object" && o.v === 1 && typeof o.iv === "string" && typeof o.data === "string" && Object.keys(o).length === 3;
  } catch { return false; }
}

export function hasVault() { return nativeGet(VAULT_KEY) !== null; }
export function isUnlocked() { return dek !== null; }
/**
 * True when code that reads AND writes managed keys (the version-gated data
 * migrations) can actually see the record: the interception is not installed
 * (demo installs keep plaintext storage) or the vault is unlocked. While
 * installed-but-locked every managed read is null and every managed write is
 * dropped, so a migration would run against an apparently empty record, stamp
 * its version anyway, and never run again (DEC-069).
 */
export function canReadManagedKeys() { return !installed || dek !== null; }

/**
 * Demo mode: the fictional dataset loaded with NO vault (public demo origin).
 * Such an install has nothing to protect — the record is fictional and, on
 * demo.insinahealth.com, lives in a separate origin's storage entirely. Callers
 * use this to skip the encryption interception and the lock screen so a visitor
 * lands straight in the app instead of being asked to create a password.
 *
 * Safety: hasVault() ALWAYS wins. The moment a real vault exists this returns
 * false, so a real record can never be served unlocked or unencrypted. The
 * marker itself is only written by the demo loaders, which refuse to run when
 * any real record is present.
 */
export function isDemoMode() {
  return !hasVault() && nativeGet("mi_is_demo") === "1";
}

/** Every mi_* key name currently present, managed or not — for migration/enumeration only. */
function allManagedKeyNames() {
  const names = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (isManaged(k)) names.push(k);
  }
  return names;
}

// ── Interception ──────────────────────────────────────────────────────────
export function installInterception() {
  if (installed) return;
  installed = true;
  Storage.prototype.getItem = function (key) {
    if (this === localStorage && isManaged(key)) {
      if (dek === null) return null; // locked: fail safe, never leak ciphertext to app code expecting plaintext JSON
      return plaintextCache.has(key) ? plaintextCache.get(key) : null;
    }
    return native.getItem.call(this, key);
  };
  Storage.prototype.setItem = function (key, value) {
    if (this === localStorage && isManaged(key)) {
      if (dek === null) { console.warn(`[secureStorage] setItem("${key}") while locked: ignored`); return; }
      plaintextCache.set(key, String(value));
      persistEncrypted(key, String(value));
      return;
    }
    return native.setItem.call(this, key, value);
  };
  Storage.prototype.removeItem = function (key) {
    if (this === localStorage && isManaged(key)) {
      plaintextCache.delete(key);
      // Deletion never needs the DEK — you're erasing, not decrypting — so
      // always clear the real ciphertext too, even while locked. The former
      // `if (dek !== null)` guard meant the "Erase & Start Fresh" reset (which
      // runs entirely from the lock screen) removed only the exempt keys and
      // left every encrypted health blob orphaned on disk (data remanence,
      // P-02 spec point 9 / DEC-027).
      nativeRemove(key);
      return;
    }
    return native.removeItem.call(this, key);
  };
}

function persistEncrypted(key, plaintext) {
  pendingWrites++;
  vault.encryptString(dek, plaintext)
    .then(blob => { nativeSet(key, JSON.stringify({ v: 1, iv: blob.iv, data: blob.data })); })
    .catch(e => console.error(`[secureStorage] failed to persist "${key}":`, e))
    .finally(() => { pendingWrites--; });
}

/** Best-effort: wait for any in-flight encrypt+persist ops (e.g. before navigation/unload). */
export async function flushPendingWrites(timeoutMs = 2000) {
  const start = Date.now();
  while (pendingWrites > 0 && Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 10));
  }
}

// ── Raw-ciphertext escape hatch (Drive sync only) ────────────────────────
// Drive sync must upload/download ciphertext blobs, never the transparently-
// decrypted view getItem() returns — these bypass interception entirely.
export function isManagedKey(key) { return isManaged(key); }
export function getRawCiphertext(key) { return nativeGet(key); }
/**
 * Write a raw ciphertext blob (or the vault envelope) directly to storage WITHOUT
 * the DEK — the restore-before-unlock primitive. A wiped/new device restoring from
 * Drive or a backup file lands the envelope + already-encrypted blobs here while
 * still locked; the blobs stay under their ORIGINAL DEK and are decrypted on the
 * next unlock (which unwraps that DEK from the restored envelope). Bypasses the
 * interception's "ignore managed writes while locked" guard on purpose.
 */
export function importRawCiphertext(key, raw) { nativeSet(key, raw); }
export function allManagedKeys() { return allManagedKeyNames(); }
/** Decrypt a raw ciphertext blob string (as returned by getRawCiphertext) with the live DEK. */
export async function decryptRaw(raw) {
  if (raw == null) return null;
  if (!isCiphertextShape(raw)) return raw; // not encrypted (shouldn't happen post-migration, but fail open to the value itself rather than throwing)
  const blob = JSON.parse(raw);
  return vault.decryptString(dek, { iv: blob.iv, data: blob.data });
}
/** Encrypt a plaintext string with the live DEK and write raw ciphertext + update the in-memory cache. */
export async function setEncrypted(key, plaintext) {
  const blob = await vault.encryptString(dek, plaintext);
  nativeSet(key, JSON.stringify({ v: 1, iv: blob.iv, data: blob.data }));
  plaintextCache.set(key, plaintext);
}
/** Write a raw ciphertext blob directly (e.g. a value pulled from Drive, already encrypted under the same DEK) and refresh the cache. */
export async function setRawCiphertext(key, raw) {
  nativeSet(key, raw);
  plaintextCache.set(key, await decryptRaw(raw));
}
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => { if (pendingWrites > 0) flushPendingWrites(200); });
}

// ── Unlock / lock ─────────────────────────────────────────────────────────

async function loadCacheFromCiphertext() {
  plaintextCache.clear();
  for (const key of allManagedKeyNames()) {
    const raw = nativeGet(key);
    if (raw == null) continue;
    if (!isCiphertextShape(raw)) continue; // pre-migration plaintext left in place until migrateToVault() runs
    const blob = JSON.parse(raw);
    const plain = await vault.decryptString(dek, { iv: blob.iv, data: blob.data });
    plaintextCache.set(key, plain);
  }
}

/** Unlock with the passphrase. Throws on wrong passphrase (AES-GCM auth tag failure via vault.js). */
export async function unlock(passphrase) {
  const raw = nativeGet(VAULT_KEY);
  if (!raw) throw new Error("No vault has been set up yet.");
  const envelope = JSON.parse(raw);
  dek = await vault.unlockWithPassphrase(passphrase, envelope);
  await loadCacheFromCiphertext();
  installInterception();
}

/** Unlock with the recovery key display string instead of the passphrase. */
export async function unlockWithRecovery(recoveryKeyDisplay) {
  const raw = nativeGet(VAULT_KEY);
  if (!raw) throw new Error("No vault has been set up yet.");
  const envelope = JSON.parse(raw);
  dek = await vault.unlockWithRecoveryKey(recoveryKeyDisplay, envelope);
  await loadCacheFromCiphertext();
  installInterception();
}

/** Clear the DEK and plaintext cache from memory. A subsequent read of any managed key returns null until unlock() runs again. */
export function lock() {
  dek = null;
  plaintextCache.clear();
}

// ── PIN quick-unlock (companion) ──────────────────────────────────────────
// Phone-appropriate friction: the full passphrase is entered once on the
// device, then a short PIN wraps the SAME DEK under a PIN-derived KEK
// (PBKDF2, same 600k iterations as the passphrase path). The passphrase
// remains the root secret; the PIN envelope is a per-device convenience.
//
// Honest threat model: a 4-6 digit PIN cannot resist an offline brute force
// by someone who copies the device's storage — that protection comes from
// the passphrase envelope plus the phone's own device lock. What the PIN
// path adds ONLINE is a hard attempt limit: 5 wrong PINs deletes the PIN
// envelope entirely, forcing the full passphrase. (Same tradeoff every
// banking app makes; logged as a decision, not buried here.)

const PIN_MAX_ATTEMPTS = 5;
const b64 = (bytes) => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };
const unb64 = (str) => { const bin = atob(str); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };

export function hasPinQuickUnlock() { return nativeGet(PIN_WRAP_KEY) !== null; }

export function clearPinQuickUnlock() { nativeRemove(PIN_WRAP_KEY); }

/** Attempts left before the PIN envelope self-destructs (null if no PIN set). */
export function pinAttemptsRemaining() {
  const raw = nativeGet(PIN_WRAP_KEY);
  if (!raw) return null;
  try { return Math.max(0, PIN_MAX_ATTEMPTS - (JSON.parse(raw).attempts || 0)); } catch { return null; }
}

/** Create (or replace) the PIN envelope. Vault must already be unlocked — the live DEK is what gets wrapped. */
export async function setupPinQuickUnlock(pin) {
  if (dek === null) throw new Error("Unlock with the passphrase before setting up a PIN.");
  const salt = vault.generateSalt();
  const kek = await vault.deriveKEK(String(pin), salt);
  const wrap = await vault.wrapDEK(dek, kek);
  nativeSet(PIN_WRAP_KEY, JSON.stringify({ v: 1, salt: b64(salt), wrap, attempts: 0 }));
}

/**
 * Unlock with the device PIN. Wrong PIN increments the attempt counter;
 * hitting the limit deletes the PIN envelope (passphrase required, then a
 * new PIN can be created). Throws with a patient-readable message.
 */
export async function unlockWithPin(pin) {
  const raw = nativeGet(PIN_WRAP_KEY);
  if (!raw) throw new Error("No PIN is set on this device.");
  const blob = JSON.parse(raw);
  const kek = await vault.deriveKEK(String(pin), unb64(blob.salt));
  try {
    dek = await vault.unwrapDEK(blob.wrap, kek);
  } catch {
    blob.attempts = (blob.attempts || 0) + 1;
    if (blob.attempts >= PIN_MAX_ATTEMPTS) {
      nativeRemove(PIN_WRAP_KEY);
      throw new Error("Too many wrong PINs: PIN unlock is disabled. Unlock with your passphrase to set a new PIN.");
    }
    nativeSet(PIN_WRAP_KEY, JSON.stringify(blob));
    throw new Error(`Wrong PIN: ${PIN_MAX_ATTEMPTS - blob.attempts} attempt${PIN_MAX_ATTEMPTS - blob.attempts === 1 ? "" : "s"} left.`);
  }
  blob.attempts = 0;
  nativeSet(PIN_WRAP_KEY, JSON.stringify(blob));
  await loadCacheFromCiphertext();
  installInterception();
}

// ── First-time setup + migration ─────────────────────────────────────────

/**
 * Create a new vault (generates DEK + recovery key, wraps DEK under the
 * given passphrase) and migrate every existing plaintext mi_* value to
 * ciphertext in place. Per spec point 8: backup-export first (caller's
 * responsibility — LockScreen triggers the download before calling this),
 * encrypt in place, round-trip verify each value before it's considered
 * migrated, only then is the interrupted flag cleared. Resumable: a value
 * already in ciphertext shape (from a prior interrupted attempt) is skipped,
 * not double-encrypted.
 *
 * Critical ordering for resumability: the envelope (mi_vault) is persisted
 * BEFORE any data is encrypted, so the DEK is fixed for the entire
 * migration. If this were generated fresh on every call, a retry after an
 * interrupted first attempt would derive a *different* DEK and permanently
 * orphan any keys already encrypted under the first one — undecryptable by
 * either envelope. Resuming instead re-derives the SAME DEK by unwrapping
 * the already-persisted envelope with the passphrase the patient re-enters.
 *
 * Returns { recoveryKeyDisplay } — the caller must show this to the patient
 * exactly once on first setup; null on a resumed migration (already shown).
 *
 * Guarded against concurrent invocation (e.g. React 18 StrictMode's
 * intentional double-invoke in dev, or a double form submit): a second call
 * racing the first would read the first's partially-written envelope as
 * "resuming," derive its own DEK instance, and run its own encryption loop
 * concurrently against the same keys — no data loss (same underlying DEK
 * bytes either way, and each write is a full encrypt-verify-write), but a
 * genuine race with no benefit. One in-flight migration at a time.
 */
let migrationInFlight = null;
export function setupVaultAndMigrate(passphrase) {
  if (migrationInFlight) return migrationInFlight;
  migrationInFlight = doSetupVaultAndMigrate(passphrase).finally(() => { migrationInFlight = null; });
  return migrationInFlight;
}

async function doSetupVaultAndMigrate(passphrase) {
  const existingRaw = nativeGet(VAULT_KEY);
  const resuming = nativeGet(MIGRATION_INTERRUPTED_KEY) !== null;

  if (existingRaw && !resuming) {
    throw new Error("A vault already exists. Use unlock(), not setup, for an existing installation.");
  }

  let recoveryKeyDisplay = null;
  if (resuming && existingRaw) {
    const envelope = JSON.parse(existingRaw);
    dek = await vault.unlockWithPassphrase(passphrase, envelope); // must be the SAME passphrase as the original attempt
  } else {
    nativeSet(MIGRATION_INTERRUPTED_KEY, "1");
    const result = await vault.setupVault(passphrase);
    dek = result.dek;
    recoveryKeyDisplay = result.recoveryKeyDisplay;
    nativeSet(VAULT_KEY, JSON.stringify(result.envelope)); // persisted BEFORE encrypting anything else
  }

  const keys = allManagedKeyNames();
  for (const key of keys) {
    const raw = nativeGet(key);
    if (raw == null) continue;
    if (isCiphertextShape(raw)) {
      // Already migrated (a resumed attempt reaching a key encrypted before
      // the interruption) — decrypt into the cache rather than skipping outright,
      // or a resume leaves this key unreadable until the next full unlock.
      const blob = JSON.parse(raw);
      plaintextCache.set(key, await vault.decryptString(dek, { iv: blob.iv, data: blob.data }));
      continue;
    }
    const blob = await vault.encryptString(dek, raw);
    const verify = await vault.decryptString(dek, blob); // round-trip verify BEFORE overwriting plaintext
    if (verify !== raw) throw new Error(`Round-trip verification failed for "${key}": migration aborted, plaintext left untouched.`);
    nativeSet(key, JSON.stringify({ v: 1, iv: blob.iv, data: blob.data }));
    plaintextCache.set(key, raw);
  }

  nativeRemove(MIGRATION_INTERRUPTED_KEY);
  installInterception();
  appendAudit({ action: "vaultSetup", migratedKeys: keys.length, resumed: resuming });
  return { recoveryKeyDisplay };
}

export function hasInterruptedVaultMigration() {
  return nativeGet(MIGRATION_INTERRUPTED_KEY) !== null;
}

/** Change the passphrase. Re-wraps the DEK only — no data is re-encrypted (spec point 2). Requires an unlocked vault. */
export async function changePassphrase(newPassphrase) {
  if (dek === null) throw new Error("Vault must be unlocked to change the passphrase.");
  const raw = nativeGet(VAULT_KEY);
  const envelope = JSON.parse(raw);
  const newEnvelope = await vault.rewrapWithNewPassphrase(dek, newPassphrase, envelope);
  nativeSet(VAULT_KEY, JSON.stringify(newEnvelope));
  appendAudit({ action: "vaultPassphraseChanged" });
}
