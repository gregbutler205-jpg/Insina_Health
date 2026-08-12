import { useState, useEffect, useCallback } from "react";
import { getStore, setStore, mergeReadings, mergeMeds, mergeLabs, mergeRecords, addImportLog } from './store.js';
import { mkReading, saveReading, defaultVitalFlag } from './lib/vitals.js';
import { checkVitalReading, checkVitalCrossFields } from './lib/plausibility.js';
import LockScreen from './components/LockScreen.jsx';
import OnboardingFlow from './components/onboarding/OnboardingFlow.jsx';
import TaskCards from './components/onboarding/TaskCards.jsx';
import { shouldOnboard } from './lib/onboardingState.js';
import { recordAppOpen } from './lib/taskEngine.js';
import AppSidebar from './components/AppSidebar.jsx';
import AdvisoryModal from './components/advisory/AdvisoryModal.jsx';
import EmergencyInfoButton from './components/advisory/EmergencyInfoButton.jsx';
import { printEmergency } from './lib/printEmergency.js';
import { FlaskIcon, PillIcon, CalendarIcon, ThermometerIcon, HeartIcon, DownloadIcon, RefreshIcon, AlertTriangleIcon, ClockIcon, SaveIcon } from './components/icons.jsx';
import { daysAgoLabel } from './lib/displaySafe.js';
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
import HistoryBuilderTab, { HbPromptCard } from './components/HistoryBuilderTab.jsx';

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
  history:      HistoryBuilderTab,
};

// ── Featured labs helper ──────────────────────────────────────────────────────
const FEATURED_LAB_DEFS = [
  { label: "Alk Phos",   pattern: /alk.*phos|alkaline.*phos/i },
  { label: "ALT",        pattern: /\balt\b|alanine\s*(amino)?trans/i },
  { label: "AST",        pattern: /\bast\b|aspartate\s*(amino)?trans/i },
  { label: "Bilirubin",  pattern: /bilirubin/i },
  { label: "Glucose",    pattern: /\bglucose\b/i },
  { label: "Calcium",    pattern: /\bcalcium\b/i },
  { label: "Platelets",  pattern: /platelet/i },
  { label: "Creatinine", pattern: /\bcreatinine\b/i },
  { label: "eGFR",       pattern: /egfr|glom.*filt/i },
  { label: "Sodium",     pattern: /\bsodium\b/i },
  { label: "Magnesium",  pattern: /magnesium/i },
];

function generateAutoAlerts() {
  const dismissed = (() => { try { return new Set(JSON.parse(localStorage.getItem("mi_dismissed_alerts") || "[]")); } catch { return new Set(); } })();
  const alerts = [];
  try {
    // Flagged labs
    const labs = JSON.parse(localStorage.getItem("mi_labs") || "[]");
    const latest = {};
    labs.forEach(l => {
      const key = (l.name || "").toLowerCase().trim();
      if (!key) return;
      if (!latest[key] || new Date(l.date || 0) > new Date(latest[key].date || 0)) latest[key] = l;
    });
    Object.values(latest).filter(l => l.flag).forEach(l => {
      const text = `${l.name} flagged${l.value ? ` — value: ${l.value}${l.unit ? " " + l.unit : ""}` : ""}${l.refRange ? ` (ref: ${l.refRange})` : ""}`;
      const fp = `auto:warn:${text.substring(0, 60)}`;
      if (!dismissed.has(fp)) alerts.push({ type:"warn", text, time: l.date ? l.date.slice(5).replace("-","/") : "—", fp, source:"auto" });
    });
    // Flagged vitals
    const readings = JSON.parse(localStorage.getItem("mi_readings") || "[]");
    readings.filter(r => r.flag).slice(0,3).forEach(r => {
      const bpStr = (r.bp_s != null && r.bp_d != null) ? ` BP ${r.bp_s}/${r.bp_d}` : "";
      const text = `Flagged vital reading${bpStr}`;
      const fp = `auto:warn:${text.substring(0,60)}:${r.date||""}`;
      if (!dismissed.has(fp)) alerts.push({ type:"warn", text, time: r.date || "—", fp, source:"auto" });
    });
  } catch {}
  return alerts;
}

function getFeaturedLabs() {
  try {
    const all = JSON.parse(localStorage.getItem("mi_labs") || "[]");
    // Deduplicate: latest per test name
    const latest = {};
    all.forEach(l => {
      const key = (l.name || "").toLowerCase().trim();
      if (!key) return;
      if (!latest[key] || new Date(l.date || 0) > new Date(latest[key].date || 0)) latest[key] = l;
    });
    const deduped = Object.values(latest);
    // Match to featured tests
    return FEATURED_LAB_DEFS.map(def => {
      const match = deduped.find(l => def.pattern.test(l.name || ""));
      return { label: def.label, lab: match || null };
    });
  } catch { return FEATURED_LAB_DEFS.map(def => ({ label: def.label, lab: null })); }
}

// ── Assets & static data ──────────────────────────────────────────────────────
const SHIELD_LOGO = "data:image/jpeg;base64,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";

// UI-10: NAV and the sidebar live in src/components/AppSidebar.jsx now — one
// definition shared with the standalone tabs instead of five parallel copies.

// ── Helper functions (accept data as params so they work with live state) ─────
function parseRefillDate(str) {
  if (!str) return new Date(0);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date(str + "T12:00:00");
  const yr = new Date().getFullYear();
  const d = new Date(`${str}, ${yr}`);
  if (isNaN(d.getTime())) return new Date(0);
  // if date is more than 6 months in the past, assume next year
  if (d < new Date(Date.now() - 180 * 86400000)) d.setFullYear(yr + 1);
  return d;
}

function get7DayRefills(meds) {
  const now = new Date(); now.setHours(0,0,0,0);
  const end = new Date(now); end.setDate(now.getDate() + 7); end.setHours(23,59,59,999);
  return meds.filter(m => { const d = parseRefillDate(m.refillDate); return d >= now && d <= end; });
}

