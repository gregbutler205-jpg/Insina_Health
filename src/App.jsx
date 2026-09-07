import { useState, useEffect, useCallback } from "react";
import { getStore, setStore, mergeReadings, mergeMeds, mergeLabs, mergeRecords, addImportLog } from './store.js';
import { mkReading, saveReading, defaultVitalFlag, sortReadingsByRecency } from './lib/vitals.js';
import { checkVitalReading, checkVitalCrossFields } from './lib/plausibility.js';
import LockScreen from './components/LockScreen.jsx';
import OnboardingFlow from './components/onboarding/OnboardingFlow.jsx';
import { shouldOnboard } from './lib/onboardingState.js';
import { recordAppOpen } from './lib/taskEngine.js';
import AppSidebar from './components/AppSidebar.jsx';
import AdvisoryModal from './components/advisory/AdvisoryModal.jsx';
import EmergencyInfoButton from './components/advisory/EmergencyInfoButton.jsx';
import { SaveIcon } from './components/icons.jsx';
import { daysAgoLabel } from './lib/displaySafe.js';
import AIEntryButton from './components/ai/AIEntryButton.jsx';
import Dashboard from './components/dashboard/Dashboard.jsx';
import Bell from './components/dashboard/Bell.jsx';
import AvatarMenu from './components/dashboard/AvatarMenu.jsx';
import ReportsPage from './components/dashboard/ReportsPage.jsx';
import { toggleNavRail, useNavRail } from './components/AppSidebar.jsx';
import { PanelLeftClose, PanelLeftOpen, Search, Upload } from 'lucide-react';
import * as secureStorage from './lib/secureStorage.js';
import RIEWidget from './rie/ReviewQueuePanel.jsx';
import PreflightHost from './rie/PreflightHost.jsx';
import SearchPopup from './components/SearchPopup.jsx';
import { initGoogleAuth, signIn, signOut, getStoredUser, getAccessToken, clearSessionToken } from './lib/googleAuth.js';
import { getAutoLockMinutes } from './lib/autoLock.js';
import { fullSync, uploadWeeklyBackup, WEEKLY_INTERVAL_MS, collectLocalData } from './lib/driveSync.js';
import { attemptAutoFolderBackup, isFolderBackupSupported } from './lib/folderBackup.js';


// ── Tab component imports ─────────────────────────────────────────────────────
import TabProfile     from './components/tabs/Tab02.jsx';
import TabRecords     from './components/tabs/Tab03.jsx';
import TabMedications from './components/tabs/Tab04.jsx';
import TabLabs        from './components/tabs/Tab05.jsx';
import TabVitals      from './components/tabs/Tab06.jsx';
import TabSymptoms    from './components/tabs/Tab07.jsx';
import TabCareplan    from './components/tabs/Tab08.jsx';
import TabDocuments   from './components/tabs/Tab09.jsx';
import TabNotes       from './components/tabs/Tab10.jsx';
import TabAI          from './components/tabs/Tab11.jsx';
import TabImport       from './components/tabs/Tab12.jsx';
import TabBackup       from './components/tabs/Tab13.jsx';
import TabAppointments from './components/tabs/Tab14.jsx';
import TabConditions   from './components/tabs/Tab15.jsx';
import TabSurgeries    from './components/tabs/Tab16.jsx'; // "Procedures" in the UI; ids/keys keep the legacy name
import TabDiagnostics  from './components/tabs/Tab17.jsx';

// ── Routing maps ─────────────────────────────────────────────────────────────
// These 4 tabs are full standalone apps (own sidebar + own topbar + height:100vh).
// App.jsx hands control entirely to them and passes onNavChange for inter-tab nav.
const STANDALONE_TABS = new Set(["medications", "labs", "vitals", "symptoms"]);

// Nav-id → component (non-dashboard tabs only)
const TAB_COMPONENTS = {
  profile:     TabProfile,
  records:     TabRecords,
  medications: TabMedications,
  labs:        TabLabs,
  vitals:      TabVitals,
  symptoms:    TabSymptoms,
  careplan:    TabCareplan,
  documents:   TabDocuments,
  notes:       TabNotes,
  ai:          TabAI,
  import:       TabImport,
  backup:       TabBackup,
  appointments: TabAppointments,
  conditions:   TabConditions,
  surgeries:    TabSurgeries,
  diagnostics:  TabDiagnostics,
  reports:      ReportsPage,   // WO_DASHBOARD_FEED_01 / DEC-057: the print center
};

