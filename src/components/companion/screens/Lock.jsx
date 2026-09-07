// ── Companion vault gate — PIN quick-unlock in front of P-02 encrypted storage. ─
// Before this screen existed the companion rendered with the vault locked:
// every mi_* read returned null and every capture was silently dropped by the
// secureStorage interception (with a "saved" banner — silent data loss).
// The gate mirrors the web LockScreen's job on phone terms:
//   · vault + PIN set        → PIN pad (5 wrong tries deletes the PIN envelope)
//   · vault, no PIN          → passphrase once, then offer to create a PIN
//   · no vault (fresh phone) → create passphrase + show recovery key once,
//                              then offer a PIN — same setupVaultAndMigrate
//                              path as the web, so a legacy plaintext record
//                              on this device is migrated, not orphaned.
// After any unlock: runMigrations() (mirrors LockScreen.afterUnlock — the
// boot-time pass skips encrypted installs because the record reads null
// while locked).
import { useState } from "react";
import { C, mono, serif, sans, Btn, Card, SL } from "../companionUI.jsx";
import * as secureStorage from "../../../lib/secureStorage.js";
import { runMigrations } from "../../../lib/migrations.js";
import { signInWithRedirect } from "../../../lib/googleAuth.js";

const LOGO = import.meta.env.BASE_URL + "logo-white.png";

