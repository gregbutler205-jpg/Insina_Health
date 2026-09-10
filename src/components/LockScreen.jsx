import { useState, useEffect } from "react";
import * as secureStorage from "../lib/secureStorage.js";
import PasswordInput from "./PasswordInput.jsx"; // WO-5: show/hide toggle
import { runMigrations } from "../lib/migrations.js";
import { initGoogleAuth, ensureAccessToken } from "../lib/googleAuth.js";
import { restoreFromDrive } from "../lib/driveSync.js";
import { isEncryptedBackupPayload, restoreEncryptedBackup } from "../lib/folderBackup.js";

const LOGO = import.meta.env.BASE_URL + "logo-white.png";

// ── P-02 / PG-10 ───────────────────────────────────────────────────────────
// Replaces the old 4-digit-PIN LockScreen. The passphrase IS the encryption
// key (via PBKDF2 -> AES-GCM, see src/lib/vault.js) — a PIN gating only the
// UI would protect nothing in a non-custodial, server-less architecture.
// SCOPE NOTE: spec point 6 allows the old PIN to remain as an optional
// in-session "quick-unlock" convenience layered in front of an already-
// unlocked vault. Not built in this pass — every unlock goes through the
// real passphrase (or the recovery key). Convenience quick-unlock is
// deferred, tracked in DECISIONS.md.
export default function LockScreen({ onUnlock }) {
  const [mode, setMode] = useState(() => {
    if (secureStorage.hasInterruptedVaultMigration() && secureStorage.hasVault()) return "resume";
    return secureStorage.hasVault() ? "enter" : "setup-intro";
  });

  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [recoveryInput, setRecoveryInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recoveryKeyDisplay, setRecoveryKeyDisplay] = useState(null);
  const [recoverySaved, setRecoverySaved] = useState(false);
  const [wipeConfirm, setWipeConfirm] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => { setError(""); }, [mode]);
  // Init Google sign-in early so "Restore from Google Drive" is ready on a fresh device.
  useEffect(() => { try { initGoogleAuth(); } catch { /* GIS not loaded yet — button retries */ } }, []);

  // v1.38.0 — same recovery, from a backup FILE (folder backup or a downloaded
  // Drive-format backup). Encrypted files restore raw (envelope + ciphertext)
  // exactly like the Drive path; plaintext exports are pointed at the Tab13
  // import, which needs an unlocked record. Never destructive.
  function handleFileRestore() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (!isEncryptedBackupPayload(data)) {
            setError("That file is a readable export, not an encrypted backup. Set up (or unlock) your record first, then restore it from Settings → Export & Backup.");
            return;
          }
          const result = restoreEncryptedBackup(data);
          if (!result?.hasEnvelope) {
            setError("This backup has no key envelope, so it can't rebuild a device on its own. Use a newer backup file.");
            return;
          }
          window.location.reload(); // vault now present → unlock with your password or recovery key
        } catch (err) {
          setError(err?.code === "envelope-mismatch"
            ? "That backup belongs to a different vault (different password) than the one on this device."
            : "Restore failed: " + (err?.message || "that doesn't look like an Insina backup file."));
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  // #50 — new/wiped-device recovery: pull the Drive backup (envelope + ciphertext),
  // land it locally, then reload into the normal unlock screen. Never destructive.
  async function handleDriveRestore() {
    setRestoring(true); setError("");
    try {
      const token = await ensureAccessToken();
      const result = await restoreFromDrive(token);
      if (!result) { setError("No Google Drive backup was found for this account."); setRestoring(false); return; }
      if (!result.hasEnvelope) {
        setError("This Drive backup predates recoverable restore (no key envelope). Restore from a downloaded backup file instead.");
        setRestoring(false); return;
      }
      window.location.reload(); // vault now present → unlock with your password or recovery key
    } catch (err) {
      setError("Drive restore failed: " + (err?.message || "try again") + ".");
      setRestoring(false);
    }
  }

  async function handleSetupSubmit(e) {
    e.preventDefault();
    if (passphrase.length < 12) { setError("Use at least 12 characters. This password is the actual encryption key, not just a screen lock."); return; }
    if (passphrase !== confirmPassphrase) { setError("Passwords don't match."); return; }
    setBusy(true); setError("");
    try {
      // #49: never carry demo data into a real vault. If the device is running
      // the demo (unambiguous marker), clear it so the new vault starts clean.
      if (localStorage.getItem("mi_is_demo") === "1") {
        Object.keys(localStorage).filter(k => k.startsWith("mi_")).forEach(k => localStorage.removeItem(k));
      }
      downloadPreMigrationBackup();
      const result = await secureStorage.setupVaultAndMigrate(passphrase);
      // ONBOARDING_SPEC v1.1 §2: a vault created in THIS session marks a new
      // install even when the page booted with an old vault that was since
      // erased (Erase & Start Fresh → set up again without a reload).
      try { sessionStorage.setItem("insina_fresh_vault", "1"); } catch { /* non-fatal */ }
      setRecoveryKeyDisplay(result.recoveryKeyDisplay);
      setMode("show-recovery");
    } catch (err) {
      setError(err.message || "Setup failed. Your existing data was not touched.");
    } finally {
      setBusy(false);
    }
  }

  async function handleResumeSubmit(e) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await secureStorage.setupVaultAndMigrate(passphrase); // same passphrase as the original attempt — re-derives the same DEK
      afterUnlock();
    } catch (err) {
      setError("That password didn't unlock the in-progress vault. Enter the exact password you set the first time.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlockSubmit(e) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await secureStorage.unlock(passphrase);
      afterUnlock();
    } catch {
      setError("Incorrect password.");
    } finally {
      setBusy(false);
      setPassphrase("");
    }
  }

  async function handleRecoverySubmit(e) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await secureStorage.unlockWithRecovery(recoveryInput);
      afterUnlock();
    } catch {
      setError("That recovery key didn't work. Check it against the copy you saved at setup.");
    } finally {
      setBusy(false);
    }
  }

  /** Every mi_* value the app read at boot (before this unlock) came back
   * null (locked, fail-safe) — so anything that ran at startup ran against
   * an apparently-empty record and must re-run now that it's decrypted:
   * 1. Data migrations (A-08 rails). The boot-time runMigrations() in
   *    main.jsx can't see managed keys while locked, so any migration that
   *    touches actual health data (A-12's mi_readings normalization onward)
   *    only truly runs here. Idempotent by contract, so re-running is safe.
   * 2. Engines like the A-01 tripwire evaluator, re-triggered via
   *    mi-data-synced (dispatched after migrations so they see final shapes). */
  function afterUnlock() {
    runMigrations();
    window.dispatchEvent(new Event("mi-data-synced"));
    onUnlock();
  }

  function downloadPreMigrationBackup() {
    try {
      const snapshot = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        // Raw read, not localStorage.getItem(): interception is installed at
        // boot and returns null for any managed key while locked (which is
        // exactly the case here — the vault doesn't exist yet). Before
        // migration runs, the raw stored value for a managed key IS still
        // plaintext, so a raw read is both safe and the only way to see it.
        if (key?.startsWith("mi_")) snapshot[key] = secureStorage.getRawCiphertext(key);
      }
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `insina-backup-pre-encryption-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { console.warn("[LockScreen] pre-migration backup failed:", e); }
  }

  function downloadRecoveryKey() {
    const blob = new Blob([
      `Insina Health: Recovery Key\n\nGenerated: ${new Date().toLocaleString()}\n\n${recoveryKeyDisplay}\n\nThis is the ONLY way to recover your data if you forget your password.\nThere is no password reset: Insina Health has no server and no copy of\nyour password or this key. Store this somewhere safe and separate from\nyour password (a password manager, a safe, or printed and filed).\n`
    ], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "insina-health-recovery-key.txt";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function handleWipe() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith("mi_"));
    keys.forEach(k => localStorage.removeItem(k));
    sessionStorage.removeItem("mi_unlocked");
    setWipeConfirm(false);
    setMode("setup-intro");
    setPassphrase(""); setConfirmPassphrase(""); setRecoveryInput(""); setError("");
  }

  return (
    <div style={styles.wrap}>
      <style>{css}</style>
      <div className="lock-wrap" style={styles.inner}>
        <img src={LOGO} alt="Insina Health" style={styles.logo} />

        {mode === "setup-intro" && (
          <>
            <Title>Encrypt your health record</Title>
            <Subtitle>
              Choose a password. It becomes the actual encryption key for your data: 
              not just a screen lock. There is no password reset: if you forget it,
              the recovery key shown after setup is the only way back in.
            </Subtitle>
            <form onSubmit={handleSetupSubmit} style={styles.form}>
              <PasswordInput autoFocus placeholder="New password (12+ characters)" value={passphrase}
                onChange={e => setPassphrase(e.target.value)} style={styles.input} />
              <PasswordInput placeholder="Confirm password" value={confirmPassphrase}
                onChange={e => setConfirmPassphrase(e.target.value)} style={styles.input} />
              {error && <div style={styles.error}>{error}</div>}
              <button type="submit" disabled={busy} style={styles.primaryBtn}>
                {busy ? "Encrypting your record…" : "Create password & encrypt"}
              </button>
            </form>
            <div style={styles.divider}><span style={styles.dividerText}>already have a record?</span></div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button type="button" onClick={handleDriveRestore} disabled={restoring} style={styles.secondaryBtn}>
                {restoring ? "Restoring from Google Drive…" : "Restore from Google Drive"}
              </button>
              <button type="button" onClick={handleFileRestore} disabled={restoring} style={styles.secondaryBtn}>
                Restore from a backup file
              </button>
            </div>
            <div style={{ fontSize: 12, color: "#8299ad", fontFamily: "'DM Mono',monospace", textAlign: "center", marginTop: 6, lineHeight: 1.6 }}>
              Rebuilds this device from your Drive backup or an encrypted backup file (folder backups included). You'll unlock with your existing password or recovery key.
            </div>
          </>
        )}

        {mode === "resume" && (
          <>
            <Title>Finish encrypting</Title>
            <Subtitle>
              A previous setup attempt didn't finish. Enter the exact password you
              set then to resume. Nothing was lost, and your plaintext data was not
              touched until every value is verified.
            </Subtitle>
            <form onSubmit={handleResumeSubmit} style={styles.form}>
              <PasswordInput autoFocus placeholder="Your password" value={passphrase}
                onChange={e => setPassphrase(e.target.value)} style={styles.input} />
              {error && <div style={styles.error}>{error}</div>}
              <button type="submit" disabled={busy} style={styles.primaryBtn}>
                {busy ? "Resuming…" : "Resume encryption"}
              </button>
            </form>
          </>
        )}

        {mode === "show-recovery" && (
          <>
            <Title>Save your recovery key</Title>
            <Subtitle>
              Shown once. This is the only way to unlock your data if you forget your
              password: Insina Health cannot reset it for you.
            </Subtitle>
            <div style={styles.recoveryBox}>{recoveryKeyDisplay}</div>
            <button type="button" onClick={downloadRecoveryKey} style={styles.secondaryBtn}>Download as file</button>
            <label style={styles.checkboxRow}>
              <input type="checkbox" checked={recoverySaved} onChange={e => setRecoverySaved(e.target.checked)} />
              <span>I've saved this recovery key somewhere safe</span>
            </label>
            <button type="button" disabled={!recoverySaved} onClick={afterUnlock}
              style={{ ...styles.primaryBtn, opacity: recoverySaved ? 1 : 0.5 }}>
              Continue to Insina Health
            </button>
          </>
        )}

        {mode === "enter" && (
          <>
            <Title>Insina Health is locked</Title>
            <Subtitle>Enter your password to unlock your record.</Subtitle>
            <form onSubmit={handleUnlockSubmit} style={styles.form}>
              <PasswordInput autoFocus placeholder="Password" value={passphrase}
                onChange={e => setPassphrase(e.target.value)} style={styles.input} />
              {error && <div style={styles.error}>{error}</div>}
              <button type="submit" disabled={busy} style={styles.primaryBtn}>{busy ? "Unlocking…" : "Unlock"}</button>
            </form>
            <button type="button" onClick={() => setMode("recovery")} style={styles.linkBtn}>Forgot your password?</button>
          </>
        )}

        {mode === "recovery" && (
          <>
            <Title>Recovery key</Title>
            <Subtitle>Enter the recovery key you saved when you set up encryption.</Subtitle>
            <form onSubmit={handleRecoverySubmit} style={styles.form}>
              <input type="text" autoFocus placeholder="XXXXXXXX-XXXXXXXX-…" value={recoveryInput}
                onChange={e => setRecoveryInput(e.target.value.toUpperCase())} style={{ ...styles.input, fontFamily: "'DM Mono',monospace", fontSize: 13 }} />
              {error && <div style={styles.error}>{error}</div>}
              <button type="submit" disabled={busy} style={styles.primaryBtn}>{busy ? "Unlocking…" : "Unlock with recovery key"}</button>
            </form>
            <button type="button" onClick={() => setMode("enter")} style={styles.linkBtn}>Back to password</button>
            {!wipeConfirm ? (
              <button type="button" onClick={() => setWipeConfirm(true)} style={{ ...styles.linkBtn, color: "#8299ad", marginTop: 18 }}>
                Lost the recovery key too?
              </button>
            ) : (
              <div style={styles.wipeBox}>
                <div style={{ fontSize: 13, color: "#f87171", marginBottom: 12, lineHeight: 1.5 }}>
                  Without your password or recovery key, your encrypted data cannot be
                  decrypted by anyone, including Insina Health. The only remaining option
                  is to <strong>erase it and start fresh</strong>. This cannot be undone.
                </div>
                <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                  <button onClick={() => setWipeConfirm(false)} style={styles.secondaryBtn}>Cancel</button>
                  <button onClick={handleWipe} style={styles.dangerBtn}>Erase & Start Fresh</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Title({ children }) { return <div style={styles.title}>{children}</div>; }
function Subtitle({ children }) { return <div style={styles.subtitle}>{children}</div>; }

const styles = {
  wrap: { position: "fixed", inset: 0, background: "#07090f", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Sora', sans-serif", userSelect: "none" },
  inner: { display: "flex", flexDirection: "column", alignItems: "center", width: "100%", maxWidth: 380, padding: "0 24px" },
  logo: { width: 260, height: "auto", objectFit: "contain", marginBottom: 28, opacity: .9 },
  title: { fontFamily: "'DM Serif Display',serif", fontSize: 22, color: "#dde8f5", marginBottom: 8, textAlign: "center" },
  subtitle: { fontSize: 12, color: "#8aa0b8", fontFamily: "'DM Mono',monospace", marginBottom: 24, textAlign: "center", lineHeight: 1.6 },
  form: { width: "100%", display: "flex", flexDirection: "column", gap: 10 },
  input: { width: "100%", padding: "12px 14px", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, color: "#dde8f5", fontSize: 14, fontFamily: "'Sora',sans-serif" },
  error: { fontSize: 12, color: "#f87171", fontFamily: "'DM Mono',monospace", textAlign: "center" },
  primaryBtn: { width: "100%", padding: "13px 0", background: "rgba(79,142,247,.15)", border: "1px solid rgba(79,142,247,.4)", borderRadius: 10, color: "#7eb8d8", fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 4 },
  secondaryBtn: { padding: "9px 16px", background: "transparent", border: "1px solid #1a2f4a", borderRadius: 8, color: "#b0c4d8", fontSize: 12, cursor: "pointer", marginBottom: 14 },
  dangerBtn: { padding: "9px 16px", background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.35)", borderRadius: 8, color: "#f87171", fontSize: 12, cursor: "pointer" },
  linkBtn: { background: "transparent", border: "none", color: "#6ea3ff", fontSize: 12.5, cursor: "pointer", fontFamily: "'DM Mono',monospace", padding: "10px 0" },
  recoveryBox: { width: "100%", padding: "16px", background: "rgba(79,142,247,.06)", border: "1px solid rgba(79,142,247,.3)", borderRadius: 10, color: "#dde8f5", fontFamily: "'DM Mono',monospace", fontSize: 13, textAlign: "center", letterSpacing: 1, lineHeight: 1.8, marginBottom: 14, wordBreak: "break-all" },
  checkboxRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#b0c4d8", marginBottom: 16, cursor: "pointer" },
  wipeBox: { marginTop: 16, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)", borderRadius: 12, padding: "16px 18px", textAlign: "center" },
  divider: { display: "flex", alignItems: "center", justifyContent: "center", width: "100%", margin: "20px 0 12px", borderTop: "1px solid rgba(255,255,255,.08)", position: "relative" },
  dividerText: { position: "absolute", top: -8, background: "#07090f", padding: "0 10px", fontSize: 12, letterSpacing: "1.5px", textTransform: "uppercase", color: "#8299ad", fontFamily: "'DM Mono',monospace" },
};

const css = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
  .lock-wrap { animation: fadeIn .35s ease both; }
`;