// ── Dashboard ────────────────────────────────────────────────────────────────
// WO_DASHBOARD_FEED_01 (DEC-051 to DEC-057): the feed dashboard lives in
// src/components/dashboard/. The former status wall (hot-button row, nine
// vitals cards, featured labs, alert list, care team cards, refills print)
// is gone from this file.

// ── Shared sidebar component (used for non-standalone tabs) ───────────────────
// UI-10: AppSidebar extracted to src/components/AppSidebar.jsx (shared with
// the four standalone tabs).

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  // P-02: the DEK lives in a JS module variable, not sessionStorage — a
  // fresh page load always starts locked (secureStorage.isUnlocked() is
  // false until LockScreen's unlock()/setupVaultAndMigrate() runs), same as
  // real disk-at-rest encryption. sessionStorage.mi_unlocked no longer gates
  // anything security-relevant; LockScreen calling onUnlock() is the only path in.
  // Demo installs have no vault and nothing to protect, so they open directly
  // instead of being asked to create a password (isDemoMode() is false the
  // moment a real vault exists).
  const [unlocked, setUnlocked] = useState(() => secureStorage.isUnlocked() || secureStorage.isDemoMode());
  const [autoLockVersion, setAutoLockVersion] = useState(0);

  const lock = useCallback(() => {
    secureStorage.lock(); // clears the DEK from memory — P-02 point 6: auto-lock re-requires the passphrase
    sessionStorage.removeItem("mi_unlocked");
    setUnlocked(false);
  }, []);

  // Re-arm the timer when the auto-lock setting changes mid-session.
  useEffect(() => {
    const h = () => setAutoLockVersion(v => v + 1);
    window.addEventListener("mi-autolock-changed", h);
    return () => window.removeEventListener("mi-autolock-changed", h);
  }, []);

  // WO-1: Log Out from the sidebar — session only. Clears the in-memory Drive
  // token (grant not revoked) and locks the vault; the record stays on disk,
  // encrypted. Data deletion lives exclusively in Data & Backup.
  useEffect(() => {
    const h = () => { clearSessionToken(); lock(); };
    window.addEventListener("insina-logout", h);
    return () => window.removeEventListener("insina-logout", h);
  }, [lock]);

  // Inactivity auto-lock: after the configured idle time, return to the lock
  // screen. AppShell unmounts when locked, so no data remains on screen.
  useEffect(() => {
    if (!unlocked) return;
    if (secureStorage.isDemoMode()) return; // nothing to lock; would strand the demo on a setup screen
    const minutes = getAutoLockMinutes();
    if (!minutes) return; // 0 = disabled
    const ms = minutes * 60 * 1000;
    let timer;
    const reset = () => { clearTimeout(timer); timer = setTimeout(lock, ms); };
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, reset));
    };
  }, [unlocked, lock, autoLockVersion]);

  // Onboarding gate (ONBOARDING_SPEC v1.1 §2): new installs only — evaluated
  // after unlock because mi_onboarding_state is vault-encrypted. Existing
  // vaults and demo builds never see it; an incomplete flow resumes.
  const [onboarding, setOnboarding] = useState(false);
  useEffect(() => {
    if (unlocked && !secureStorage.isDemoMode()) setOnboarding(shouldOnboard());
  }, [unlocked]);

  // §7 task CTAs (T6, T2-tier0) can re-enter onboarding at a specific phase —
  // the task sets mi_onboarding_state.phase first, then raises this event.
  useEffect(() => {
    const h = () => setOnboarding(true);
    window.addEventListener("insina-reopen-onboarding", h);
    return () => window.removeEventListener("insina-reopen-onboarding", h);
  }, []);

  if (!unlocked) {
    return <LockScreen onUnlock={() => setUnlocked(true)} />;
  }

  if (onboarding) {
    return <OnboardingFlow onExit={() => setOnboarding(false)} />;
  }

  return <AppShell />;
}