// ── Dashboard stat cards (receive live data as props) ─────────────────────────
function DataFreshnessCard() {
  function lastUpdated(key, dateFn) {
    try {
      const items = JSON.parse(localStorage.getItem(key) || "[]");
      if (!items.length) return null;
      const dates = items.map(dateFn).filter(Boolean).map(raw => {
        // Numeric timestamp (e.g. id: Date.now()) — already local-time-safe
        if (typeof raw === "number") return new Date(raw);
        // ISO date string "YYYY-MM-DD" — parse as local noon to avoid UTC-offset day-shift
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(raw + "T12:00:00");
        return new Date(raw);
      }).filter(d => !isNaN(d));
      if (!dates.length) return null;
      const latest = new Date(Math.max(...dates));
      return latest.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch { return null; }
  }

  const rows = [
    { label: "Labs",         date: lastUpdated("mi_labs",         l => l.date) },
    { label: "Meds",         date: lastUpdated("mi_meds_full",    m => m.id ? Number(m.id) : null) },
    { label: "Vitals",       date: lastUpdated("mi_readings",     r => r.date || (r.ts ? Number(r.ts) : null)) },
    { label: "Appointments", date: lastUpdated("mi_appointments", a => a.date) },
    { label: "Conditions",   date: lastUpdated("mi_conditions",   c => c.since || c.diagnosedDate) },
    { label: "Documents",    date: lastUpdated("mi_ref_docs",     d => d.studyDate || d.addedDate || d.addedAt) },
  ];

  return (
    <div className="stat-card">
      <div style={{ width:28, height:3, background:"#4f8ef7", borderRadius:2, marginBottom:14, boxShadow:"0 0 10px #4f8ef760" }} />
      <div style={{ fontSize:12, fontWeight:600, color:"#7eb8d8", marginBottom:12 }}>Last Updated</div>
      <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
        {rows.map(({ label, date }) => (
          <div key={label} style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span style={{ fontSize:11, color:"#7eb8d8", fontFamily:"'DM Mono',monospace" }}>{label}</span>
            <span style={{ fontSize:11, color: date ? "#c4d8ee" : "#4a5c6a", fontFamily:"'DM Mono',monospace" }}>
              {date ?? "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Refills print ─────────────────────────────────────────────────────────────
function printRefills(meds, logoUrl) {
  const refills = meds.filter(m => m.status !== "inactive" && m.refillDate);
  const date = new Date().toLocaleDateString("en-US", { year:"numeric", month:"long", day:"numeric" });
  const win = window.open("", "_blank", "width=760,height=620");
  win.document.write(`<!DOCTYPE html><html><head>
    <title>Refills Due — Insina Health</title>
    <style>
      * { box-sizing:border-box; margin:0; padding:0; }
      body { font-family:Arial,sans-serif; max-width:700px; margin:40px auto; color:#1a1a1a; font-size:13px; line-height:1.65; padding:0 24px; }
      .logo { height:44px; margin-bottom:16px; }
      h1 { font-size:24px; font-weight:700; margin-bottom:4px; }
      .subtitle { font-size:11px; font-family:monospace; color:#555; margin-bottom:16px; }
      table { width:100%; border-collapse:collapse; margin-top:8px; }
      th { font-size:10px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#555; border-bottom:2px solid #ddd; padding:6px 10px; text-align:left; }
      td { font-size:13px; padding:8px 10px; border-bottom:1px solid #eee; }
      .footer { margin-top:32px; border-top:1px solid #ddd; padding-top:10px; font-size:10px; color:#999; display:flex; justify-content:space-between; }
      @media print { body { margin:20px; } }
    </style>
  </head><body>
    <img src="${logoUrl}" class="logo" />
    <h1>Upcoming Refills</h1>
    <div class="subtitle">Printed ${date} &mdash; ${refills.length} medication${refills.length !== 1 ? "s" : ""} with refill dates on file</div>
    <table>
      <thead><tr><th>Medication</th><th>Dose</th><th>Frequency</th><th>Refill Date</th><th>Prescriber</th></tr></thead>
      <tbody>
        ${refills.sort((a, b) => new Date(a.refillDate) - new Date(b.refillDate)).map(m => `
          <tr>
            <td><strong>${m.name}</strong>${m.brandName ? ` <span style="color:#888;font-size:11px">(${m.brandName})</span>` : ""}</td>
            <td>${m.dose || "—"}</td>
            <td>${m.frequency || "—"}</td>
            <td>${m.refillDate || "—"}</td>
            <td>${m.prescriber || "—"}</td>
          </tr>`).join("")}
      </tbody>
    </table>
    <div class="footer">
      <span>Insina Health &mdash; Medication Refill List</span>
      <span>${date}</span>
    </div>
    <script>window.onload = function(){ window.print(); }<\/script>
  </body></html>`);
  win.document.close();
}

// ── Dashboard hot-button row ──────────────────────────────────────────────────
function DashboardHotButtons({ setActiveNav, syncStatus, lastSyncTs, lastWeeklyBackup, onSync, meds, onLogVitals }) {
  const PRINT_LOGO = (import.meta.env.BASE_URL || "/") + "logo.png";
  const [showFreshnessPopup, setShowFreshnessPopup] = useState(false);

  const fmtSync = ts => ts ? new Date(ts).toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit" }) : null;
  const syncColor = syncStatus === "syncing" ? "#f59e0b" : syncStatus === "error" ? "#ef4444" : lastSyncTs ? "#10b981" : "#6a8090";

  function luDate(key, dateFn) {
    try {
      const items = JSON.parse(localStorage.getItem(key) || "[]");
      if (!items.length) return null;
      const dates = items.map(dateFn).filter(Boolean).map(raw => {
        if (typeof raw === "number") return new Date(raw);
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(raw + "T12:00:00");
        return new Date(raw);
      }).filter(d => !isNaN(d));
      if (!dates.length) return null;
      return new Date(Math.max(...dates)).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
    } catch { return null; }
  }

  const freshnessRows = [
    { label: "Labs",         date: luDate("mi_labs",         l => l.date) },
    { label: "Meds",         date: luDate("mi_meds_full",    m => m.id ? Number(m.id) : null) },
    { label: "Vitals",       date: luDate("mi_readings",     r => r.date || (r.ts ? Number(r.ts) : null)) },
    { label: "Appointments", date: luDate("mi_appointments", a => a.date) },
    { label: "Conditions",   date: luDate("mi_conditions",   c => c.since || c.diagnosedDate) },
    { label: "Documents",    date: luDate("mi_ref_docs",     d => d.studyDate || d.addedDate || d.addedAt) },
  ];

  const btn = (icon, label, onClick, extra = {}) => (
    <button key={label} onClick={onClick} style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 7, padding: "14px 10px", minWidth: 86, flexShrink: 0,
      background: "#0b1220", border: "1px solid #111e30", borderRadius: 12,
      cursor: "pointer", transition: "all .15s", ...extra,
    }}
      onMouseEnter={e => { e.currentTarget.style.background = extra.background ? extra.background.replace(",.12)", ",.22)").replace(",.08)", ",.16)") : "#0f1828"; e.currentTarget.style.borderColor = "#1a2f4a"; }}
      onMouseLeave={e => { e.currentTarget.style.background = extra.background || "#0b1220"; e.currentTarget.style.borderColor = extra.borderColor || "#111e30"; }}
    >
      <span style={{ fontSize: 22, lineHeight: 1 }}>{icon}</span>
      <span style={{ fontSize: 10, color: extra.labelColor || "#7eb8d8", fontFamily: "'DM Mono',monospace", textAlign: "center", lineHeight: 1.3, whiteSpace: "pre-line" }}>{label}</span>
    </button>
  );

  return (
    <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 22,
      scrollbarWidth: "none", msOverflowStyle: "none" }}>
      <style>{`.hbrow::-webkit-scrollbar{display:none}`}</style>

      {/* UI-14: SVG icon family (one stroke style, no emoji in routine controls) */}
      {btn(<FlaskIcon style={{ color: "var(--green)" }} />,       "Lab Results",     () => setActiveNav("labs"))}
      {btn(<PillIcon style={{ color: "var(--amber)" }} />,        "Medications",     () => setActiveNav("medications"))}
      {btn(<CalendarIcon style={{ color: "var(--accent)" }} />,   "Appointments",    () => setActiveNav("appointments"))}
      {btn(<ThermometerIcon style={{ color: "var(--purple)" }} />,"Symptoms",        () => setActiveNav("symptoms"))}
      {btn(<HeartIcon style={{ color: "var(--red)" }} />,         "Log Vitals",      onLogVitals)}
      {btn(<DownloadIcon style={{ color: "var(--accent-soft)" }} />, "Import\nRecords", () => setActiveNav("import"))}
      {btn(<RefreshIcon style={{ color: "var(--amber)" }} />,     "Refills",         () => printRefills(meds, PRINT_LOGO))}

      {/* Emergency Info — light red */}
      {btn(<AlertTriangleIcon style={{ color: "#f87171" }} />, "Emergency\nInfo", printEmergency, {
        background: "rgba(239,68,68,.12)", borderColor: "rgba(239,68,68,.3)",
        labelColor: "#f87171",
      })}

      {/* Last Updated / Sync — rightmost, shows freshness popup */}
      <div style={{ position: "relative", marginLeft: "auto", flexShrink: 0 }}>
        {showFreshnessPopup && (
          <div onClick={() => setShowFreshnessPopup(false)}
            style={{ position: "fixed", inset: 0, zIndex: 199 }} />
        )}
        <button onClick={() => setShowFreshnessPopup(o => !o)} style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 5, padding: "12px 14px", minWidth: 132,
          background: "rgba(79,142,247,.08)", border: "1px solid rgba(79,142,247,.22)", borderRadius: 12,
          cursor: "pointer",
        }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(79,142,247,.16)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(79,142,247,.08)"}
        >
          <span style={{ lineHeight: 1, color: "var(--accent-soft)" }}><ClockIcon size={17} /></span>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: syncColor, flexShrink: 0, boxShadow: `0 0 5px ${syncColor}80` }} />
            <span style={{ fontSize: 9, color: syncColor, fontFamily: "'DM Mono',monospace", fontWeight: 600 }}>
              {syncStatus === "syncing" ? "Syncing…" : "Last Updated"}
            </span>
          </div>
          <span style={{ fontSize: 9, color: "#c4d8ee", fontFamily: "'DM Mono',monospace" }}>
            {fmtSync(lastSyncTs) || "—"}
          </span>
        </button>
        {showFreshnessPopup && (
          <div style={{
            position: "absolute", top: "calc(100% + 8px)", right: 0,
            background: "#0b1220", border: "1px solid #1a2f4a", borderRadius: 12,
            padding: "16px", minWidth: 230, zIndex: 200,
            boxShadow: "0 8px 32px rgba(0,0,0,.5)",
          }}>
            <div style={{ fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase", color: "#a0b4c8", fontFamily: "'DM Mono',monospace", marginBottom: 10 }}>Data Freshness</div>
            {freshnessRows.map(({ label, date }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                <span style={{ fontSize: 11, color: "#7eb8d8", fontFamily: "'DM Mono',monospace" }}>{label}</span>
                <span style={{ fontSize: 11, color: date ? "#c4d8ee" : "#4a5c6a", fontFamily: "'DM Mono',monospace" }}>{date ?? "—"}</span>
              </div>
            ))}
            <div style={{ borderTop: "1px solid #0d1a28", marginTop: 10, paddingTop: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                <span style={{ fontSize: 11, color: "#4f8ef7", fontFamily: "'DM Mono',monospace" }}>Last Sync</span>
                <span style={{ fontSize: 11, color: lastSyncTs ? "#c4d8ee" : "#4a5c6a", fontFamily: "'DM Mono',monospace" }}>
                  {lastSyncTs ? new Date(lastSyncTs).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "—"}
                </span>
              </div>
              {/* Last Drive backup — a date, not a time: backups are weekly, so
                  "Jul 9, 2026" answers "am I protected?" better than a clock time. */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: "#4f8ef7", fontFamily: "'DM Mono',monospace" }}>Last Backup</span>
                <span style={{ fontSize: 11, color: lastWeeklyBackup ? "#c4d8ee" : "#4a5c6a", fontFamily: "'DM Mono',monospace" }}>
                  {lastWeeklyBackup
                    ? new Date(lastWeeklyBackup).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                    : "—"}
                </span>
              </div>
              <button
                onClick={() => { onSync(); setShowFreshnessPopup(false); }}
                style={{ width: "100%", padding: "7px 0", background: "rgba(79,142,247,.15)", border: "1px solid rgba(79,142,247,.35)", borderRadius: 8, color: "#7eb8d8", fontSize: 11, fontFamily: "'DM Mono',monospace", cursor: "pointer" }}
              >
                Sync Now
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RefillsCard({ meds }) {
  const [open, setOpen] = useState(false);
  const refills = get7DayRefills(meds);
  const now = new Date();
  const end = new Date(now); end.setDate(now.getDate() + 7);
  const fmt = d => d.toLocaleDateString("en-US", { month:"short", day:"numeric" });
  return (
    <div className="stat-card" style={{ cursor:"pointer" }} onClick={() => setOpen(o => !o)}>
      <div style={{ width:28, height:3, background:"#f59e0b", borderRadius:2, marginBottom:14, boxShadow:"0 0 10px #f59e0b60" }} />
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
        <div>
          <div style={{ fontSize:12, fontWeight:600, color:"#7eb8d8", marginBottom:6 }}>Refills ≤7 Days</div>
          <div style={{ fontSize:26, fontWeight:700, color:"#dde8f5", letterSpacing:"-1px", lineHeight:1, marginBottom:6 }}>{refills.length}</div>
          <div style={{ fontSize:10, color:"#98afc4", fontFamily:"'DM Mono',monospace" }}>{fmt(now)} – {fmt(end)}</div>
        </div>
        <div style={{ fontSize:14, color:"#f59e0b", marginTop:2, transition:"transform .2s", transform:open?"rotate(180deg)":"rotate(0deg)" }}>▾</div>
      </div>
      {open && (
        <div style={{ marginTop:12, paddingTop:10, borderTop:"1px solid #0d1a28" }}>
          {refills.length === 0
            ? <div style={{ fontSize:11, color:"#98afc4", fontFamily:"'DM Mono',monospace" }}>No refills due in the next 7 days</div>
            : refills.map((r, i) => (
              <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"5px 0", borderBottom:i<refills.length-1?"1px solid #0d1a28":"none" }}>
                <div style={{ width:5, height:5, borderRadius:"50%", background:"#f59e0b", flexShrink:0, marginTop:3 }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, color:"#c4d8ee" }}>{r.name}</div>
                  {r.rxNumber && <div style={{ fontSize:9, color:"#4a6070", fontFamily:"'DM Mono',monospace", marginTop:1 }}>Rx# {r.rxNumber}</div>}
                </div>
                <div style={{ fontSize:10, color:"#98afc4", fontFamily:"'DM Mono',monospace", flexShrink:0 }}>{r.refillDate}</div>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}
function BPCard({ readings }) {
  const r = readings[0] ?? {};
  return (
    <div className="stat-card">
      <div style={{ width:28, height:3, background:"#4f8ef7", borderRadius:2, marginBottom:14, boxShadow:"0 0 10px #4f8ef760" }} />
      <div style={{ fontSize:12, fontWeight:600, color:"#7eb8d8", marginBottom:6 }}>Blood Pressure</div>
      <div style={{ fontSize:26, fontWeight:700, color:"#dde8f5", letterSpacing:"-1px", lineHeight:1, marginBottom:6 }}>{r.bp_s ?? "--"}/{r.bp_d ?? "--"}</div>
      <div style={{ fontSize:10, color:"#98afc4", fontFamily:"'DM Mono',monospace" }}>Recorded {r.date ?? "--"}</div>
    </div>
  );
}
function getHeightInchesApp() {
  try {
    const p = JSON.parse(localStorage.getItem("mi_profile_personal") || "{}");
    const h = (p.height || "").trim();
    if (!h) return null;
    const m1 = h.match(/(\d+)\s*['′ft]+\s*(\d+)/i);
    if (m1) return parseInt(m1[1]) * 12 + parseInt(m1[2]);
    const m2 = h.match(/^(\d+\.?\d*)\s*(in|")?$/i);
    if (m2) { const n = parseFloat(m2[1]); if (n > 48 && n < 110) return n; }
    const m3 = h.match(/(\d+\.?\d*)\s*cm/i);
    if (m3) return parseFloat(m3[1]) / 2.54;
    return null;
  } catch { return null; }
}
function calcBMIApp(weightLbs) {
  const h = getHeightInchesApp();
  if (!h || !weightLbs) return null;
  return +((weightLbs / (h * h)) * 703).toFixed(1);
}

function BMICard({ readings }) {
  const weight = readings.find(r => r.weight != null)?.weight;
  const bmi = calcBMIApp(weight);
  const { label, color } = bmi == null
    ? { label: weight ? "Set height in Profile" : "No weight data", color: "#98afc4" }
    : bmi < 18.5 ? { label: "Underweight", color: "#4f8ef7" }
    : bmi < 25   ? { label: "Normal",      color: "#10b981" }
    : bmi < 30   ? { label: "Overweight",  color: "#f59e0b" }
    :              { label: "Obese",        color: "#ef4444" };
  return (
    <div className="stat-card">
      <div style={{ width:28, height:3, background:"#10b981", borderRadius:2, marginBottom:14, boxShadow:"0 0 10px #10b98160" }} />
      <div style={{ fontSize:12, fontWeight:600, color:"#7eb8d8", marginBottom:6 }}>BMI</div>
      <div style={{ fontSize:26, fontWeight:700, color:"#dde8f5", letterSpacing:"-1px", lineHeight:1, marginBottom:6 }}>{bmi != null ? bmi : "--"}</div>
      <div style={{ fontSize:11, color, fontWeight:600, marginBottom:3 }}>{label}</div>
      <div style={{ fontSize:10, color:"#98afc4", fontFamily:"'DM Mono',monospace" }}>
        {weight != null ? `From ${weight} lbs · auto-calculated` : "Log weight in Vitals"}
      </div>
    </div>
  );
}

function WeightCard({ readings }) {
  const cur  = readings[0]?.weight;
  const prev = readings[1]?.weight;
  const diff = (cur != null && prev != null) ? Math.round((cur - prev) * 10) / 10 : null;
  const trend  = diff == null ? "flat" : diff < 0 ? "down" : diff > 0 ? "up" : "flat";
  const arrow  = { up:"↑", down:"↓", flat:"→" }[trend];
  const tcolor = { up:"#ef4444", down:"#10b981", flat:"#7eb8d8" }[trend];
  const tlabel = diff == null ? "" : diff === 0 ? "no change" : `${diff > 0 ? "+" : ""}${diff} lbs`;
  return (
    <div className="stat-card">
      <div style={{ width:28, height:3, background:"#a78bfa", borderRadius:2, marginBottom:14, boxShadow:"0 0 10px #a78bfa60" }} />
      <div style={{ fontSize:12, fontWeight:600, color:"#7eb8d8", marginBottom:6 }}>Weight</div>
      <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:6 }}>
        <div style={{ fontSize:26, fontWeight:700, color:"#dde8f5", letterSpacing:"-1px", lineHeight:1 }}>{cur != null ? `${cur} lbs` : "--"}</div>
        {diff != null && <div style={{ fontSize:16, color:tcolor, fontWeight:700 }}>{arrow}</div>}
      </div>
      <div style={{ fontSize:10, color:"#98afc4", fontFamily:"'DM Mono',monospace" }}>
        Recorded {readings[0]?.date ?? "--"}{tlabel ? <> · <span style={{ color:tcolor }}>{tlabel}</span></> : null}
      </div>
    </div>
  );
}

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
  const [readings, setReadings]   = useState(() => getStore('readings'));
  const [meds, setMeds]           = useState(() => getStore('meds_full'));
  const [alerts, setAlerts]       = useState(() => {
    const stored = getStore('alerts').map((a, i) => ({ ...a, fp: `stored:${i}:${(a.text||"").substring(0,40)}`, source:"stored" }));
    const auto = generateAutoAlerts();
    return [...auto, ...stored].slice(0, 10);
  });
  const [upcoming, setUpcoming]   = useState(() => {
    // Prefer appointments store (Tab14); fall back to legacy mi_upcoming / defaults
    try {
      const raw = localStorage.getItem("mi_appointments");
      if (raw) {
        const appts = JSON.parse(raw);
        return appts
          .filter(a => a.status === "upcoming")
          .sort((a, b) => new Date(a.date) - new Date(b.date))
          .slice(0, 5)
          .map(a => ({
            label:    a.title,
            date:     new Date(a.date + "T12:00:00").toLocaleDateString("en-US", { month:"short", day:"numeric" }),
            urgency:  a.urgency,
            doctor:   a.provider,
            facility: a.facility || "",
            address:  a.address  || "",
          }));
      }
    } catch {}
    return getStore('upcoming');
  });
  const [lastImport, setLastImport] = useState(() => getStore('lastImport'));
  const [activeConditions, setActiveConditions] = useState(() => {
    try {
      const raw = localStorage.getItem("mi_conditions");
      if (raw) return JSON.parse(raw).filter(c => c.status === "active");
    } catch {}
    return [];
  });
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

  // Everything the dashboard renders, re-read from storage in one place.
  //
  // The dashboard, the Vitals tab and the phone must agree. They did not: Tab06
  // re-reads on every "mi-data-synced" event, and the dashboard only re-read
  // when you navigated TO it. So a reading logged on the companion and merged in
  // by a Drive sync showed up under Vitals but the dashboard kept displaying the
  // previous figure until you navigated away and back. Same gap for a vitals
  // save made anywhere else in the app (saveReading dispatches this event) and
  // for an RIE fix.
  //
  // refreshFromDrive re-read only readings + meds, so appointments, alerts and
  // conditions were stale after a sync too — and activeConditions was never
  // re-read at all after mount, so a condition added mid-session never reached
  // the dashboard summary until a full page reload. One function now covers all
  // of it, so a new dashboard field cannot quietly miss the refresh path.
  const refreshDashboardData = useCallback(() => {
    setReadings(getStore('readings'));
    setMeds(getStore('meds_full'));
    // Refresh auto-alerts from flagged labs + vitals
    const auto = generateAutoAlerts();
    const stored = getStore('alerts').map((a, i) => ({ ...a, fp: `stored:${i}:${(a.text||"").substring(0,40)}`, source:"stored" }));
    setAlerts([...auto, ...stored].slice(0, 10));
    try {
      const raw = localStorage.getItem("mi_conditions");
      if (raw) setActiveConditions(JSON.parse(raw).filter(c => c.status === "active"));
    } catch {}
    try {
      const raw = localStorage.getItem("mi_appointments");
      if (raw) {
        const appts = JSON.parse(raw);
        const next = appts
          .filter(a => a.status === "upcoming")
          .sort((a, b) => new Date(a.date) - new Date(b.date))
          .slice(0, 5)
          .map(a => ({
            label:    a.title,
            date:     new Date(a.date + "T12:00:00").toLocaleDateString("en-US", { month:"short", day:"numeric" }),
            urgency:  a.urgency,
            doctor:   a.provider,
            facility: a.facility || "",
            address:  a.address  || "",
          }));
        if (next.length > 0) setUpcoming(next);
      }
    } catch {}
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
      setReadings(getStore('readings'));
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
      const merged = [...parsed.alerts, ...getStore('alerts')];
      setStore('alerts', merged);
      setAlerts(merged);
    }
    if (parsed.upcoming?.length) {
      const merged = [...parsed.upcoming, ...getStore('upcoming')];
      setStore('upcoming', merged);
      setUpcoming(merged);
    }
    if (parsed.records?.length) {
      mergeRecords(parsed.records);
    }
    const ts = new Date().toISOString();
    addImportLog({ ts, source: parsed.source ?? "Import", records: parsed.totalRecords ?? 0 });
    setLastImport(ts);
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

  const handleDismissAlert = useCallback((fp, source) => {
    if (source === "stored") {
      // Remove from mi_alerts by index encoded in fp ("stored:<idx>:<text>")
      const idx = parseInt((fp.split(":")[1]) || "-1");
      if (idx >= 0) {
        const stored = getStore('alerts');
        setStore('alerts', stored.filter((_, i) => i !== idx));
      }
    } else {
      // Auto alert — add fingerprint to dismissed list so it won't re-appear
      const dismissed = (() => { try { return JSON.parse(localStorage.getItem("mi_dismissed_alerts") || "[]"); } catch { return []; } })();
      if (!dismissed.includes(fp)) {
        dismissed.push(fp);
        localStorage.setItem("mi_dismissed_alerts", JSON.stringify(dismissed));
      }
    }
    setAlerts(prev => prev.filter(a => a.fp !== fp));
  }, []);

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
        .stat-card { background:#0b1220; border:1px solid #111e30; border-radius:14px; padding:20px; position:relative; overflow:hidden; transition:border-color .2s; animation: fadeUp .4s ease both; }
        .stat-card:hover { border-color:#1a2f4a; }
        .stat-card::after { content:''; position:absolute; inset:0; background:linear-gradient(135deg, rgba(255,255,255,.015) 0%, transparent 60%); pointer-events:none; }
        .alert-row { display:flex; align-items:flex-start; gap:10px; padding:11px 14px; border-radius:10px; background:#0b1220; border:1px solid #111e30; margin-bottom:8px; animation:fadeUp .4s ease both; }
        .upcoming-row { display:flex; align-items:center; gap:12px; padding:12px 14px; border-radius:10px; background:#0b1220; border:1px solid #111e30; margin-bottom:8px; cursor:pointer; transition:border-color .15s; animation:fadeUp .4s ease both; }
        .upcoming-row:hover { border-color:#1a2f4a; }
        .vital-row { display:grid; grid-template-columns:80px 100px 50px 60px; gap:0; padding:10px 0; border-bottom:1px solid #0d1a28; align-items:center; font-size:12px; }
        .vital-row:last-child { border-bottom:none; }
        .section-label { font-size:10px; letter-spacing:1.5px; text-transform:uppercase; color:#a0b4c8; font-family:'DM Mono', monospace; margin-bottom:12px; }
        .badge-dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; margin-top:5px; }
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

              {/* Topbar */}
              <div style={{ height: 54, background: "#080c14", borderBottom: "1px solid #0d1a28", display: "flex", alignItems: "center", padding: "0 16px", gap: 12, flexShrink: 0 }}>
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                  {activeNav !== "dashboard" && (
                    <button
                      onClick={() => setActiveNav("dashboard")}
                      title="Home"
                      style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2, background:"rgba(79,142,247,.10)", border:"1px solid rgba(79,142,247,.3)", borderRadius:8, cursor:"pointer", padding:"5px 10px", color:"#7eb8d8", transition:"all .15s", marginRight:4 }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(79,142,247,.20)"; e.currentTarget.style.borderColor = "rgba(79,142,247,.5)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "rgba(79,142,247,.10)"; e.currentTarget.style.borderColor = "rgba(79,142,247,.3)"; }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                        <polyline points="9 22 9 12 15 12 15 22"/>
                      </svg>
                      <span style={{ fontSize:9, fontFamily:"'DM Mono',monospace" }}>Home</span>
                    </button>
                  )}
                  {/* UI-26: Search sits beside Home, same visual weight */}
                  {/* tripwire advisory §5: persistent Emergency Info (topbar) */}
                  <EmergencyInfoButton variant="topbar" />
                  <button
                    onClick={() => setShowSearch(true)}
                    title="Search"
                    aria-label="Search"
                    style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2, background:"rgba(79,142,247,.10)", border:"1px solid rgba(79,142,247,.3)", borderRadius:8, cursor:"pointer", padding:"5px 10px", color:"#7eb8d8", transition:"all .15s", marginRight:4 }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(79,142,247,.20)"; e.currentTarget.style.borderColor = "rgba(79,142,247,.5)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "rgba(79,142,247,.10)"; e.currentTarget.style.borderColor = "rgba(79,142,247,.3)"; }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <span style={{ fontSize:9, fontFamily:"'DM Mono',monospace" }}>Search</span>
                  </button>
                  <div className="live-dot" />
                  <span style={{ fontSize: 11, color: "#98afc4", fontFamily: "'DM Mono',monospace" }}>{fmtDate(time)} · {fmt(time)}</span>
                </div>
                {/* ── Google Drive sync ── */}
                {googleUser ? (
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ fontSize:9, fontFamily:"'DM Mono',monospace", color: syncStatus==="syncing"?"#f59e0b" : syncStatus==="error"?"#ef4444" : lastSyncTs?"#10b981":"#4a5c6a" }}>
                      {syncStatus==="syncing" ? "Syncing…" : syncStatus==="error" ? "Sync error" : lastSyncTs ? `↑ ${new Date(lastSyncTs).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}` : ""}
                    </span>
                    <button onClick={signIn} title="Sync with Google Drive" style={{ padding:"3px 8px", background:"rgba(16,185,129,.08)", border:"1px solid rgba(16,185,129,.2)", borderRadius:6, color:"#10b981", fontSize:9, fontFamily:"'DM Mono',monospace", cursor:"pointer" }}>↑↓</button>
                    {googleUser.picture
                      ? <img src={googleUser.picture} alt="" title={`${googleUser.name}\n${googleUser.email}\n\nClick to disconnect`} style={{ width:28, height:28, borderRadius:"50%", border:"1px solid #1a2f4a", cursor:"pointer" }} onClick={signOut} />
                      : <div style={{ width:28, height:28, borderRadius:"50%", background:"linear-gradient(135deg,#4f8ef7,#a78bfa)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, cursor:"pointer" }} onClick={signOut}>{(googleUser.name||"G")[0].toUpperCase()}</div>
                    }
                  </div>
                ) : (
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <button onClick={signIn} style={{ display:"flex", alignItems:"center", gap:5, padding:"4px 10px", background:"rgba(255,255,255,.04)", border:"1px solid #1a2f4a", borderRadius:20, color:"#98afc4", fontSize:10, fontFamily:"'DM Mono',monospace", cursor:"pointer" }}>
                      <svg width="11" height="11" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                      Backup
                    </button>
                    <div style={{ width:28, height:28, background:"linear-gradient(135deg,#4f8ef7,#a78bfa)", borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700 }}>
                      {(() => { try { const p = JSON.parse(localStorage.getItem("mi_profile_personal") || "{}"); return (p.name || "?")[0].toUpperCase(); } catch { return "?"; } })()}
                    </div>
                  </div>
                )}
              </div>

              {/* Content */}
              <div style={{ flex: 1, overflowY: "auto", padding: activeNav === "dashboard" ? "28px" : "0" }}>

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
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:12, fontWeight:600, color:"#dde8f5" }}>Weekly backup overdue</div>
                          <div style={{ fontSize:11, color:"#98afc4", fontFamily:"'DM Mono',monospace", marginTop:2 }}>
                            {/* UI-2: never "NaN days ago" — unparseable timestamps fall back */}
                            {daysAgoLabel(lastWeeklyBackup, null)
                              ? `Last backed up ${daysAgoLabel(lastWeeklyBackup, null)}.`
                              : "Your data has never been backed up."}
                            {" "}Connect Google Drive in Settings for automatic weekly backups{isFolderBackupSupported() ? " — or choose a backup folder in Export & Backup (no Google needed)" : ""}.
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
                          style={{ padding:"7px 14px", background:"rgba(79,142,247,.15)", border:"1px solid rgba(79,142,247,.35)", borderRadius:8, color:"#7eb8d8", fontSize:11, fontFamily:"'DM Mono',monospace", cursor:"pointer", fontWeight:600, whiteSpace:"nowrap" }}
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

                    <div style={{ marginBottom: 26 }}>
                      <h1 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 28, color: "#dde8f5", fontWeight: 400, letterSpacing: "-0.5px" }}>
                        {(time.getHours() < 12 ? "Good morning" : time.getHours() < 17 ? "Good afternoon" : "Good evening")}
                        {(() => { try { const p = JSON.parse(localStorage.getItem("mi_profile_personal") || "{}"); const first = (p.name || "").split(" ")[0]; return first ? `, ${first}.` : "."; } catch { return "."; } })()}
                      </h1>
                      <p style={{ fontSize: 12, color: "#98afc4", marginTop: 5, fontFamily: "'DM Mono',monospace" }}>{upcoming.length} upcoming event{upcoming.length !== 1 ? "s" : ""} · {alerts.length} alert{alerts.length !== 1 ? "s" : ""} need{alerts.length === 1 ? "s" : ""} attention</p>
                    </div>

                    <DashboardHotButtons
                      setActiveNav={setActiveNav}
                      syncStatus={syncStatus}
                      lastSyncTs={lastSyncTs}
                      lastWeeklyBackup={lastWeeklyBackup}
                      onSync={signIn}
                      meds={meds}
                      onLogVitals={() => { setQuickReading(q => ({ ...q, date: q.date || new Date().toISOString().slice(0, 10) })); setShowVitalsModal(true); }}
                    />

                    {/* History Builder next-step card (HISTORY_BUILDER_SPEC section 6):
                        the same single dismissible card as the builder home, mounted
                        once on the Dashboard. Coexists with the onboarding task cards
                        below; the overlap is logged in the WO session report. */}
                    <HbPromptCard onOpenBuilder={() => setActiveNav("history")} />

                    {/* §7 ongoing task engine (ONBOARDING_SPEC v1.1): max 4,
                        priority-ordered, benefit before ask, no percentages. */}
                    <TaskCards onNav={setActiveNav} />

                    {/* ── Current Vitals panel ── */}
                    {(() => {
                      const latestBP      = readings.find(r => r.bp_s != null && r.bp_d != null);
                      const latestHR      = readings.find(r => r.hr != null);
                      const latestRHR     = readings.find(r => r.resting_hr != null);
                      const latestO2      = readings.find(r => r.o2 != null);
                      const latestWeight  = readings.find(r => r.weight != null);
                      const latestTemp    = readings.find(r => r.temp != null);
                      const latestGlucose = readings.find(r => r.glucose != null);
                      const latestSleep   = readings.find(r => r.sleep != null);
                      const bmi           = calcBMIApp(latestWeight?.weight);
                      const vitals = [
                        // Dark orange, not red: red is reserved for genuinely urgent
                        // readings. A flagged value still renders #ef4444 below via the
                        // `flag` branch, so out-of-range BP stays red — it is only the
                        // resting colour that stops shouting.
                        { label:"Blood Pressure", val: latestBP ? `${latestBP.bp_s}/${latestBP.bp_d}` : null, unit:"mmHg", date:latestBP?.date, color:"#ea580c", flag:!!latestBP?.flag },
                        { label:"Heart Rate",      val: latestHR?.hr,             unit:"bpm",   date:latestHR?.date,      color:"#f59e0b" },
                        { label:"Resting HR",      val: latestRHR?.resting_hr,    unit:"bpm",   date:latestRHR?.date,     color:"#f87171" },
                        { label:"O2 Sat",          val: latestO2?.o2,             unit:"%",     date:latestO2?.date,      color:"#4f8ef7" },
                        { label:"Weight",          val: latestWeight?.weight,     unit:"lbs",   date:latestWeight?.date,  color:"#a78bfa" },
                        { label:"Temperature",     val: latestTemp?.temp,         unit:"°F", date:latestTemp?.date,  color:"#f59e0b" },
                        { label:"Glucose",         val: latestGlucose?.glucose,   unit:"mg/dL", date:latestGlucose?.date, color:"#10b981" },
                        { label:"Sleep",           val: latestSleep?.sleep,       unit:"hrs",   date:latestSleep?.date,   color:"#60a5fa" },
                        { label:"BMI",             val: bmi,                      unit:"",      date:latestWeight?.date,  color:"#10b981" },
                      ];
                      return (
                        <div style={{ background:"#0b1220", border:"1px solid #111e30", borderRadius:14, padding:"18px 20px", marginBottom:14 }}>
                          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                            <div className="section-label" style={{ marginBottom:0 }}>Current Vitals</div>
                            <div style={{ fontSize:10, color:"#4f8ef7", fontFamily:"'DM Mono',monospace", cursor:"pointer" }} onClick={() => setActiveNav("vitals")}>Log / View all →</div>
                          </div>
                          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(100px, 1fr))", gap:8 }}>
                            {vitals.map(({ label, val, unit, date, color, flag }) => (
                              <div key={label} style={{ background:"#080c14", border:`1px solid ${flag ? "rgba(239,68,68,.25)" : "#0d1a28"}`, borderRadius:8, padding:"10px 12px" }}>
                                <div style={{ fontSize:9, color:"#a0b4c8", fontFamily:"'DM Mono',monospace", marginBottom:4 }}>{label}</div>
                                <div style={{ fontSize:14, fontWeight:700, color: val != null ? (flag ? "#ef4444" : color) : "#4a5c6a", lineHeight:1, marginBottom:2 }}>
                                  {val != null ? `${val}${unit ? " " + unit : ""}` : "—"}
                                </div>
                                {date && val != null && <div style={{ fontSize:8, color:"#6a8090", fontFamily:"'DM Mono',monospace" }}>{date}</div>}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 300px", gap: 14, marginBottom: 24 }}>
                      <div>
                        <div className="section-label">Upcoming Care</div>
                        {upcoming.map(({ label, date, urgency, doctor, facility, address }, i) => (
                          <div className="upcoming-row" key={label} style={{ animationDelay: `${200 + i * 60}ms` }} onClick={() => setActiveNav("appointments")}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: urgency === "high" ? "#ef4444" : urgency === "med" ? "#f59e0b" : "#10b981", flexShrink: 0, boxShadow: `0 0 8px ${urgency === "high" ? "#ef4444" : urgency === "med" ? "#f59e0b" : "#10b981"}80` }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 500, color: "#c4d8ee", marginBottom: 2 }}>{label}</div>
                              <div style={{ fontSize: 10, color: "#98afc4", fontFamily: "'DM Mono',monospace" }}>{doctor}</div>
                              {(facility || address) && (
                                <div style={{ fontSize: 9, color: "#6a8090", fontFamily: "'DM Mono',monospace", marginTop: 1 }}>
                                  {[facility, address].filter(Boolean).join(" · ")}
                                </div>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: urgency === "high" ? "#ef4444" : "#7eb8d8", fontWeight: 600, fontFamily: "'DM Mono',monospace" }}>{date}</div>
                          </div>
                        ))}
                      </div>

                      <div>
                        <div className="section-label">Active Alerts</div>
                        {alerts.length === 0 && (
                          <div style={{ fontSize: 11, color: "#4a5c6a", fontFamily: "'DM Mono',monospace", padding: "10px 0" }}>No active alerts</div>
                        )}
                        {alerts.map(({ type, text, time: t, fp, source }, i) => (
                          <div className="alert-row" key={fp || i} style={{ animationDelay: `${260 + i * 60}ms`, borderLeft: `3px solid ${type === "warn" ? "#f59e0b" : type === "ok" ? "#10b981" : "#4f8ef7"}` }}>
                            <div className="badge-dot" style={{ background: type === "warn" ? "#f59e0b" : type === "ok" ? "#10b981" : "#4f8ef7", boxShadow: `0 0 6px ${type === "warn" ? "#f59e0b" : type === "ok" ? "#10b981" : "#4f8ef7"}60` }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 12, color: "#a8c4dc", lineHeight: 1.45 }}>{text}</div>
                            </div>
                            <div style={{ fontSize: 10, color: "#a0b4c8", fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>{t}</div>
                            {fp && (
                              <button
                                onClick={() => handleDismissAlert(fp, source)}
                                style={{ marginLeft: 8, background: "none", border: "none", color: "#6a8090", fontSize: 14, lineHeight: 1, padding: "0 4px", cursor: "pointer", flexShrink: 0, opacity: 0.75 }}
                                title="Dismiss alert"
                                onMouseEnter={e => e.currentTarget.style.opacity = "1"}
                                onMouseLeave={e => e.currentTarget.style.opacity = "0.75"}
                              >✕</button>
                            )}
                          </div>
                        ))}
                      </div>

                      <div>
                        <div className="section-label">AI Analysis</div>
                        <div style={{ background: "#0b1220", border: "1px solid #111e30", borderRadius: 14, padding: 16 }}>
                          <div style={{ fontSize: 11, color: "#98afc4", marginBottom: 12, lineHeight: 1.5, fontFamily: "'DM Mono',monospace" }}>Cross-references all your data automatically.</div>
                          {["Analyze my current health status", "Review my medications for interactions", "Prep for Hepatology appt"].map((q, i) => (
                            <button key={i} className="ai-btn" onClick={() => { localStorage.setItem("mi_ai_pending", q); setActiveNav("ai"); }} style={{ marginBottom: 8, animationDelay: `${320 + i * 50}ms`, justifyContent: "flex-start", textAlign: "left" }}>
                              <span style={{ color: "#4f8ef7", fontSize: 14 }}>✦</span>
                              <span>{q}</span>
                            </button>
                          ))}
                          <button className="ai-btn" onClick={() => setActiveNav("ai")} style={{ marginTop: 4, borderStyle: "dashed" }}>
                            <span>Custom query...</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* ── Care Team / Doctor Cards ── */}
                    {(() => {
                      let team = [];
                      let selectedNames = null;
                      try { const t = JSON.parse(localStorage.getItem("mi_care_team") || "[]"); if (Array.isArray(t)) team = t; } catch {}
                      try {
                        const raw = localStorage.getItem("mi_care_team_selected");
                        if (raw) selectedNames = new Set(JSON.parse(raw));
                      } catch {}
                      // Filter to selected doctors only; fall back to all if no selection saved
                      const visible = selectedNames
                        ? team.filter(d => selectedNames.has(d.name))
                        : team;
                      if (visible.length === 0) return null;
                      return (
                        <div style={{ background:"#0b1220", border:"1px solid #111e30", borderRadius:14, padding:"16px 20px", marginBottom:14 }}>
                          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                            <div className="section-label" style={{ marginBottom:0 }}>Care Team</div>
                            <div style={{ fontSize:10, color:"#4f8ef7", fontFamily:"'DM Mono',monospace", cursor:"pointer" }} onClick={() => setActiveNav("careplan")}>Manage →</div>
                          </div>
                          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))", gap:10 }}>
                            {visible.slice(0,10).map((d, i) => {
                              const initials = (d.name || "").split(" ").filter(w => /^[A-Z]/.test(w)).slice(0,2).map(w=>w[0]).join("") || "?";
                              const accentColor = d.color || "#4f8ef7";
                              return (
                                <div key={i} style={{ background:"#080c14", border:"1px solid #0d1a28", borderRadius:10, padding:"12px 14px", display:"flex", alignItems:"flex-start", gap:10 }}>
                                  {/* Avatar */}
                                  <div style={{ width:36, height:36, borderRadius:"50%", background: d.pcp ? "linear-gradient(135deg,rgba(79,142,247,.3),rgba(167,139,250,.2))" : `${accentColor}18`, border:`1px solid ${d.pcp ? "rgba(79,142,247,.4)" : accentColor + "28"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:600, color: accentColor, flexShrink:0 }}>
                                    {initials}
                                  </div>
                                  {/* Info */}
                                  <div style={{ flex:1, minWidth:0 }}>
                                    <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", marginBottom:2 }}>
                                      <span style={{ fontSize:13, fontWeight:600, color:"#c4d8ee" }}>{d.name || "—"}</span>
                                      {d.pcp && <span style={{ fontSize:9, background:"rgba(79,142,247,.12)", color:"#4f8ef7", border:"1px solid rgba(79,142,247,.25)", borderRadius:10, padding:"1px 7px", fontFamily:"'DM Mono',monospace" }}>PCP</span>}
                                    </div>
                                    {(d.role || d.specialty) && <div style={{ fontSize:10, color:"#7eb8d8", fontFamily:"'DM Mono',monospace", marginBottom:1 }}>{d.role}{d.specialty ? ` · ${d.specialty}` : ""}</div>}
                                    {d.facility && <div style={{ fontSize:10, color:"#98afc4", fontFamily:"'DM Mono',monospace", marginBottom:1 }}>{d.facility}</div>}
                                    {d.phone && <div style={{ fontSize:11, color:"#4f8ef7", fontFamily:"'DM Mono',monospace" }}>{d.phone}</div>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Active Conditions */}
                    {activeConditions.length > 0 && (
                      <div style={{ background:"#0b1220", border:"1px solid #111e30", borderRadius:14, padding:"16px 20px", marginBottom:14 }}>
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                          <div className="section-label" style={{ marginBottom:0 }}>Active Conditions</div>
                          <div style={{ fontSize:10, color:"#4f8ef7", fontFamily:"'DM Mono',monospace", cursor:"pointer" }} onClick={() => setActiveNav("conditions")}>Manage →</div>
                        </div>
                        <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                          {activeConditions.map(c => (
                            <div key={c.id} style={{ background:"rgba(239,68,68,.08)", border:"1px solid rgba(239,68,68,.2)", borderRadius:20, padding:"4px 12px", fontSize:11, color:"#ef4444", fontFamily:"'DM Mono',monospace" }}>
                              {c.name}{c.icd10 ? ` · ${c.icd10}` : ""}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── Featured Lab Results ── */}
                    {(() => {
                      const featuredLabs = getFeaturedLabs();
                      const hasAny = featuredLabs.some(f => f.lab);
                      if (!hasAny) return null;
                      return (
                        <div style={{ background: "#0b1220", border: "1px solid #111e30", borderRadius: 14, padding: "18px 20px", marginBottom: 14 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                            <div className="section-label" style={{ marginBottom: 0 }}>Recent Lab Results</div>
                            <div style={{ fontSize: 10, color: "#4f8ef7", fontFamily: "'DM Mono',monospace", cursor: "pointer" }} onClick={() => setActiveNav("labs")}>View all →</div>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
                            {featuredLabs.map(({ label, lab }) => {
                              if (!lab) return (
                                <div key={label} style={{ background: "#080c14", border: "1px solid #0d1a28", borderRadius: 8, padding: "10px 12px", opacity: 0.45 }}>
                                  <div style={{ fontSize: 9, color: "#a0b4c8", fontFamily: "'DM Mono',monospace", marginBottom: 4 }}>{label}</div>
                                  <div style={{ fontSize: 13, color: "#6a8090" }}>—</div>
                                </div>
                              );
                              const val = parseFloat(lab.value);
                              const isFlag = lab.flag;
                              const color = isFlag ? "#f59e0b" : "#10b981";
                              return (
                                <div key={label} style={{ background: "#080c14", border: `1px solid ${isFlag ? "rgba(245,158,11,.25)" : "#0d1a28"}`, borderRadius: 8, padding: "10px 12px" }}>
                                  <div style={{ fontSize: 9, color: "#a0b4c8", fontFamily: "'DM Mono',monospace", marginBottom: 4 }}>{label}</div>
                                  <div style={{ fontSize: 15, fontWeight: 700, color, lineHeight: 1 }}>{lab.value}</div>
                                  <div style={{ fontSize: 8, color: "#6a8090", fontFamily: "'DM Mono',monospace", marginTop: 2 }}>{lab.unit || ""}{lab.date ? ` · ${lab.date.slice(5).replace("-","/")}` : ""}</div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

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
            <div style={{ fontSize:11, fontWeight:700, color:"#dde8f5", fontFamily:"'DM Mono',monospace", letterSpacing:"2px", textTransform:"uppercase", marginBottom:20 }}>New Vital Reading</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:12, marginBottom:20 }}>
              <div>
                <label style={{ fontSize:9, color:"#a0b4c8", fontFamily:"'DM Mono',monospace", display:"block", marginBottom:5 }}>DATE</label>
                <input
                  type="date"
                  style={{ background:"#080c14", border:"1px solid #1a2f4a", borderRadius:6, padding:"8px 10px", fontSize:13, color:"#c4d8ee", fontFamily:"'Sora',sans-serif", width:"100%", outline:"none" }}
                  value={quickReading.date}
                  onChange={e => setQuickReading(prev => ({ ...prev, date: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ fontSize:9, color:"#a0b4c8", fontFamily:"'DM Mono',monospace", display:"block", marginBottom:5 }}>TIME (OPTIONAL)</label>
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
                  <label style={{ fontSize:9, color:"#a0b4c8", fontFamily:"'DM Mono',monospace", display:"block", marginBottom:5 }}>{f.label}</label>
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
              <div style={{ fontSize:9, color: hasHard ? "#f87171" : "#f59e0b", fontFamily:"'DM Mono',monospace", letterSpacing:"1.5px", marginBottom:6 }}>
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
                    <div style={{ fontSize:11, color:"#98afc4" }}>No suggested correction — please edit the value manually.</div>
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
                  style={{ flex: hasHard ? 1 : "none", padding:"11px 16px", background:"#0b1220", border:"1px solid #111e30", borderRadius:9, color:"#b0c4d8", fontSize:13, fontFamily:"'Sora',sans-serif", cursor:"pointer" }}>
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
