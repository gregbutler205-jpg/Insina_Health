// ─────────────────────────────────────────────────────────────────────────────
// CompanionApp.jsx — Insina Health Mobile companion shell.
// Access via: insinahealth.com/?companion=1
// "Mobile captures. The web app organizes." Reads/writes the same mi_* record as
// the web app, synced via Google Drive. 5-tab bottom nav; Emergency Info and
// Doctor Visit Capture are reached from inside, not as their own tabs.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, Component } from "react";
import { initGoogleAuth, signInWithRedirect, extractTokenFromHash, getAccessToken, getStoredUser } from "../../lib/googleAuth.js";
import { fullSync, restoreFromDrive, getVaultFingerprint, readSyncDiag } from "../../lib/driveSync.js";
import { enqueue, flush } from "../../lib/outbox.js";
import { cleanupOldAudio } from "../../lib/visitCapture.js";
import { scheduleMedReminders, runOpenNotifications } from "../../lib/notify.js";
import { computePatternFlags } from "../../lib/patternFlags.js";
import { nextAppointment, daysUntil } from "../../lib/companionData.js";
import { C, mono, sans } from "./companionUI.jsx";
import AIMark from "../ai/AIMark.jsx";

import { isUnlocked, isDemoMode } from "../../lib/secureStorage.js";
import Lock       from "./screens/Lock.jsx";
import SignIn     from "./screens/SignIn.jsx";
import Today      from "./screens/Today.jsx";
import Meds       from "./screens/Meds.jsx";
import Log        from "./screens/Log.jsx";
import Care       from "./screens/Care.jsx";
import AILite     from "./screens/AILite.jsx";
import Emergency  from "./screens/Emergency.jsx";
import Settings   from "./screens/Settings.jsx";
import MedList    from "./screens/MedList.jsx";
import Surgeries  from "./screens/Surgeries.jsx";
import Cards      from "./screens/Cards.jsx";
import VisitFlow  from "./screens/visit/VisitFlow.jsx";

// Visit recording gets the center slot (camera-app pattern) — always one tap
// away. AI chat moves off the bar; it stays reachable from Today's quick
// actions and every "Ask Insina" handoff (tab key "ai" still routes).
// v1.58.3 (Greg): six uniform tabs. The AI spark joins the bar (the mark, as
// on the web nav row; visible regardless of the AI features flag, DEC-P51),
// Record is the same size as everything else and keeps only its red tint,
// and inactive tabs are no longer dimmed to a whisper.
const TABS = [
  { key: "today",  label: "Today",  icon: "🏠" },
  { key: "meds",   label: "Meds",   icon: "💊" },
  { key: "ai",     label: "AI",     icon: "mark" },
  { key: "record", label: "Record", icon: "record", action: true },
  { key: "log",    label: "Log",    icon: "➕" },
  { key: "care",   label: "Care",   icon: "📅" },
];

function fmtTime(ts) {
  return ts ? new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : null;
}

// ── Error boundary ────────────────────────────────────────────────────────────
class CompanionErrorBoundary extends Component {
  constructor(p) { super(p); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ background: C.bg, minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: mono }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
        <div style={{ fontSize: 14, color: C.red, fontWeight: 700, marginBottom: 8 }}>Companion failed to load</div>
        <div style={{ fontSize: 12, color: C.s, marginBottom: 20, textAlign: "center", lineHeight: 1.6 }}>{this.state.error?.message || "Unknown error"}</div>
        <button onClick={() => window.location.reload()} style={{ background: "rgba(79,142,247,.15)", border: "1px solid rgba(79,142,247,.3)", borderRadius: 8, padding: "10px 20px", color: C.blue, fontSize: 12, cursor: "pointer" }}>Reload</button>
      </div>
    );
  }
}