function AppShell() {
  // Onboarding Phase 5 can hand off to a specific screen (ONBOARDING_SPEC v1.1
  // §3.5/§6 — Patient Profile and Prep Brief goals route to the generator's
  // owning module). Plain sessionStorage key: transient nav intent, no PHI.
  // The initializer must stay PURE (StrictMode double-invokes it); the key is
  // cleared in the mount effect below.
  const [activeNav, setActiveNav]     = useState(() => {
    try { return sessionStorage.getItem("insina_pending_nav") || "dashboard"; } catch { return "dashboard"; }
  });
  useEffect(() => {
    try { sessionStorage.removeItem("insina_pending_nav"); } catch { /* non-fatal */ }
    recordAppOpen(); // §7 T9: one session per calendar day the shell opens
  }, []);
  const [time, setTime]           = useState(new Date());
  // v1.57.2: ALWAYS newest-first. A Drive merge appends the other device's
  // readings at the tail, and a dozen dashboard readers (readings[0], .find())
  // assume recency order — phone-entered vitals showed on the Vitals tab (it
  // sorts) but not the dashboard (it trusted storage order).
  const [readings, setReadings]   = useState(() => sortReadingsByRecency(getStore('readings')));
  const [meds, setMeds]           = useState(() => getStore('meds_full'));
  // WO_DASHBOARD_FEED_01: the feed reads appointments, flags, reviews, results,
  // and refills from storage itself; this counter tells it when to rebuild.
  const [dashRefresh, setDashRefresh] = useState(0);
  const rail = useNavRail();
  const [showVitalsModal, setShowVitalsModal] = useState(false);
  const [quickReading, setQuickReading] = useState({ date:"", time:"", bp_s:"", bp_d:"", hr:"", resting_hr:"", o2:"", weight:"", temp:"", glucose:"", sleep:"" });
  // A-12: pending plausibility gate for the Dashboard's Quick Vitals modal —
  // { reading, hardIssues, softFieldIssues, crossFieldIssues } | null.
  const [pendingPlausibility, setPendingPlausibility] = useState(null);
  const [showSearch, setShowSearch] = useState(false);

  // ── Google Drive auth & sync state ──────────────────────────────────────────
  const [googleUser, setGoogleUser] = useState(() => getStoredUser());
  const [syncStatus, setSyncStatus] = useState("idle"); // "idle" | "syncing" | "done" | "error"
  const [lastSyncTs, setLastSyncTs] = useState(() => localStorage.getItem("mi_last_sync"));
  const [lastWeeklyBackup, setLastWeeklyBackup] = useState(() => localStorage.getItem("mi_last_weekly_backup"));
  const [showBackupBanner, setShowBackupBanner] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  // UI-26: standalone tabs (Medications, Labs, Vitals, Symptoms) own their
  // full-page layout, so their Search buttons reach the App-level SearchPopup
  // through this window event.
  useEffect(() => {
    const h = () => setShowSearch(true);
    window.addEventListener("insina-open-search", h);
    return () => window.removeEventListener("insina-open-search", h);
  }, []);

  // Everything the dashboard renders, re-read from storage in one place, on
  // navigation to the dashboard and on every mi-data-synced event (a Drive
  // merge, a vitals save, an RIE fix), so the dashboard never shows a stale figure.
  const refreshDashboardData = useCallback(() => {
    setReadings(sortReadingsByRecency(getStore('readings')));
    setMeds(getStore('meds_full'));
    // The feed (flags, pending review, results, appointments, refills), the
    // bell, and the roster re-read storage on this signal (WO_DASHBOARD_FEED_01).
    setDashRefresh(k => k + 1);
  }, []);

  // Navigating to the dashboard re-reads, as before.
  useEffect(() => {
    if (activeNav !== "dashboard") return;
    refreshDashboardData();
  }, [activeNav, refreshDashboardData]);

  // …and so does any data change, whatever its source: a Drive merge, a vitals
  // save, an RIE fix. Registered unconditionally rather than only while the
  // dashboard is on screen, so coming back to it never shows a stale figure.
  useEffect(() => {
    const h = () => refreshDashboardData();
    window.addEventListener("mi-data-synced", h);
    return () => window.removeEventListener("mi-data-synced", h);
  }, [refreshDashboardData]);

  // Download + merge from Drive, then refresh dashboard data from localStorage.
  const refreshFromDrive = useCallback(async (token) => {
    setSyncStatus("syncing");
    try {
      const ts = await fullSync(token);
      setLastSyncTs(ts);
      setSyncStatus("done");
      setReadings(sortReadingsByRecency(getStore('readings')));
      setMeds(getStore('meds_full'));
      // Let open tabs (e.g. Vitals) re-read the freshly-merged data.
      window.dispatchEvent(new Event("mi-data-synced"));
    } catch (e) {
      console.error("[DriveSync]", e);
      setSyncStatus("error");
    }
  }, []);

  // ── Google auth init + auto-pull on open ────────────────────────────────────
  useEffect(() => {
    initGoogleAuth({
      onSignIn: ({ accessToken, user }) => {
        if (user) setGoogleUser(user);
        refreshFromDrive(accessToken);
      },
      onSignOut: () => {
        setGoogleUser(null);
        setSyncStatus("idle");
        setLastSyncTs(null);
      },
    });
    // If Drive was connected before, silently re-acquire a token on load so we
    // pull anything logged elsewhere (e.g. the phone companion) without waiting
    // for a manual Sync click.
    if (getStoredUser()) signIn();
  }, [refreshFromDrive]);

  // Pull again whenever the user returns to the app (e.g. after logging on the
  // phone, then switching back to the desktop tab).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const token = getAccessToken();
      if (token) refreshFromDrive(token);
      else if (getStoredUser()) signIn(); // expired — silently re-auth, onSignIn re-syncs
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refreshFromDrive]);

  // Periodic pull while the tab stays open — phone-logged vitals appear without
  // pressing Sync Now. Skips when hidden (the visibility handler covers return).
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const token = getAccessToken();
      if (token) refreshFromDrive(token);
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [refreshFromDrive]);

  // ── Global search keyboard shortcut (Cmd+K / Ctrl+K) ──────────────────────
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch(s => !s);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // ── Periodic background sync every 10 minutes while token is live ──────────
  // Merge-first (fullSync), NOT a blind uploadToDrive: a blind upload from a
  // device that hasn't pulled yet OVERWRITES the shared Drive file with a copy
  // missing the other device's changes — the "phone logs never reach the web"
  // clobber. Runs even while the tab is hidden (unlike the 5-minute visible
  // pull), so a long-lived background tab still backs up — safely.
  useEffect(() => {
    if (!googleUser) return;
    const id = setInterval(async () => {
      const token = getAccessToken();
      if (!token) return; // Token expired — wait for user to re-auth via Sync button
      try {
        await refreshFromDrive(token);
      } catch (e) {
        console.warn("[DriveSync] background sync failed:", e);
      }
    }, 10 * 60 * 1000); // 10 minutes
    return () => clearInterval(id);
  }, [googleUser, refreshFromDrive]);

  // ── Weekly backup check on mount ─────────────────────────────────────────────
  useEffect(() => {
    const last  = localStorage.getItem("mi_last_weekly_backup");
    const overdue = !last || (Date.now() - new Date(last).getTime()) > WEEKLY_INTERVAL_MS;
    if (!overdue) return;

    const token = getAccessToken();
    if (googleUser && token) {
      // Drive connected — auto-backup silently
      uploadWeeklyBackup(token)
        .then(ts => setLastWeeklyBackup(ts))
        .catch(e => console.warn("[WeeklyBackup] auto-backup failed:", e));
    } else if (!googleUser) {
      // No Drive — a configured backup folder covers the weekly silently
      // (v1.38.0); the reminder banner appears only when it can't (no folder
      // chosen, permission lapsed, or unsupported browser).
      attemptAutoFolderBackup().then(wrote => {
        if (wrote) setLastWeeklyBackup(new Date().toISOString());
        else setShowBackupBanner(true);
      });
    }
  }, []); // intentionally once on mount

  // Called by ImportTab when the user confirms parsed data
  const handleImport = useCallback((parsed) => {
    if (parsed.readings?.length) {
      const merged = mergeReadings(parsed.readings);
      setReadings(merged);
    }
    if (parsed.meds?.length) {
      const merged = mergeMeds(parsed.meds);
      setMeds(merged);
    }
    if (parsed.labs?.length) mergeLabs(parsed.labs);
    if (parsed.alerts?.length) {
      setStore('alerts', [...parsed.alerts, ...getStore('alerts')]);
    }
    if (parsed.upcoming?.length) {
      setStore('upcoming', [...parsed.upcoming, ...getStore('upcoming')]);
    }
    if (parsed.records?.length) {
      mergeRecords(parsed.records);
    }
    const ts = new Date().toISOString();
    addImportLog({ ts, source: parsed.source ?? "Import", records: parsed.totalRecords ?? 0 });
    setDashRefresh(k => k + 1);
  }, []);

  // A-12/UI-4: routed through the shared vital schema (mkReading/saveReading)
  // instead of a hand-rolled carry-forward + date-keyed merge — a blank field
  // is null, never silently the last known value, and the plausibility guard
  // runs before the write (DEC-019), same as the desktop Vitals tab and the
  // companion app's two entry paths.
  function commitQuickReading(reading) {
    const merged = saveReading(reading);
    setReadings(merged);
    setShowVitalsModal(false);
    setPendingPlausibility(null);
    setQuickReading({ date:"", time:"", bp_s:"", bp_d:"", hr:"", resting_hr:"", o2:"", weight:"", temp:"", glucose:"", sleep:"" });
  }

  function attemptQuickSave(reading) {
    const fieldIssues = checkVitalReading(reading);
    const crossFieldIssues = checkVitalCrossFields(reading);
    const hardIssues = Object.entries(fieldIssues).filter(([, v]) => v.band === "hard");
    const softFieldIssues = Object.entries(fieldIssues).filter(([, v]) => v.band === "soft");
    if (hardIssues.length === 0 && softFieldIssues.length === 0 && crossFieldIssues.length === 0) {
      commitQuickReading(reading);
      return;
    }
    setPendingPlausibility({ reading, hardIssues, softFieldIssues, crossFieldIssues });
  }

  function applyQuickSuggestion(field, value) {
    if (!pendingPlausibility) return;
    const updated = { ...pendingPlausibility.reading, [field]: value };
    // Recompute the flag — the corrected value must not keep the stale flag
    // the original typo earned (e.g. 1138 → flag, corrected 113.8 → no flag).
    updated.flag = defaultVitalFlag(updated);
    setPendingPlausibility(null);
    attemptQuickSave(updated);
  }

  const handleQuickSave = () => {
    const reading = mkReading({
      date: quickReading.date, time: quickReading.time,
      bp_s: quickReading.bp_s, bp_d: quickReading.bp_d, hr: quickReading.hr, resting_hr: quickReading.resting_hr,
      o2: quickReading.o2, weight: quickReading.weight, temp: quickReading.temp, glucose: quickReading.glucose, sleep: quickReading.sleep,
    });
    attemptQuickSave(reading);
  };


  const fmt     = (d) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const fmtDate = (d) => d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const isStandalone     = STANDALONE_TABS.has(activeNav);
  const ActiveTabComponent = TAB_COMPONENTS[activeNav] ?? null;

  return (
    <div style={{ display: "flex", height: "100vh", background: "#07090f", color: "#d4e2f0", fontFamily: "'Sora', sans-serif", overflow: "hidden", position: "relative" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #1a2840; border-radius: 4px; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.4; } }
        .section-label { font-size:12px; letter-spacing:1.5px; text-transform:uppercase; color:#a0b4c8; font-family:'DM Mono', monospace; margin-bottom:12px; }
        .topbar-icon { width:44px; min-width:44px; min-height:44px; border-radius:10px; border:1.5px solid transparent; background:transparent; color:var(--text-dim); cursor:pointer; display:inline-flex; align-items:center; justify-content:center; }
        .topbar-icon:hover { background:#101a2c; color:var(--text-bright); }
        .topbar-btn { min-height:44px; border-radius:10px; border:1.5px solid #1c2a40; background:#101a2c; color:var(--text-bright); font-size:14px; font-weight:600; font-family:'Sora',sans-serif; padding:0 14px; display:inline-flex; align-items:center; gap:8px; white-space:nowrap; cursor:pointer; }
        .topbar-btn:hover { border-color:var(--accent-blue); }
        .dash-scroll { padding: 28px; }
        @media (max-width: 900px) { .topbar { flex-wrap: wrap; gap: 6px; padding: 6px 10px; } .topbar-date, .topbar-label { display:none; } .topbar-btn { padding:0 12px; } .dash-scroll { padding: 16px 12px; } }
        .ai-btn { width:100%; padding:12px; background:linear-gradient(135deg, rgba(79,142,247,.15), rgba(167,139,250,.1)); border:1px solid rgba(79,142,247,.3); border-radius:10px; color:#7eb8d8; font-family:'Sora',sans-serif; font-size:12px; cursor:pointer; transition:all .2s; display:flex; align-items:center; justify-content:center; gap:8px; }
        .ai-btn:hover { background:linear-gradient(135deg, rgba(79,142,247,.25), rgba(167,139,250,.18)); border-color:rgba(79,142,247,.5); color:#b8d4f0; }
      `}</style>

      {/* Record Integrity Engine — floating Review Queue, present on every tab */}
      <RIEWidget onNavChange={setActiveNav} />
      <PreflightHost onNavChange={setActiveNav} />

      {/* DEC-PNN pending: tripwire advisory — root-mounted takeover/Emergency Info
          overlay (position:fixed, covers standalone tabs too). */}
      <AdvisoryModal />

      {/* ── Group A: standalone apps (medications, labs, vitals, symptoms) ── */}
      {/* These components have their own sidebar + topbar + height:100vh.     */}
      {/* We hand full-page control to them and pass navigation callback.       */}
      {isStandalone && <ActiveTabComponent onNavChange={setActiveNav} />}

      {/* ── Sidebar (all non-standalone tabs) — always visible ── */}
      {!isStandalone && (
        <AppSidebar
          activeNav={activeNav}
          onNav={setActiveNav}
        />
      )}

      {/* ── All other tabs: full-width main area ── */}
      {!isStandalone && (
        <>

          {/* AI Analysis: has own topbar + height:100vh — give it the full remaining area */}
          {activeNav === "ai" && (
            <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
              <ActiveTabComponent onNavChange={setActiveNav} />
            </div>
          )}

          {/* Dashboard + Group B (profile, records, careplan, documents, notes, import, backup) */}
          {activeNav !== "ai" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

              {/* Topbar (WO_DASHBOARD_FEED_01 4.2 / DEC-056): menu toggle, Emergency,
                  search as an icon, date and time, Import records, bell, Insina AI
                  mark, avatar. No sync indicator here: the greeting row carries
                  "Last updated". Text size is a later work order (DEC-TBD-04). */}
              <div className="topbar" style={{ minHeight: 64, background: "#080c14", borderBottom: "1px solid #1c2a40", display: "flex", alignItems: "center", padding: "0 16px", gap: 10, flexShrink: 0 }}>
                <button className="topbar-icon" aria-label={rail ? "Show menu" : "Hide menu"} title={rail ? "Show menu" : "Hide menu"} onClick={toggleNavRail}>
                  {rail ? <PanelLeftOpen size={20} aria-hidden="true" /> : <PanelLeftClose size={20} aria-hidden="true" />}
                </button>
                {/* tripwire advisory section 5: persistent Emergency Info (topbar), unchanged */}
                <EmergencyInfoButton variant="topbar" />
                <button className="topbar-icon" onClick={() => setShowSearch(true)} title="Search" aria-label="Search"><Search size={20} aria-hidden="true" /></button>
                <span className="topbar-date" style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#98afc4", fontFamily: "'DM Mono',monospace", paddingLeft: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fmtDate(time)} · {fmt(time)}</span>
                {activeNav !== "import" && (
                  <button className="topbar-btn" aria-label="Import records" title="Import records" onClick={() => setActiveNav("import")}><Upload size={18} aria-hidden="true" /><span className="topbar-label">Import records</span></button>
                )}
                <Bell readings={readings} refreshKey={dashRefresh} />
                {/* DEC-P49: persistent entry button, left of the avatar, hidden on Import Records */}
                {activeNav !== "import" && <AIEntryButton iconSize={32} source="nav" onNavigate={() => setActiveNav("ai")} />}
                <AvatarMenu onNav={setActiveNav} picture={googleUser?.picture} />
              </div>

              {/* Content */}
              <div className={activeNav === "dashboard" ? "dash-scroll" : undefined} style={{ flex: 1, overflowY: "auto", padding: activeNav === "dashboard" ? undefined : "0" }}>

                {/* Non-dashboard Group B tabs */}
                {ActiveTabComponent && activeNav === "import"
                  ? <ActiveTabComponent onImport={handleImport} onNavChange={setActiveNav} />
                  : ActiveTabComponent && activeNav === "backup"
                  ? <ActiveTabComponent onNavChange={setActiveNav} googleUser={googleUser} syncStatus={syncStatus} lastSyncTs={lastSyncTs} onSync={signIn} onSignOut={signOut} />
                  : ActiveTabComponent && <ActiveTabComponent onNavChange={setActiveNav} />
                }

                {/* Dashboard home */}
                {!ActiveTabComponent && (
                  <>
                    {/* Weekly backup reminder — shown only when Drive not connected and backup is overdue */}
                    {showBackupBanner && (
                      <div style={{ display:"flex", alignItems:"center", gap:12, background:"rgba(79,142,247,.07)", border:"1px solid rgba(79,142,247,.22)", borderRadius:12, padding:"11px 16px", marginBottom:18, flexWrap:"wrap" }}>
                        <span style={{ color:"var(--accent-soft)", display:"flex" }}><SaveIcon /></span>
                        <div style={{ flex:"1 1 220px", minWidth:0 }}>
                          <div style={{ fontSize:12, fontWeight:600, color:"#dde8f5" }}>Weekly backup overdue</div>
                          <div style={{ fontSize:12, color:"#98afc4", fontFamily:"'DM Mono',monospace", marginTop:2 }}>
                            {/* UI-2: never "NaN days ago" — unparseable timestamps fall back */}
                            {daysAgoLabel(lastWeeklyBackup, null)
                              ? `Last backed up ${daysAgoLabel(lastWeeklyBackup, null)}.`
                              : "Your data has never been backed up."}
                            {" "}Connect Google Drive in Settings for automatic weekly backups{isFolderBackupSupported() ? ". Or choose a backup folder in Export & Backup (no Google needed)" : ""}.
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const data = collectLocalData();
                            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                            const a = document.createElement("a");
                            a.href = URL.createObjectURL(blob);
                            a.download = `insina-health-weekly-${new Date().toISOString().split("T")[0]}.json`;
                            document.body.appendChild(a); a.click(); document.body.removeChild(a);
                            const ts = new Date().toISOString();
                            localStorage.setItem("mi_last_weekly_backup", ts);
                            setLastWeeklyBackup(ts);
                            setShowBackupBanner(false);
                          }}
                          style={{ padding:"7px 14px", background:"rgba(79,142,247,.15)", border:"1px solid rgba(79,142,247,.35)", borderRadius:8, color:"#7eb8d8", fontSize:12, fontFamily:"'DM Mono',monospace", cursor:"pointer", fontWeight:600, whiteSpace:"nowrap" }}
                        >
                          Download backup
                        </button>
                        <button
                          onClick={() => setShowBackupBanner(false)}
                          style={{ background:"transparent", border:"none", color:"#4a5c6a", fontSize:18, cursor:"pointer", padding:"0 4px", lineHeight:1 }}
                          title="Dismiss"
                        >×</button>
                      </div>
                    )}

                    <Dashboard
                      readings={readings}
                      onNav={setActiveNav}
                      lastSyncTs={lastSyncTs}
                      refreshKey={dashRefresh}
                      onLogVitals={() => { setQuickReading(q => ({ ...q, date: q.date || new Date().toISOString().slice(0, 10) })); setShowVitalsModal(true); }}
                    />
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Log Vitals modal (full 10-field entry) ── */}
      {showVitalsModal && (
        <div
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.65)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9000 }}
          onClick={e => { if (e.target === e.currentTarget) { setShowVitalsModal(false); setQuickReading({ date:"", time:"", bp_s:"", bp_d:"", hr:"", resting_hr:"", o2:"", weight:"", temp:"", glucose:"", sleep:"" }); } }}
        >
          <div style={{ background:"#0b1220", border:"1px solid #1a2f4a", borderRadius:16, padding:"24px", width:"min(94vw, 580px)", maxHeight:"90vh", overflowY:"auto" }}>
            <div style={{ fontSize:12, fontWeight:700, color:"#dde8f5", fontFamily:"'DM Mono',monospace", letterSpacing:"2px", textTransform:"uppercase", marginBottom:20 }}>New Vital Reading</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:12, marginBottom:20 }}>
              <div>
                <label style={{ fontSize:12, color:"#a0b4c8", fontFamily:"'DM Mono',monospace", display:"block", marginBottom:5 }}>DATE</label>
                <input
                  type="date"
                  style={{ background:"#080c14", border:"1px solid #1a2f4a", borderRadius:6, padding:"8px 10px", fontSize:13, color:"#c4d8ee", fontFamily:"'Sora',sans-serif", width:"100%", outline:"none" }}
                  value={quickReading.date}
                  onChange={e => setQuickReading(prev => ({ ...prev, date: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ fontSize:12, color:"#a0b4c8", fontFamily:"'DM Mono',monospace", display:"block", marginBottom:5 }}>TIME (OPTIONAL)</label>
                <input
                  type="time"
                  style={{ background:"#080c14", border:"1px solid #1a2f4a", borderRadius:6, padding:"8px 10px", fontSize:13, color:"#c4d8ee", fontFamily:"'Sora',sans-serif", width:"100%", outline:"none" }}
                  value={quickReading.time}
                  onChange={e => setQuickReading(prev => ({ ...prev, time: e.target.value }))}
                />
              </div>
              {[
                { label:"BP SYSTOLIC",   key:"bp_s",       placeholder:"131" },
                { label:"BP DIASTOLIC",  key:"bp_d",       placeholder:"71" },
                { label:"HEART RATE",    key:"hr",         placeholder:"72" },
                { label:"RESTING HR",    key:"resting_hr", placeholder:"62" },
                { label:"O2 SAT %",      key:"o2",         placeholder:"98" },
                { label:"WEIGHT (lbs)",  key:"weight",     placeholder:"184.2" },
                { label:"TEMP (°F)",key:"temp",       placeholder:"98.6" },
                { label:"GLUCOSE",       key:"glucose",    placeholder:"110" },
                { label:"SLEEP (hrs)",   key:"sleep",      placeholder:"7.5" },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize:12, color:"#a0b4c8", fontFamily:"'DM Mono',monospace", display:"block", marginBottom:5 }}>{f.label}</label>
                  <input
                    style={{ background:"#080c14", border:"1px solid #1a2f4a", borderRadius:6, padding:"8px 10px", fontSize:13, color:"#c4d8ee", fontFamily:"'Sora',sans-serif", width:"100%", outline:"none" }}
                    placeholder={f.placeholder}
                    value={quickReading[f.key]}
                    onChange={e => setQuickReading(prev => ({ ...prev, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button
                onClick={() => { setShowVitalsModal(false); setQuickReading({ date:"", time:"", bp_s:"", bp_d:"", hr:"", resting_hr:"", o2:"", weight:"", temp:"", glucose:"", sleep:"" }); }}
                style={{ padding:"9px 18px", background:"transparent", border:"1px solid #1a2f4a", borderRadius:8, color:"#b0c4d8", fontSize:12, fontFamily:"'DM Mono',monospace", cursor:"pointer" }}
              >Cancel</button>
              <button
                onClick={handleQuickSave}
                style={{ padding:"9px 22px", background:"rgba(79,142,247,.2)", border:"1px solid rgba(79,142,247,.5)", borderRadius:8, color:"#7eb8d8", fontSize:12, fontFamily:"'DM Mono',monospace", cursor:"pointer", fontWeight:600 }}
              >Save Reading</button>
            </div>
          </div>
        </div>
      )}

      {/* A-12: Quick Vitals plausibility gate — hard band blocks with
          suggestion buttons (nothing auto-corrects); soft band + cross-field
          issues confirm-and-save in one tap. DEC-019. */}
      {pendingPlausibility && (() => {
        const { reading, hardIssues, softFieldIssues, crossFieldIssues } = pendingPlausibility;
        const hasHard = hardIssues.length > 0;
        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.78)", zIndex:9500, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
            <div style={{ width:360, maxWidth:"90vw", background:"#0b1220", border:"1px solid #16273c", borderRadius:14, padding:"20px 22px", boxShadow:"0 20px 60px rgba(0,0,0,.5)" }}>
              <div style={{ fontSize:12, color: hasHard ? "#f87171" : "#f59e0b", fontFamily:"'DM Mono',monospace", letterSpacing:"1.5px", marginBottom:6 }}>
                {hasHard ? "CHECK THIS VALUE" : "UNUSUAL VALUE"}
              </div>
              <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:17, color:"#dde8f5", marginBottom:14 }}>
                {hasHard ? "This doesn't look right" : "Save this reading?"}
              </div>
              {hardIssues.map(([field, issue]) => (
                <div key={field} style={{ marginBottom:14 }}>
                  <div style={{ fontSize:12, color:"#c4d8ee", marginBottom:8, lineHeight:1.5 }}>
                    {issue.label}: <strong>{reading[field]}</strong> {issue.unit} is outside a plausible range.
                  </div>
                  {issue.suggestions.length > 0 ? (
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      {issue.suggestions.map(s => (
                        <button key={s} onClick={() => applyQuickSuggestion(field, s)}
                          style={{ padding:"7px 12px", background:"#132036", border:"1px solid #244266", borderRadius:8, color:"#7eb8d8", fontSize:12.5, fontFamily:"'DM Mono',monospace", cursor:"pointer" }}>
                          Use {s} {issue.unit}?
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize:12, color:"#98afc4" }}>No suggested correction. Please edit the value manually.</div>
                  )}
                </div>
              ))}
              {softFieldIssues.map(([field, issue]) => (
                <div key={field} style={{ fontSize:12, color:"#c4d8ee", marginBottom:10, lineHeight:1.5 }}>
                  {issue.label}: <strong>{reading[field]}</strong> {issue.unit} is far from your typical range.
                </div>
              ))}
              {crossFieldIssues.map((issue, i) => (
                <div key={i} style={{ fontSize:12, color:"#c4d8ee", marginBottom:10, lineHeight:1.5 }}>{issue.message}</div>
              ))}
              <div style={{ display:"flex", gap:8, marginTop:16 }}>
                {!hasHard && (
                  <button onClick={() => commitQuickReading(reading)}
                    style={{ flex:1, padding:"11px", background:"#10b981", border:"none", borderRadius:9, color:"#fff", fontSize:13, fontFamily:"'Sora',sans-serif", fontWeight:600, cursor:"pointer" }}>
                    Save Anyway
                  </button>
                )}
                <button onClick={() => setPendingPlausibility(null)}
                  style={{ flex: hasHard ? 1 : "none", padding:"11px 16px", background:"#0b1220", border:"1px solid #1c2a40", borderRadius:9, color:"#b0c4d8", fontSize:13, fontFamily:"'Sora',sans-serif", cursor:"pointer" }}>
                  {hasHard ? "Edit Manually" : "Cancel"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Global Search Popup (fixed overlay — works over standalone tabs too) ── */}
      {showSearch && (
        <SearchPopup
          onClose={() => setShowSearch(false)}
          onNavChange={(nav) => { setActiveNav(nav); setShowSearch(false); }}
        />
      )}
    </div>
  );
}