const inputStyle = {
  width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.b1}`,
  borderRadius: 10, padding: "13px 14px", color: C.p, fontSize: 16, fontFamily: mono,
  outline: "none", textAlign: "center", letterSpacing: "4px",
};

export default function Lock({ onUnlocked }) {
  const hasVault = secureStorage.hasVault();
  const [mode, setMode] = useState(() =>
    !hasVault ? "setup" : secureStorage.hasPinQuickUnlock() ? "pin" : "passphrase");

  // Shared post-unlock: data migrations first (see header comment), then
  // optionally detour through PIN creation before handing the app over.
  const [offerPin, setOfferPin] = useState(false);
  function finishUnlock({ offerPinSetup }) {
    runMigrations();
    if (offerPinSetup) { setOfferPin(true); setMode("set-pin"); return; }
    onUnlocked();
  }

  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
      background: C.bg, fontFamily: sans, textAlign: "center",
      padding: "calc(env(safe-area-inset-top) + 40px) 24px calc(env(safe-area-inset-bottom) + 32px)",
    }}>
      <img src={LOGO} alt="Insina Health" style={{ width: 96, height: 96, objectFit: "contain", marginBottom: 14, opacity: 0.95 }} />
      <div style={{ fontFamily: serif, fontSize: 24, color: C.p }}>Insina Health</div>
      <div style={{ fontSize: 12, color: C.s, fontFamily: mono, letterSpacing: "3px", textTransform: "uppercase", margin: "4px 0 26px" }}>
        {mode === "setup" ? "Protect your record" : "Unlock your record"}
      </div>

      <div style={{ width: "100%", maxWidth: 320, textAlign: "left" }}>
        {mode === "pin"        && <PinEntry onUnlocked={() => finishUnlock({ offerPinSetup: false })} onUsePassphrase={() => setMode("passphrase")} />}
        {mode === "passphrase" && <PassphraseEntry onUnlocked={() => finishUnlock({ offerPinSetup: !secureStorage.hasPinQuickUnlock() })} />}
        {mode === "setup"      && <VaultSetup onUnlocked={() => finishUnlock({ offerPinSetup: true })} />}
        {mode === "set-pin"    && offerPin && <PinSetup onDone={onUnlocked} />}
      </div>
    </div>
  );
}

// ── PIN pad ───────────────────────────────────────────────────────────────────
function PinEntry({ onUnlocked, onUsePassphrase }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (pin.length < 4 || busy) return;
    setBusy(true); setError("");
    try { await secureStorage.unlockWithPin(pin); onUnlocked(); }
    catch (e) {
      setPin(""); setError(e.message || "Wrong PIN.");
      // The envelope self-destructs after 5 misses — fall through to passphrase.
      if (!secureStorage.hasPinQuickUnlock()) { setTimeout(onUsePassphrase, 1600); }
    }
    finally { setBusy(false); }
  }

  return (
    <Card>
      <SL>Enter your PIN</SL>
      <input type="password" inputMode="numeric" pattern="[0-9]*" autoFocus maxLength={8}
        value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))}
        onKeyDown={e => e.key === "Enter" && submit()}
        placeholder="••••" style={inputStyle} />
      {error && <div style={{ fontSize: 12, color: C.red, fontFamily: mono, marginTop: 10, lineHeight: 1.5 }}>{error}</div>}
      <div style={{ marginTop: 12 }}>
        <Btn onClick={submit} disabled={busy || pin.length < 4}>{busy ? "Unlocking…" : "Unlock"}</Btn>
      </div>
      <button onClick={onUsePassphrase}
        style={{ width: "100%", marginTop: 12, background: "none", border: "none", color: C.ghost, fontSize: 12, fontFamily: mono, cursor: "pointer", padding: 6 }}>
        Use password instead
      </button>
    </Card>
  );
}

// ── Passphrase (existing vault, or PIN fallback) ──────────────────────────────
function PassphraseEntry({ onUnlocked }) {
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!pass || busy) return;
    setBusy(true); setError("");
    try { await secureStorage.unlock(pass); onUnlocked(); }
    catch { setError("That password didn't unlock the record. Check it and try again."); }
    finally { setBusy(false); }
  }

  return (
    <Card>
      <SL>Enter your password</SL>
      <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.6, marginBottom: 10 }}>
        The same password you use on the web app.
      </div>
      <input type="password" autoFocus value={pass} onChange={e => setPass(e.target.value)}
        onKeyDown={e => e.key === "Enter" && submit()}
        style={{ ...inputStyle, letterSpacing: "1px", textAlign: "left", fontSize: 14 }} />
      {error && <div style={{ fontSize: 12, color: C.red, fontFamily: mono, marginTop: 10, lineHeight: 1.5 }}>{error}</div>}
      <div style={{ marginTop: 12 }}>
        <Btn onClick={submit} disabled={busy || !pass}>{busy ? "Unlocking…" : "Unlock"}</Btn>
      </div>
      <div style={{ fontSize: 12, color: C.ghost, fontFamily: mono, lineHeight: 1.6, marginTop: 12 }}>
        Forgot it? Use your recovery key on the web app, then set a new password there.
      </div>
    </Card>
  );
}

// ── First-run vault setup (fresh device) ──────────────────────────────────────
function VaultSetup({ onUnlocked }) {
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState(null);
  const [recoverySaved, setRecoverySaved] = useState(false);

  async function submit() {
    if (busy) return;
    if (pass.length < 8) { setError("Use at least 8 characters."); return; }
    if (pass !== confirm) { setError("The two entries don't match."); return; }
    setBusy(true); setError("");
    try {
      const { recoveryKeyDisplay } = await secureStorage.setupVaultAndMigrate(pass);
      setRecoveryKey(recoveryKeyDisplay);
    } catch (e) { setError(e.message || "Setup failed. Try again."); }
    finally { setBusy(false); }
  }

  if (recoveryKey) {
    return (
      <Card>
        <SL>Save your recovery key</SL>
        <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.6, marginBottom: 10 }}>
          If you ever forget your password, this key is the ONLY way back into your record. Save it somewhere safe. It will not be shown again.
        </div>
        <div style={{ background: C.bg, border: `1px solid ${C.b1}`, borderRadius: 8, padding: "12px", fontFamily: mono, fontSize: 12, color: C.p, wordBreak: "break-all", lineHeight: 1.7 }}>
          {recoveryKey}
        </div>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, margin: "12px 0", cursor: "pointer" }}>
          <input type="checkbox" checked={recoverySaved} onChange={e => setRecoverySaved(e.target.checked)} style={{ marginTop: 2 }} />
          <span style={{ fontSize: 12, color: C.s, lineHeight: 1.5 }}>I've saved this key somewhere safe.</span>
        </label>
        <Btn onClick={onUnlocked} disabled={!recoverySaved}>Continue</Btn>
      </Card>
    );
  }

  return (
    <Card>
      <SL>Create a password</SL>
      <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.6, marginBottom: 10 }}>
        Your health record is encrypted on this device. Pick a password (8+ characters). You'll get a recovery key next, and can set a short PIN for everyday unlocks after that.
      </div>
      <input type="password" placeholder="Password" value={pass} onChange={e => setPass(e.target.value)}
        style={{ ...inputStyle, letterSpacing: "1px", textAlign: "left", fontSize: 14, marginBottom: 8 }} />
      <input type="password" placeholder="Confirm password" value={confirm} onChange={e => setConfirm(e.target.value)}
        onKeyDown={e => e.key === "Enter" && submit()}
        style={{ ...inputStyle, letterSpacing: "1px", textAlign: "left", fontSize: 14 }} />
      {error && <div style={{ fontSize: 12, color: C.red, fontFamily: mono, marginTop: 10, lineHeight: 1.5 }}>{error}</div>}
      <div style={{ marginTop: 12 }}>
        <Btn onClick={submit} disabled={busy || !pass || !confirm}>{busy ? "Setting up…" : "Encrypt my record"}</Btn>
      </div>
      {/* #50/sync: adopt the SAME vault as the web app so the phone and desktop
          share one key and sync both ways. Sets an intent flag, then the mobile
          OAuth redirect returns into CompanionApp, which runs the restore. */}
      <div style={{ borderTop: `1px solid ${C.b1}`, margin: "16px 0 10px" }} />
      <button
        onClick={() => { try { sessionStorage.setItem("insina_companion_restore", "1"); } catch { /* ignore */ } signInWithRedirect(); }}
        style={{ width: "100%", background: "none", border: `1px solid ${C.b1}`, borderRadius: 10, padding: "11px", color: C.p, fontSize: 12.5, fontFamily: sans, fontWeight: 600, cursor: "pointer" }}>
        Already use Insina? Restore from Google Drive
      </button>
      <div style={{ fontSize: 12, color: C.ghost, fontFamily: mono, lineHeight: 1.6, marginTop: 8 }}>
        Pulls your record from Drive and shares the web app's vault. Then unlock with your existing password.
      </div>
    </Card>
  );
}

// ── PIN creation (after a passphrase unlock) ──────────────────────────────────
function PinSetup({ onDone }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    if (pin.length < 4) { setError("Use at least 4 digits."); return; }
    if (pin !== confirm) { setError("The two PINs don't match."); return; }
    setBusy(true); setError("");
    try { await secureStorage.setupPinQuickUnlock(pin); onDone(); }
    catch (e) { setError(e.message || "Couldn't set the PIN. Try again."); }
    finally { setBusy(false); }
  }

  return (
    <Card>
      <SL>Set a quick-unlock PIN</SL>
      <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.6, marginBottom: 10 }}>
        Next time, unlock with a short PIN instead of the full password. Five wrong tries disables the PIN and asks for the password again.
      </div>
      <input type="password" inputMode="numeric" pattern="[0-9]*" placeholder="PIN (4–8 digits)" maxLength={8}
        value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))}
        style={{ ...inputStyle, marginBottom: 8 }} />
      <input type="password" inputMode="numeric" pattern="[0-9]*" placeholder="Confirm PIN" maxLength={8}
        value={confirm} onChange={e => setConfirm(e.target.value.replace(/\D/g, ""))}
        onKeyDown={e => e.key === "Enter" && submit()}
        style={inputStyle} />
      {error && <div style={{ fontSize: 12, color: C.red, fontFamily: mono, marginTop: 10, lineHeight: 1.5 }}>{error}</div>}
      <div style={{ marginTop: 12 }}>
        <Btn onClick={submit} disabled={busy || !pin || !confirm}>{busy ? "Saving…" : "Set PIN"}</Btn>
      </div>
      <button onClick={onDone}
        style={{ width: "100%", marginTop: 12, background: "none", border: "none", color: C.ghost, fontSize: 12, fontFamily: mono, cursor: "pointer", padding: 6 }}>
        Skip. Ask for my password each time
      </button>
    </Card>
  );
}