// ── Sync status bar (also the sign-in entry point) ────────────────────────────
function SyncBar({ syncState, lastSynced, onSync, vaultFp, diag }) {
  // The public demo has no Google account to connect and nothing to sync, so
  // the whole bar is noise there — the signed-out branch would invite a visitor
  // to sign in to a Drive that will never hold this fictional record.
  if (isDemoMode()) return null;
  const signedIn = !!getStoredUser();
  if (!signedIn) return (
    <div style={{ background: "#0d1a28", borderBottom: `1px solid ${C.b1}`, padding: "8px 16px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
      <span style={{ fontSize: 12, color: C.dim, flex: 1, fontFamily: mono }}>Connect Drive to sync with the web app</span>
      <button onClick={onSync} style={{ background: "rgba(79,142,247,.15)", border: `1px solid rgba(79,142,247,.3)`, borderRadius: 8, padding: "5px 12px", color: C.blue, fontSize: 12, fontFamily: mono, cursor: "pointer" }}>Sign in</button>
    </div>
  );
  return (
    <div style={{ background: "#0a1520", borderBottom: `1px solid ${C.b2}`, flexShrink: 0 }}>
      <div style={{ padding: "6px 16px", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: syncState === "done" ? C.green : syncState === "syncing" ? C.amber : C.ghost, boxShadow: syncState === "done" ? `0 0 5px ${C.green}60` : "none", flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 12, color: C.ghost, fontFamily: mono }}>
          {syncState === "syncing" ? "Syncing with Drive…" : syncState === "done" && lastSynced ? `Synced ${lastSynced}` : syncState === "error" ? "Sync failed. Tap to retry" : "Drive connected"}
          {vaultFp ? ` · key ${vaultFp}` : ""}
        </span>
        <button onClick={onSync} disabled={syncState === "syncing"} style={{ background: "none", border: "none", color: C.blue, fontSize: 12, fontFamily: mono, cursor: "pointer", opacity: syncState === "syncing" ? 0.4 : 1 }}>
          {syncState === "syncing" ? "…" : "↕ Sync"}
        </button>
      </div>
      {diag?.failed > 0 && (
        <div style={{ padding: "5px 16px 7px", fontSize: 12, color: C.amber, fontFamily: mono, lineHeight: 1.5 }}>
          ⚠ {diag.failed} item{diag.failed !== 1 ? "s" : ""} from Drive couldn't be read. If this key code doesn't match the one under
          Settings &amp; Backup on the web app, this phone holds a different vault key: use "Restore from Google Drive" here to re-key it.
        </div>
      )}
    </div>
  );
}

// ── Bottom tab bar ─────────────────────────────────────────────────────────────
const NAV_ICON = 22;
function NavIcon({ t, active }) {
  if (t.icon === "mark") {
    return (
      <span style={{ color: active ? C.blue : C.s, display: "inline-flex", height: NAV_ICON, alignItems: "center" }}>
        <AIMark variant="simple" size={NAV_ICON} />
      </span>
    );
  }
  if (t.icon === "record") {
    return (
      <span style={{ width: NAV_ICON, height: NAV_ICON, borderRadius: "50%", background: "linear-gradient(135deg, #ef4444, #b91c1c)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />
      </span>
    );
  }
  return <span style={{ fontSize: NAV_ICON, lineHeight: 1, display: "inline-flex", height: NAV_ICON, alignItems: "center" }}>{t.icon}</span>;
}

function NavTab({ t, active, onTab, onRecord }) {
  const isRecord = t.icon === "record";
  const labelColor = isRecord ? "#f87171" : active ? C.blue : C.dim;
  return (
    <button key={t.key} onClick={() => (t.action ? onRecord() : onTab(t.key))}
      aria-label={isRecord ? "Record a doctor visit" : t.label}
      aria-current={active ? "page" : undefined}
      style={{ flex: 1, background: "none", border: "none", cursor: "pointer", padding: "8px 0 9px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, borderTop: `2px solid ${active ? C.blue : "transparent"}`, opacity: active || isRecord ? 1 : 0.9 }}>
      <NavIcon t={t} active={active} />
      <span style={{ fontSize: 12, fontFamily: mono, letterSpacing: "0.5px", color: labelColor, fontWeight: 600 }}>{t.label}</span>
    </button>
  );
}

function BottomNav({ tab, onTab, onRecord }) {
  return (
    <nav style={{ display: "flex", alignItems: "stretch", borderTop: `1px solid ${C.b2}`, background: C.card, flexShrink: 0, paddingBottom: "env(safe-area-inset-bottom)" }}>
      {TABS.map(t => <NavTab key={t.key} t={t} active={tab === t.key} onTab={onTab} onRecord={onRecord} />)}
    </nav>
  );
}

// ── Root ────────────────────────────────────────────────────────────────────
function CompanionInner() {
  const [tab, setTab] = useState("today");
  const [logTab, setLogTab] = useState("vitals");    // which Log sub-screen to open
  const [aiPrompt, setAiPrompt] = useState(null);    // { prompt, surface } to auto-send when the AI tab opens
  const [overlay, setOverlay] = useState(null);      // { name: "emergency" } | { name: "visit", appt, visitId }
  const [online, setOnline] = useState(navigator.onLine);
  const [syncState, setSyncState] = useState("idle");
  const [lastSynced, setLastSynced] = useState(() => fmtTime(localStorage.getItem("mi_last_sync")));
  const [user, setUser] = useState(() => getStoredUser());
  const [skippedSignIn, setSkippedSignIn] = useState(false);

  // Sync diagnostics: this phone's vault-key fingerprint + last merge health,
  // so a key divergence from the web app is visible instead of a silent no-op.
  const [vaultFp, setVaultFp] = useState(null);
  const [syncDiag, setSyncDiag] = useState(() => readSyncDiag());
  useEffect(() => { getVaultFingerprint().then(setVaultFp).catch(() => {}); }, []);

  const runSync = useCallback((token) => {
    setSyncState("syncing");
    return fullSync(token)
      .then(ts => { setLastSynced(fmtTime(ts)); setSyncState("done"); setSyncDiag(readSyncDiag()); return flush(token); })
      .catch(() => setSyncState("error"));
  }, []);

  // Google auth init (popup path, desktop) + redirect-return token capture (mobile)
  useEffect(() => {
    initGoogleAuth({ onSignIn: ({ accessToken }) => { setUser(getStoredUser()); runSync(accessToken); } });
    const token = extractTokenFromHash();
    if (token) {
      // #50 companion restore: if the user chose "Restore from Google Drive" on
      // the setup screen, rebuild THIS phone's vault from Drive (envelope +
      // ciphertext) and reload into the unlock screen — so it shares the same
      // vault/key as the web app and can actually sync both ways.
      let restoring = false;
      try { restoring = sessionStorage.getItem("insina_companion_restore") === "1"; } catch { /* private mode */ }
      if (restoring) {
        try { sessionStorage.removeItem("insina_companion_restore"); } catch { /* ignore */ }
        restoreFromDrive(token)
          .then(result => { if (result && result.hasEnvelope) window.location.reload(); })
          .catch(() => {});
      } else {
        fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.json())
          .then(u => {
            const profile = { name: u.name, email: u.email, picture: u.picture };
            localStorage.setItem("mi_google_user", JSON.stringify(profile));
            setUser(profile);
          })
          .catch(() => {});
        runSync(token);
      }
    }
    // Housekeeping + best-effort local notifications on open
    cleanupOldAudio().catch(() => {});
    scheduleMedReminders();
    try { runOpenNotifications(computePatternFlags()); } catch { /* ignore */ }
  }, [runSync]);

  // Online/offline + re-sync and flush when returning to foreground / connection
  useEffect(() => {
    const up = () => { setOnline(true); const t = getAccessToken(); if (t) runSync(t); };
    const dn = () => setOnline(false);
    const vis = () => { if (document.visibilityState === "visible") { const t = getAccessToken(); if (t) runSync(t); } };
    window.addEventListener("online", up);
    window.addEventListener("offline", dn);
    document.addEventListener("visibilitychange", vis);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", dn); document.removeEventListener("visibilitychange", vis); };
  }, [runSync]);

  // Passed to capture screens: write-through already happened locally; queue a
  // Drive sync and try to flush now (no-op offline — it drains later).
  const queueSync = useCallback(() => {
    enqueue("drive-sync");
    const t = getAccessToken();
    if (t) runSync(t);
  }, [runSync]);

  const handleSync = useCallback(() => {
    const t = getAccessToken();
    if (t) runSync(t); else signInWithRedirect();
  }, [runSync]);

  const goTab        = (k) => { setOverlay(null); setTab(k); };
  const openLog      = (sub = "vitals") => { setOverlay(null); setLogTab(sub); setTab("log"); };
  // A-13: an optional surface tag rides along so symptom-prep handoffs run on
  // the Surface G system prompt (CSC + context gathering), not the generic one.
  const askAI        = (prompt, surface) => { setAiPrompt({ prompt, surface: surface || null }); setOverlay(null); setTab("ai"); };
  const openEmergency = () => setOverlay({ name: "emergency" });
  const openSettings  = () => setOverlay({ name: "settings" });
  const startVisit    = (appt) => setOverlay({ name: "visit", appt, visitId: null });
  // Center nav Record button: attach today's appointment automatically when one
  // exists; otherwise start an unattached visit ("Doctor visit", today's date).
  const recordVisit   = () => {
    const appt = nextAppointment();
    startVisit(appt && daysUntil(appt.date) === 0 ? appt : null);
  };
  const openVisit     = (visitId) => setOverlay({ name: "visit", appt: null, visitId });
  const openMedList   = () => setOverlay({ name: "medlist" });
  const openSurgeries = () => setOverlay({ name: "surgeries" });
  const openCards     = () => setOverlay({ name: "cards" });

  // Back: close an overlay (returns to the tab it was opened from), else a
  // non-Today tab returns to Today (an installed PWA has no browser back button).
  const back = () => { if (overlay) setOverlay(null); else if (tab !== "today") setTab("today"); };

  // P-02 vault gate — BEFORE anything renders or syncs. Without it the
  // companion ran locked: reads null, captures silently dropped.
  // Demo installs have no vault and nothing to protect, so they open directly
  // rather than being asked to create a password — the same allowance the web
  // app makes in App.jsx, and the one isDemoMode()'s own docstring describes
  // ("skip the encryption interception and the lock screen"). The companion
  // never implemented its half, so the public demo dead-ended on a setup
  // screen. isDemoMode() is false the moment a real vault exists, so this can
  // never serve a real record unlocked.
  const [unlocked, setUnlocked] = useState(() => isUnlocked() || isDemoMode());
  if (!unlocked) {
    return (
      <div style={{ background: C.bg, height: "100dvh", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column", fontFamily: sans, overflow: "hidden" }}>
        <Lock onUnlocked={() => {
          setUnlocked(true);
          // The mount-time sync ran against a locked store (merge writes were
          // dropped) — pull again now that the record can actually accept them.
          const t = getAccessToken();
          if (t) runSync(t);
          // v1.57.1: the redirect sign-in lands on a LOCKED app, so its
          // mi_google_user write was silently dropped (managed-key rule) —
          // every relaunch then showed "Connect Drive / Sign in" and no sync
          // ever ran on its own again (Greg's phone, 2026-09-01). Re-persist
          // the profile NOW, while the redirect's token is still alive and
          // the store can actually accept the write.
          if (t && !getStoredUser()) {
            fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${t}` } })
              .then(r => r.json())
              .then(u => {
                const profile = { name: u.name, email: u.email, picture: u.picture };
                localStorage.setItem("mi_google_user", JSON.stringify(profile));
                setUser(profile);
              })
              .catch(() => {});
          }
        }} />
      </div>
    );
  }

  // Sign-in gate: a full screen before the app handles Google connection. Optional —
  // "Continue without signing in" lets offline capture proceed.
  // Skipped in demo mode: there is no Google account to connect and nothing to
  // sync, so a visitor who just cleared the vault gate would otherwise land on
  // a second wall asking them to sign in.
  if (!user && !skippedSignIn && !isDemoMode()) {
    return (
      <div style={{ background: C.bg, height: "100dvh", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column", fontFamily: sans, overflow: "hidden" }}>
        <SignIn onSignIn={signInWithRedirect} onSkip={() => setSkippedSignIn(true)} />
      </div>
    );
  }

  return (
    <div style={{
      background: C.bg, height: "100dvh", width: "100%", maxWidth: 480, margin: "0 auto",
      display: "flex", flexDirection: "column", fontFamily: sans, overflow: "hidden", boxSizing: "border-box",
      paddingTop: "env(safe-area-inset-top)",
      paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)",
    }}>
      {!online && (
        <div style={{ background: "#141f00", borderBottom: "1px solid #3a5a00", padding: "5px 16px", fontSize: 12, color: "#a3e635", fontFamily: mono, textAlign: "center", flexShrink: 0 }}>
          📶 Offline. You can still capture; it’ll sync when you’re back online
        </div>
      )}
      <SyncBar syncState={syncState} lastSynced={lastSynced} onSync={handleSync} vaultFp={vaultFp} diag={syncDiag} />

      {/* Slim back bar on non-Today tabs (overlays render their own header back). */}
      {!overlay && tab !== "today" && (
        <button onClick={back} style={{ display: "flex", alignItems: "center", gap: 6, background: C.card, border: "none", borderBottom: `1px solid ${C.b2}`, color: C.blue, fontSize: 12, fontFamily: mono, padding: "8px 16px", cursor: "pointer", flexShrink: 0, textAlign: "left" }}>
          ← Back
        </button>
      )}

      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch", display: "flex", flexDirection: "column", minWidth: 0 }}>
        {overlay?.name === "emergency"  && <Emergency onBack={back} />}
        {overlay?.name === "settings"   && <Settings onBack={back} />}
        {overlay?.name === "medlist"    && <MedList onBack={back} />}
        {overlay?.name === "surgeries"  && <Surgeries onBack={back} />}
        {overlay?.name === "cards"      && <Cards onBack={back} queueSync={queueSync} />}
        {overlay?.name === "visit" && <VisitFlow appt={overlay.appt} visitId={overlay.visitId} onClose={back} queueSync={queueSync} />}
        {!overlay && tab === "today" && <Today goTab={goTab} openLog={openLog} openEmergency={openEmergency} openSettings={openSettings} openSurgeries={openSurgeries} openCards={openCards} startVisit={startVisit} lastSynced={lastSynced} />}
        {!overlay && tab === "meds"  && <Meds queueSync={queueSync} openMedList={openMedList} />}
        {!overlay && tab === "log"   && <Log queueSync={queueSync} initialTab={logTab} askAI={askAI} />}
        {!overlay && tab === "care"  && <Care startVisit={startVisit} openVisit={openVisit} />}
        {!overlay && tab === "ai"    && <AILite initialPrompt={aiPrompt?.prompt} initialSurface={aiPrompt?.surface} onPromptConsumed={() => setAiPrompt(null)} />}
      </div>

      {!overlay && <BottomNav tab={tab} onTab={goTab} onRecord={recordVisit} />}
    </div>
  );
}

export default function CompanionApp() {
  return <CompanionErrorBoundary><CompanionInner /></CompanionErrorBoundary>;
}
