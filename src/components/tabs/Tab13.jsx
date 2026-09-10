import { useState, useEffect } from "react";
import { PrintLabel } from "../icons.jsx";
import { daysAgoLabel, formatDateUS } from "../../lib/displaySafe.js";
import ConsentText, { printConsent } from "../PrintableConsent";
import { CONSENT_VERSION } from "../../config/urgencyThresholds";
import { loadDemoData } from "../../demoData.js";
import { uploadWeeklyBackup, readSyncDiag, getVaultFingerprint } from "../../lib/driveSync.js";
import { isFolderBackupSupported, getFolderStatus, chooseBackupFolder, clearBackupFolder, backupToFolder, isEncryptedBackupPayload, restoreEncryptedBackup } from "../../lib/folderBackup.js";
import { unlock, changePassphrase, isUnlocked, isDemoMode } from "../../lib/secureStorage.js";
import { ensureReportFolders, getReportFolderState, REPORT_ROOT } from "../../lib/driveReports.js";
import PasswordInput from "../PasswordInput.jsx"; // WO-5: show/hide toggle
import { getAccessToken } from "../../lib/googleAuth.js";
import { APP_VERSION } from "../../version.js";
import { getAutoLockMinutes, setAutoLockMinutes, AUTOLOCK_OPTIONS } from "../../lib/autoLock.js";
import { getPilotToken, setPilotToken } from "../../lib/pilotAuth.js";

const INITIAL_BACKUPS = [];

function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2800); return () => clearTimeout(t); }, []);
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, background: "#0b1220", border: "1px solid #10b981", borderRadius: 10, padding: "12px 18px", fontSize: 12, color: "#2dd4a0", fontFamily: "'DM Mono', monospace", zIndex: 200 }}>
      ✓ {msg}
    </div>
  );
}

// ── Report archive row (v1.48.0) ─────────────────────────────────────────────
// One-click creation of the standard "Insina Health Reports" folder structure
// in the patient's own Drive. Hidden in demo mode — a demo visitor's real
// Drive must never be touched. The app can create these folders but (by the
// deliberate drive.file scope) cannot see files the patient drops into them
// via the Drive UI — report links are attached per entry, automatically on
// import or pasted by hand.
function ReportArchiveRow({ showToast }) {
  const [folders, setFolders] = useState(getReportFolderState);
  const [busy, setBusy]       = useState(false);
  if (isDemoMode()) return null;

  async function setup() {
    setBusy(true);
    const state = await ensureReportFolders({ interactive: true });
    setBusy(false);
    if (state) { setFolders(state); showToast("Report folders ready in your Drive ✓"); }
    else showToast("Couldn't set up folders. Connect Google Drive first");
  }

  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", paddingTop:10, marginTop:10, borderTop:"1px solid #1c2a40" }}>
      <div>
        <div style={{ fontSize:12, fontWeight:600, color:"#a0b4c8", fontFamily:"'DM Mono',monospace", marginBottom:2 }}>REPORT ARCHIVE</div>
        <div style={{ fontSize:12, color:"#6a8090", fontFamily:"'DM Mono',monospace", lineHeight:1.6 }}>
          {folders
            ? <>“{REPORT_ROOT}” is set up in your Drive: imported reports are filed there automatically.{" "}
                {folders.rootLink && <a href={folders.rootLink} target="_blank" rel="noopener noreferrer" style={{ color:"#7eb8d8" }}>Open folder ↗</a>}</>
            : <>Create a standard folder structure in your Drive (“{REPORT_ROOT}”) so original reports have one predictable home. Imports file themselves there and keep a link on the entry.</>}
        </div>
      </div>
      <button onClick={setup} disabled={busy} style={{ padding:"8px 16px", background:"transparent", border:"1px solid #1c2a40", borderRadius:8, color:"#b0c4d8", fontFamily:"'Sora',sans-serif", fontSize:12, cursor:"pointer", whiteSpace:"nowrap", flexShrink:0, marginLeft:14, opacity: busy ? 0.6 : 1 }}>
        {busy ? "Setting up…" : folders ? "Re-check folders" : "Set up report folders"}
      </button>
    </div>
  );
}

function ConfirmModal({ title, body, confirmLabel, confirmStyle, onConfirm, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#0b1220", border: "1px solid #1a2f4a", borderRadius: 14, padding: 28, width: 440 }}>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: "#dde8f5", marginBottom: 10 }}>{title}</div>
        <div style={{ fontSize: 13, color: "#7eb8d8", lineHeight: 1.65, marginBottom: 22 }}>{body}</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ padding: "8px 18px", background: "transparent", border: "1px solid #1c2a40", borderRadius: 8, color: "#b0c4d8", fontFamily: "'Sora', sans-serif", cursor: "pointer", fontSize: 12 }}>Cancel</button>
          <button onClick={onConfirm} style={{ padding: "8px 18px", borderRadius: 8, fontFamily: "'Sora', sans-serif", cursor: "pointer", fontSize: 12, ...confirmStyle }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function ApiKeyModal({ current, onSave, onClose }) {
  const [val, setVal] = useState(current || "");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#0b1220", border: "1px solid #1a2f4a", borderRadius: 14, padding: 28, width: 440 }}>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: "#dde8f5", marginBottom: 6 }}>Anthropic API Key</div>
        <div style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono', monospace", marginBottom: 16 }}>Stored locally in your browser · never transmitted to any server</div>
        <input
          value={val}
          onChange={e => setVal(e.target.value)}
          placeholder="sk-ant-api03-..."
          type="password"
          style={{ width: "100%", background: "#07090f", border: "1px solid #1c2a40", borderRadius: 8, padding: "8px 12px", color: "#a8c4dc", fontFamily: "'DM Mono', monospace", fontSize: 12, outline: "none", marginBottom: 16 }}
        />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 18px", background: "transparent", border: "1px solid #1c2a40", borderRadius: 8, color: "#b0c4d8", fontFamily: "'Sora', sans-serif", cursor: "pointer", fontSize: 12 }}>Cancel</button>
          <button onClick={() => { onSave(val.trim()); onClose(); }} style={{ padding: "8px 18px", background: "rgba(79,142,247,.15)", border: "1px solid rgba(79,142,247,.35)", borderRadius: 8, color: "#6ea3ff", fontFamily: "'Sora', sans-serif", cursor: "pointer", fontSize: 12 }}>Save Key</button>
        </div>
      </div>
    </div>
  );
}

function PilotTokenModal({ current, onSave, onClose }) {
  const [val, setVal] = useState(current || "");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#0b1220", border: "1px solid #1a2f4a", borderRadius: 14, padding: 28, width: 440 }}>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: "#dde8f5", marginBottom: 6 }}>Pilot Access Token</div>
        <div style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono', monospace", marginBottom: 16, lineHeight: 1.6 }}>
          Only needed if you were given one when invited to the pilot. Stored locally in your browser.
        </div>
        <input
          value={val}
          onChange={e => setVal(e.target.value)}
          placeholder="Paste your access token"
          type="password"
          style={{ width: "100%", background: "#07090f", border: "1px solid #1c2a40", borderRadius: 8, padding: "8px 12px", color: "#a8c4dc", fontFamily: "'DM Mono', monospace", fontSize: 12, outline: "none", marginBottom: 16 }}
        />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 18px", background: "transparent", border: "1px solid #1c2a40", borderRadius: 8, color: "#b0c4d8", fontFamily: "'Sora', sans-serif", cursor: "pointer", fontSize: 12 }}>Cancel</button>
          <button onClick={() => { onSave(val.trim()); onClose(); }} style={{ padding: "8px 18px", background: "rgba(79,142,247,.15)", border: "1px solid rgba(79,142,247,.35)", borderRadius: 8, color: "#6ea3ff", fontFamily: "'Sora', sans-serif", cursor: "pointer", fontSize: 12 }}>Save Token</button>
        </div>
      </div>
    </div>
  );
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: "1px solid #1c2a40" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: "100%", background: "none", border: "none", padding: "10px 0", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", gap: 10 }}
      >
        <span style={{ fontSize: 12, color: "#c4d8ee", textAlign: "left", lineHeight: 1.5 }}>{q}</span>
        <span style={{ fontSize: 12, color: "#6ea3ff", flexShrink: 0 }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono', monospace", lineHeight: 1.7, paddingBottom: 10, paddingRight: 16 }}>{a}</div>
      )}
    </div>
  );
}

function ExportTile({ icon, label, sub, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ background: "#07090f", border: `1px solid ${hovered ? "#1a2f4a" : "#1c2a40"}`, borderRadius: 10, padding: 14, cursor: "pointer", transition: "border-color .15s" }}
    >
      <div style={{ fontSize: 22, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#c4d8ee", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono', monospace", lineHeight: 1.55 }}>{sub}</div>
    </div>
  );
}

const cardStyle = { background: "#0b1220", border: "1px solid #1c2a40", borderRadius: 14, padding: "18px 20px" };
const sectionLbl = { fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono', monospace", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 14 };
const btnPrimary = { padding: "8px 14px", background: "rgba(79,142,247,.1)", border: "1px solid rgba(79,142,247,.25)", borderRadius: 8, color: "#6ea3ff", fontFamily: "'DM Mono', monospace", fontSize: 12, cursor: "pointer" };
const btnGhost   = { padding: "8px 14px", background: "#07090f", border: "1px solid #1c2a40", borderRadius: 8, color: "#b0c4d8", fontFamily: "'DM Mono', monospace", fontSize: 12, cursor: "pointer" };

const AI_MODE_KEY = "insina_ai_mode";

const DEFAULT_LAB_CATS = ["CBC / Hematology","Chemistry","Electrolytes","Endocrine","Immunosuppression","Infection / Serology","Lipid Panel","Liver Panel","Urinalysis","Other"];

function loadAIMode() {
  try { return JSON.parse(localStorage.getItem(AI_MODE_KEY)); } catch { return null; }
}

// UI-21: demo controls appear only in a demo build (vite --mode with
// VITE_DEMO_BUILD=true); production builds never render them.
const IS_DEMO_BUILD = import.meta.env.VITE_DEMO_BUILD === "true";

export default function DataBackup({ onNavChange, googleUser, syncStatus = "idle", lastSyncTs, onSync = () => {}, onSignOut = () => {} }) {
  // UI-21: two distinct pages — Export & Backup vs App Settings.
  // WO_DASHBOARD_FEED_01 4.12: the avatar menu's Settings and Backup entries
  // land on their page directly (a transient sessionStorage hint, no PHI).
  const [page, setPage] = useState(() => {
    try {
      const hint = sessionStorage.getItem("insina_backup_page");
      if (hint) { sessionStorage.removeItem("insina_backup_page"); if (hint === "settings" || hint === "backup") return hint; }
    } catch { /* non-fatal */ }
    return "backup"; // "backup" | "settings"
  });
  const [apiKey, setApiKey]       = useState(() => localStorage.getItem("mi_ak") || "");
  const [pilotToken, setPilotTokenState] = useState(() => getPilotToken());
  const [backupFreq, setBackupFreq] = useState(() => localStorage.getItem("mi_backup_freq") || "Weekly");
  const [autoLockMin, setAutoLockMin] = useState(() => getAutoLockMinutes());
  const [backups, setBackups]     = useState(() => { try { return JSON.parse(localStorage.getItem("mi_backup_history") || "[]"); } catch { return []; } });
  const [toast, setToast]         = useState("");
  const [modal, setModal]         = useState(null); // "clear" | "reset" | "restore" | "apikey" | "pilot_token" | "advanced_consent" | "changepin" | "legal"
  const [pinForm, setPinForm]     = useState({ current: "", next: "", confirm: "" });
  const [pinError, setPinError]   = useState("");
  const [pinSuccess, setPinSuccess] = useState(false);
  const [restoreId, setRestoreId] = useState(null);

  // Sync diagnostics: this device's vault-key fingerprint (async) + the last
  // merge result. Two devices sync records only when fingerprints MATCH; a
  // failed-item count >0 usually means the other device writes under a
  // different key (the invisible "phone changes never arrive" failure).
  const [vaultFp, setVaultFp] = useState(null);
  useEffect(() => { getVaultFingerprint().then(setVaultFp).catch(() => {}); }, []);
  const syncDiag = readSyncDiag();

  // v1.38.0 folder backup (File System Access) — status is async (IDB handle +
  // permission query), so it loads into state; refreshed after every action.
  const [folderStatus, setFolderStatus] = useState(null);
  useEffect(() => { getFolderStatus().then(setFolderStatus).catch(() => {}); }, []);
  const refreshFolderStatus = () => getFolderStatus().then(setFolderStatus).catch(() => {});

  async function handleChooseFolder() {
    try {
      await chooseBackupFolder();
      // First backup immediately — the picker click is the user gesture the
      // permission prompt needs, and an empty configured folder is a footgun.
      await backupToFolder({ interactive: true });
      showToast("Folder chosen: first encrypted backup saved");
    } catch (e) {
      if (e?.name === "AbortError") return; // user closed the picker
      showToast(e?.code === "permission" ? "Folder permission was declined" : "Folder backup failed: " + (e?.message || "try again"));
    } finally {
      refreshFolderStatus();
    }
  }

  async function handleFolderBackupNow() {
    try {
      await backupToFolder({ interactive: true });
      showToast("Encrypted backup saved to your folder");
    } catch (e) {
      showToast(e?.code === "permission" ? "Folder permission was declined" : "Folder backup failed: " + (e?.message || "try again"));
    } finally {
      refreshFolderStatus();
    }
  }

  async function handleStopFolderBackup() {
    await clearBackupFolder();
    showToast("Folder backups stopped: existing files were left in place");
    refreshFolderStatus();
  }

  // Lab category order
  const [labCatOrder, setLabCatOrderState] = useState(() => {
    try { return JSON.parse(localStorage.getItem("mi_lab_category_order") || "null") || DEFAULT_LAB_CATS; }
    catch { return DEFAULT_LAB_CATS; }
  });

  function moveCat(idx, dir) {
    const arr = [...labCatOrder];
    const swap = idx + dir;
    if (swap < 0 || swap >= arr.length) return;
    [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
    localStorage.setItem("mi_lab_category_order", JSON.stringify(arr));
    window.dispatchEvent(new CustomEvent("mi_lab_cat_order_changed"));
    setLabCatOrderState(arr);
  }

  function resetLabCatOrder() {
    localStorage.setItem("mi_lab_category_order", JSON.stringify(DEFAULT_LAB_CATS));
    window.dispatchEvent(new CustomEvent("mi_lab_cat_order_changed"));
    setLabCatOrderState(DEFAULT_LAB_CATS);
    showToast("Lab category order reset to alphabetical");
  }

  // AI Mode state
  const [aiMode, setAiModeState]        = useState(() => loadAIMode());
  const [consentChecked, setConsentChecked] = useState(false);
  const [showConsentText, setShowConsentText] = useState(false);

  const currentMode = aiMode?.mode || "standard";
  const consentDate = aiMode?.consentDate
    ? new Date(aiMode.consentDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : null;
  const consentVersion = aiMode?.consentVersion || null;

  function setAIMode(mode) {
    const now = new Date().toISOString();
    let updated;
    if (mode === "standard") {
      updated = { ...aiMode, mode: "standard", switchedToStandardDate: now };
    } else if (mode === "advanced") {
      updated = {
        ...aiMode,
        mode: "advanced",
        consentVersion: CONSENT_VERSION,
        consentDate: now,
        activatedDate: now,
        staleConsentDetected: false,
      };
    }
    localStorage.setItem(AI_MODE_KEY, JSON.stringify(updated));
    setAiModeState(updated);
    // Notify Tab11 via custom event if it's mounted
    window.dispatchEvent(new CustomEvent("insina_mode_change", {
      detail: { mode, consentVersion: CONSENT_VERSION, consentDate: now },
    }));
  }

  const maskedKey = apiKey ? "sk-ant-" + "•".repeat(20) : "";

  function showToast(msg) { setToast(msg); }

  function handleBackupNow() {
    const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    let totalBytes = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      totalBytes += (k.length + (localStorage.getItem(k) || "").length) * 2;
    }
    const size = `${(totalBytes / 1024).toFixed(1)} KB`;
    const updated = [{ id: Date.now(), type: "Manual backup", date: dateStr, size }, ...backups];
    setBackups(updated);
    localStorage.setItem("mi_backup_history", JSON.stringify(updated.slice(0, 20)));
    showToast("Backup created successfully");
  }

  function handleExport(type) {
    const safeRead = (key) => { try { return JSON.parse(localStorage.getItem(key) || "null") ?? []; } catch { return []; } };

    // Labs CSV — special case
    if (type === "Labs CSV") {
      const labs = safeRead("mi_labs");
      if (!labs.length) { showToast("No lab results to export"); return; }
      const esc = s => `"${String(s||"").replace(/"/g,'""')}"`;
      const rows = ["Name,Value,Unit,Reference Range,Category,Date,Facility,Flag"];
      labs.forEach(l => rows.push([esc(l.name),esc(l.value),esc(l.unit),esc(l.refRange),esc(l.category),esc(l.date),esc(l.facility||"Manual"),esc(l.flag?"YES":"NO")].join(",")));
      const csvBlob = new Blob([rows.join("\n")], { type: "text/csv" });
      const csvUrl = URL.createObjectURL(csvBlob);
      const a = document.createElement("a"); a.href = csvUrl;
      a.download = `insina_labs_${new Date().toISOString().split("T")[0]}.csv`;
      a.click(); URL.revokeObjectURL(csvUrl);
      showToast("Labs CSV downloaded");
      return;
    }

    // Build export object with real localStorage data
    const exportData = {
      exported: new Date().toISOString(),
      exportType: type,
      patient: (() => { try { const p = JSON.parse(localStorage.getItem("mi_profile_personal") || "{}"); return p.name || ""; } catch { return ""; } })(),
      version: "1.0",
      labs:         safeRead("mi_labs"),
      medications:  safeRead("mi_meds_full"),
      readings:     safeRead("mi_readings"),
      conditions:   safeRead("mi_conditions"),
      surgeries:    safeRead("mi_surgeries"),
      careTeam:     safeRead("mi_care_team"),
      notes:        safeRead("mi_notes"),
      appointments: safeRead("mi_appointments"),
      symptoms:     safeRead("mi_symptoms"),
      milestones:   safeRead("mi_milestones"),
      advisoryEvents: safeRead("mi_advisory_events"), // §6: tripwire advisory audit log
    };

    // Trim irrelevant sections for specific export types
    if (type === "Medication List") {
      delete exportData.labs; delete exportData.readings; delete exportData.advisoryEvents;
      delete exportData.notes; delete exportData.appointments; delete exportData.symptoms;
    } else if (type === "Health Summary") {
      delete exportData.notes; delete exportData.symptoms;
      exportData.labs = exportData.labs.slice(0, 80); // most recent 80
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `insina_${type.toLowerCase().replace(/\s+/g,"_")}_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`${type} downloaded`);
  }

  function handleImport() {
    // P-02: while locked, secureStorage silently ignores writes to managed
    // mi_* keys — a restore would toast "Restored N sections" having written
    // nothing. Refuse up front instead.
    if (!isUnlocked()) {
      showToast("Unlock your record first. Restore can't write while locked");
      return;
    }
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
          // v1.38.0: encrypted backups (Drive-format / folder backups) must go
          // through the RAW import path — writing ciphertext through the patched
          // setItem while unlocked would treat it as plaintext and double-encrypt
          // it, corrupting every restored key. Detect and route before the
          // plaintext formats below.
          if (isEncryptedBackupPayload(data)) {
            try {
              const result = restoreEncryptedBackup(data);
              showToast(`Restored ${result.count} encrypted sections: reloading…`);
              setTimeout(() => window.location.reload(), 1800);
            } catch (err) {
              showToast(err?.code === "envelope-mismatch"
                ? "That backup belongs to a different vault: refused so you aren't locked out"
                : "Encrypted restore failed: " + (err?.message || "invalid file"));
            }
            return;
          }
          const MAP = {
            labs:         "mi_labs",
            medications:  "mi_meds_full",
            readings:     "mi_readings",
            conditions:   "mi_conditions",
            surgeries:    "mi_surgeries",
            careTeam:     "mi_care_team",
            notes:        "mi_notes",
            appointments: "mi_appointments",
            symptoms:     "mi_symptoms",
            milestones:   "mi_milestones",
          };
          let count = 0;
          // Format A: export format (camelCase keys like "labs", "medications")
          Object.entries(MAP).forEach(([jsonKey, storageKey]) => {
            if (data[jsonKey] !== undefined) {
              localStorage.setItem(storageKey, JSON.stringify(data[jsonKey]));
              count++;
            }
          });
          // Format B: recovery format (mi_-prefixed keys). Restore EVERY mi_*
          // key the file carries — the old allowlist silently dropped real
          // data (mi_records, mi_cards, dismissed-findings state, the P-01
          // pseudonym id…). Only vault/security state is excluded: restoring
          // a foreign vault envelope would lock the user out of the vault
          // they just unlocked, and the schema stamp is reset separately
          // below so migrations re-run. Values may be parsed objects/arrays
          // (weekly Drive backups) OR raw JSON strings (the pre-encryption
          // auto-backups snapshot localStorage verbatim) — stringifying a
          // string would double-encode and corrupt the restore, so strings
          // pass through unchanged.
          const NEVER_RESTORE = new Set([
            "mi_vault", "mi_vault_migration_interrupted", "mi_migration_interrupted",
            "mi_schema_version", "mi_auth_hash",
          ]);
          Object.keys(data).filter(k => k.startsWith("mi_") && !NEVER_RESTORE.has(k)).forEach(k => {
            const v = typeof data[k] === "string" ? data[k] : JSON.stringify(data[k]);
            localStorage.setItem(k, v);
            count++;
          });
          // A-08/A-12: restored data may predate the current schema (e.g. a
          // backup exported before the vital-schema migration), but the boot
          // migrations are gated by mi_schema_version, which this device has
          // already stamped — so restored records would silently bypass them.
          // Reset the stamp to the v1 baseline; every data migration above it
          // is required to be idempotent, so re-running them on reload is safe
          // and normalizes whatever shape the backup carried.
          if (count > 0) localStorage.setItem("mi_schema_version", "1");
          showToast(`Restored ${count} data sections: reloading…`);
          setTimeout(() => window.location.reload(), 1800);
        } catch {
          showToast("Import failed: invalid JSON file");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function handleSaveApiKey(key) {
    localStorage.setItem("mi_ak", key);
    setApiKey(key);
    showToast("API key saved");
  }

  function handleSavePilotToken(token) {
    setPilotToken(token);
    setPilotTokenState(token);
    showToast(token ? "Pilot access token saved" : "Pilot access token cleared");
  }

  async function handleChangePin() {
    setPinError("");
    const { current, next, confirm } = pinForm;
    if (next.length < 12) { setPinError("Use at least 12 characters. This is the actual encryption key, not a screen lock."); return; }
    if (next !== confirm) { setPinError("New passwords don't match."); return; }
    try {
      // changePassphrase() requires the vault already unlocked in this session
      // (true here — the app is running) using the CURRENT passphrase for
      // re-derivation; verify it explicitly first so a wrong "current"
      // entry fails clearly rather than silently re-wrapping under a stale KEK.
      await unlock(current);
      await changePassphrase(next);
      setPinForm({ current: "", next: "", confirm: "" });
      setPinSuccess(true);
      setTimeout(() => { setPinSuccess(false); setModal(null); }, 2000);
    } catch {
      setPinError("Current password is incorrect.");
    }
  }

  function handleClearData() {
    localStorage.clear();
    setModal(null);
    showToast("All data cleared: reloading…");
    setTimeout(() => window.location.reload(), 1500);
  }

  function handleReset() {
    setModal(null);
    try {
      loadDemoData(); // guarded: throws rather than wipe a real record
    } catch (e) {
      showToast(e.message || "Demo not loaded. A real record exists on this device.");
      return;
    }
    setBackups(INITIAL_BACKUPS);
    showToast("Demo data loaded: reloading…");
    setTimeout(() => window.location.reload(), 1500);
  }

  function confirmRestore() {
    const b = backups.find(x => x.id === restoreId);
    setModal(null);
    showToast(`Restored from ${b?.date}`);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div style={{ height: 54, background: "#080c14", borderBottom: "1px solid #1c2a40", display: "flex", alignItems: "center", padding: "0 24px", gap: 12, flexShrink: 0 }}>
        <div style={{ fontSize: 12, letterSpacing: "1.5px", textTransform: "uppercase", color: "#a0b4c8", fontFamily: "'DM Mono', monospace" }}>Settings &amp; Backup</div>
        <div style={{ flex: 1 }} />
        <button style={btnPrimary} onClick={handleBackupNow}>Backup Now</button>
      </div>
      <div style={{ overflowY: "auto", padding: "24px 28px", flex: 1 }}>

      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: "#dde8f5", fontWeight: 400, letterSpacing: "-0.4px" }}>Settings & Backup</h1>
        <p style={{ fontSize: 12, color: "#98afc4", marginTop: 4, fontFamily: "'DM Mono', monospace" }}>App preferences, data exports, backups, and connected sources</p>
      </div>

      {/* UI-21: page selector — backup/export and preferences are separate pages */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[["backup", "Export & Backup"], ["settings", "App Settings"]].map(([id, label]) => (
          <button key={id} onClick={() => setPage(id)}
            style={{ padding: "8px 18px", borderRadius: 20, fontSize: 12, fontFamily: "'Sora',sans-serif", fontWeight: 600, cursor: "pointer", transition: "all .15s",
              border: `1px solid ${page === id ? "rgba(79,142,247,.5)" : "#1a2f4a"}`,
              background: page === id ? "rgba(79,142,247,.12)" : "#0b1220",
              color: page === id ? "var(--accent-blue)" : "var(--text-dim)" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ══ EXPORT & BACKUP page ══ */}
      <div style={{ display: page === "backup" ? "block" : "none" }}>
      {/* Google Drive Sync */}
      <div style={{ ...cardStyle, marginBottom: 14 }}>
        <div style={sectionLbl}>Google Drive Backup</div>
        {googleUser ? (
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
              {googleUser.picture
                ? <img src={googleUser.picture} alt="" style={{ width:42, height:42, borderRadius:"50%", border:"1px solid #1a2f4a", flexShrink:0 }} />
                : <div style={{ width:42, height:42, borderRadius:"50%", background:"linear-gradient(135deg,#4f8ef7,#a78bfa)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, fontWeight:700, color:"#fff", flexShrink:0 }}>{(googleUser.name||"G")[0].toUpperCase()}</div>
              }
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600, color:"#c4d8ee", marginBottom:2 }}>{googleUser.name}</div>
                <div style={{ fontSize:12, color:"#98afc4", fontFamily:"'DM Mono',monospace" }}>{googleUser.email}</div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <div style={{ width:6, height:6, borderRadius:"50%", background:"#10b981", boxShadow:"0 0 6px #10b98160" }} />
                <span style={{ fontSize:12, color:"#2dd4a0", fontFamily:"'DM Mono',monospace" }}>Connected</span>
              </div>
            </div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", paddingTop:12, borderTop:"1px solid #1c2a40" }}>
              <div style={{ fontSize:12, color:"#98afc4", fontFamily:"'DM Mono',monospace" }}>
                {syncStatus==="syncing" ? "⟳ Syncing…" :
                 syncStatus==="error"   ? "⚠ Sync failed. Check connection" :
                 lastSyncTs             ? `Last synced ${new Date(lastSyncTs).toLocaleDateString("en-US",{month:"short",day:"numeric"})} at ${new Date(lastSyncTs).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}` :
                 "Not yet synced"}
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button
                  onClick={onSync}
                  disabled={syncStatus==="syncing"}
                  style={{ ...btnPrimary, opacity: syncStatus==="syncing" ? 0.6 : 1 }}
                >
                  {syncStatus==="syncing" ? "Syncing…" : "↑↓ Sync Now"}
                </button>
                <button
                  onClick={() => { if (window.confirm("Disconnect Google Drive? Your local data will not be deleted.")) onSignOut(); }}
                  style={{ ...btnGhost, color:"#f87171", borderColor:"rgba(239,68,68,.2)" }}
                >
                  Disconnect
                </button>
              </div>
            </div>
            {/* Weekly backup status row */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", paddingTop:10, marginTop:10, borderTop:"1px solid #1c2a40" }}>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:"#a0b4c8", fontFamily:"'DM Mono',monospace", marginBottom:2 }}>WEEKLY SNAPSHOT</div>
                <div style={{ fontSize:12, color:"#6a8090", fontFamily:"'DM Mono',monospace" }}>
                  {(() => {
                    // UI-2: daysAgoLabel never renders "NaN days ago" — a
                    // malformed/JSON-quoted timestamp (how snapshot-restored
                    // scalars arrive) falls back to the no-backup copy.
                    const ts = localStorage.getItem("mi_last_weekly_backup");
                    const label = daysAgoLabel(ts, null);
                    if (!label) return "No snapshot created yet: will run automatically on next app open.";
                    return `Last snapshot ${label} · keeps 4 rolling weeks on Drive`;
                  })()}
                </div>
              </div>
              <button
                onClick={async () => {
                  const token = getAccessToken();
                  if (!token) { showToast("Session expired. Click Sync Now to reconnect"); return; }
                  showToast("Running weekly snapshot…");
                  uploadWeeklyBackup(token)
                    .then(() => showToast("Weekly snapshot saved to Drive ✓"))
                    .catch(() => showToast("Snapshot failed. Try Sync Now first"));
                }}
                style={{ ...btnGhost, whiteSpace:"nowrap", flexShrink:0 }}
              >
                Snapshot now
              </button>
            </div>
            <ReportArchiveRow showToast={showToast} />
            {/* Sync diagnostics: key fingerprint + last merge health */}
            <div style={{ paddingTop:10, marginTop:10, borderTop:"1px solid #1c2a40" }}>
              <div style={{ fontSize:12, fontWeight:600, color:"#a0b4c8", fontFamily:"'DM Mono',monospace", marginBottom:2 }}>SYNC DIAGNOSTICS</div>
              <div style={{ fontSize:12, color:"#6a8090", fontFamily:"'DM Mono',monospace", lineHeight:1.7 }}>
                Vault key fingerprint: <span style={{ color:"#7eb8d8" }}>{vaultFp || "–"}</span> · must match on every device that syncs this record (phone companion shows its own under Sync).
              </div>
              {syncDiag?.failed > 0 && (
                <div style={{ marginTop:6, fontSize:12, color:"#f59e0b", fontFamily:"'DM Mono',monospace", lineHeight:1.7, background:"rgba(245,158,11,.07)", border:"1px solid rgba(245,158,11,.25)", borderRadius:7, padding:"7px 10px" }}>
                  ⚠ Last sync could not read {syncDiag.failed} item{syncDiag.failed !== 1 ? "s" : ""} from Drive
                  ({(syncDiag.failedKeys || []).slice(0, 4).join(", ")}{(syncDiag.failedKeys || []).length > 4 ? "…" : ""}).
                  This usually means another device holds a different vault key: compare fingerprints, then on the mismatched device use
                  "Restore from Google Drive" to re-key it. Nothing was overwritten locally.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize:12, color:"#7eb8d8", lineHeight:1.7, marginBottom:14 }}>
              Connect your Google account to automatically back up all your health data to your personal Google Drive.
              Your data is stored only in <em>your</em> Drive: Insina Health servers never hold your health records.
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <button
                onClick={onSync}
                style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 16px", background:"rgba(79,142,247,.1)", border:"1px solid rgba(79,142,247,.25)", borderRadius:8, color:"#6ea3ff", fontFamily:"'DM Mono',monospace", fontSize:12, cursor:"pointer" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Connect Google Drive
              </button>
              <span style={{ fontSize:12, color:"#4a5c6a", fontFamily:"'DM Mono',monospace" }}>Free with your Google account · no health data stored on our servers</span>
            </div>
            <div style={{ fontSize:12, color:"#6a8090", fontFamily:"'DM Mono',monospace", marginTop:10, lineHeight:1.7 }}>
              No Google account? Creating one is free at accounts.google.com: Drive comes with it.
              {isFolderBackupSupported()
                ? " Prefer to skip Google entirely? Use Folder Backup below instead."
                : " Prefer to skip Google entirely? Use Download Backup below and keep the file somewhere safe (your own cloud folder works)."}
            </div>
          </div>
        )}
      </div>

      {/* v1.38.0: Folder Backup — the no-Google channel (File System Access API,
          Chromium desktop only; hidden elsewhere). Same encrypted payload as a
          Drive backup — never plaintext, because this folder may sync to a
          third-party cloud. */}
      {folderStatus?.supported && (
        <div style={{ ...cardStyle, marginBottom: 14 }}>
          <div style={sectionLbl}>Folder Backup: Works Without Google</div>
          {!folderStatus.configured ? (
            <div>
              <div style={{ fontSize:12, color:"#7eb8d8", lineHeight:1.7, marginBottom:12 }}>
                Choose a folder on this computer and Insina will save encrypted backups there: 
                the same protection as a Drive backup, no Google account involved.
                Tip: pick a folder inside Dropbox, OneDrive, or iCloud Drive and your own
                cloud service carries the backups off this device automatically.
              </div>
              <button onClick={handleChooseFolder} style={{ ...btnGhost, borderColor:"rgba(79,142,247,.35)", color:"#7eb8d8" }}>
                Choose backup folder…
              </button>
            </div>
          ) : (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
              <div>
                <div style={{ fontSize:12, color:"#a0b4c8", fontFamily:"'DM Mono',monospace", marginBottom:2 }}>
                  Saving encrypted backups to “{folderStatus.name}”
                  {folderStatus.permission !== "granted" && " · permission needed. Click Back up now to re-allow"}
                </div>
                <div style={{ fontSize:12, color:"#6a8090", fontFamily:"'DM Mono',monospace" }}>
                  {(() => {
                    const label = daysAgoLabel(localStorage.getItem("mi_last_folder_backup"), null);
                    return label ? `Last folder backup ${label} · keeps 4 rolling copies` : "No folder backup yet · keeps 4 rolling copies";
                  })()}
                </div>
              </div>
              <div style={{ display:"flex", gap:8, flexShrink:0 }}>
                <button onClick={handleFolderBackupNow} style={{ ...btnGhost, borderColor:"rgba(79,142,247,.35)", color:"#7eb8d8" }}>Back up now</button>
                <button onClick={handleChooseFolder} style={btnGhost}>Change folder…</button>
                <button onClick={handleStopFolderBackup} style={btnGhost}>Stop</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Row 1: Sources + Storage */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>

        {/* Connected Sources */}
        <div style={cardStyle}>
          <div style={sectionLbl}>Connected Data Sources</div>
          {[
            { icon: "E", iconBg: "rgba(79,142,247,.12)", iconBorder: "rgba(79,142,247,.2)", iconColor: "#4f8ef7", name: "Epic MyChart",  sub: "Coming soon: Ochsner · Hattiesburg · SCRMC", status: "Pending", statusColor: "#f59e0b", mono: true },
            { icon: "♡", iconBg: "rgba(239,68,68,.08)",  iconBorder: "rgba(239,68,68,.15)",  iconColor: "#ef4444", name: "Apple Health", sub: "Coming soon. IOS companion",                 status: "Pending", statusColor: "#f59e0b", mono: false },
            { icon: "✎", iconBg: "rgba(167,139,250,.1)", iconBorder: "rgba(167,139,250,.2)", iconColor: "#a78bfa", name: "Manual Entry", sub: "Vitals, meds, symptoms, labs",               status: "Active",  statusColor: "#10b981", mono: false },
          ].map((src, i, arr) => (
            <div key={src.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < arr.length - 1 ? "1px solid #1c2a40" : "none" }}>
              <div style={{ width: 32, height: 32, background: src.iconBg, border: `1px solid ${src.iconBorder}`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: src.mono ? 12 : 15, fontFamily: src.mono ? "'DM Mono', monospace" : "inherit", color: src.iconColor, fontWeight: src.mono ? 600 : 400, flexShrink: 0 }}>
                {src.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#c4d8ee" }}>{src.name}</div>
                <div style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono', monospace" }}>{src.sub}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: src.statusColor, boxShadow: src.statusColor === "#10b981" ? `0 0 6px ${src.statusColor}60` : "none" }} />
                <span style={{ fontSize: 12, color: src.statusColor, fontFamily: "'DM Mono', monospace" }}>{src.status}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Storage */}
        {(() => {
          const safe = k => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };
          const labCount  = safe("mi_labs").length;
          const vitCount  = safe("mi_readings").length;
          const medCount  = safe("mi_meds_full").length;
          const noteCount = safe("mi_notes").length + safe("mi_records").length;
          const liveStats = [
            { val: labCount.toLocaleString(),  label: "Lab entries",    color: "#4f8ef7" },
            { val: vitCount.toLocaleString(),  label: "Vitals logged",  color: "#10b981" },
            { val: medCount.toLocaleString(),  label: "Medications",    color: "#a78bfa" },
            { val: noteCount.toLocaleString(), label: "Notes & records",color: "#f59e0b" },
          ];
          let totalBytes = 0;
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            totalBytes += (k.length + (localStorage.getItem(k) || "").length) * 2;
          }
          const usedKB = (totalBytes / 1024).toFixed(1);
          const pct = Math.min(100, (totalBytes / (5 * 1024 * 1024)) * 100).toFixed(1);
          return (
            <div style={cardStyle}>
              <div style={sectionLbl}>Storage & Records</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                {liveStats.map(s => (
                  <div key={s.label} style={{ background: "#07090f", border: "1px solid #1c2a40", borderRadius: 10, padding: 12 }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: s.color, letterSpacing: "-0.5px", lineHeight: 1 }}>{s.val}</div>
                    <div style={{ fontSize: 12, color: "#b0c4d8", marginTop: 4, fontFamily: "'DM Mono', monospace" }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono', monospace", marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
                <span>Local storage used</span><span style={{ color: "#7eb8d8" }}>{usedKB} KB / 5,120 KB</span>
              </div>
              <div style={{ height: 4, background: "#0d1a28", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,#4f8ef7,#a78bfa)", borderRadius: 2 }} />
              </div>
            </div>
          );
        })()}
      </div>

      {/* Row 2: Export + Import */}
      <div style={{ ...cardStyle, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={sectionLbl}>Export Your Data</div>
          <button
            onClick={handleImport}
            style={{ padding: "6px 14px", background: "rgba(16,185,129,.10)", border: "1px solid rgba(16,185,129,.3)", borderRadius: 8, color: "#2dd4a0", fontFamily: "'DM Mono',monospace", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
          >
            ↑ Restore from File
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
          <ExportTile icon="📄" label="Full Export"     sub="All data as JSON: labs, meds, vitals, notes"  onClick={() => handleExport("Full Export")} />
          <ExportTile icon="📊" label="Labs CSV"        sub="All lab results in spreadsheet format"          onClick={() => handleExport("Labs CSV")} />
          <ExportTile icon="🏥" label="Health Summary"  sub="PDF: share with new providers"                 onClick={() => handleExport("Health Summary")} />
          <ExportTile icon="💊" label="Medication List" sub="Current meds + history as PDF"                  onClick={() => handleExport("Medication List")} />
        </div>
      </div>
      </div>{/* end backup page block 1 */}

      {/* ══ APP SETTINGS page (Help & Support) ══ */}
      <div style={{ display: page === "settings" ? "block" : "none" }}>
      {/* Help & Support */}
      {(() => {
        const [helpOpen, setHelpOpen] = [false, () => {}]; // static for now; expand if needed
        const topics = [
          { q: "How do I import lab results?", a: "Go to Import Records in the sidebar. Select 'Lab Results' as the document type, then upload one or more PDF files. The AI will extract your results automatically and save them to the Labs tab." },
          { q: "How do I ask AI about a record or document?", a: "Open any record in the Records tab and tap '✦ Ask AI'. For lab analysis, open the Labs tab and use the AI Analysis panel. You can type follow-up questions in either view." },
          { q: "What is Standard vs. Advanced AI mode?", a: "Standard mode uses Claude Sonnet: fast and clear for everyday analysis. Advanced mode uses Claude Opus: deeper cross-referenced reasoning for complex cases. Advanced mode requires separate consent and is available as a subscription upgrade." },
          { q: "Is my data private?", a: "Your health record is stored on your device, encrypted under your own password: Insina Health has no server copy. When you use AI, the specific information your request needs is sent pseudonymously (identified by a random ID, never your name) through Insina's proxy to Anthropic to generate the response; the proxy does not store or log that content. See Privacy Policy for the complete picture, including what pseudonymous does and doesn't mean." },
          { q: "What happens if I clear my browser?", a: "Clearing browser data will erase all locally stored records. Always export a Full Backup before clearing, or connect Google Drive in Settings & Backup to automatically protect against data loss." },
          { q: "How do I reorder lab categories?", a: "Go to Settings & Backup → Lab Category Order. Use the up/down arrows to set the order categories appear in the Labs tab." },
        ];
        return (
          <div style={{ ...cardStyle, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={sectionLbl}>Help & Support</div>
              <a
                href="mailto:support@insinahealth.com"
                style={{ fontSize: 12, color: "#6ea3ff", fontFamily: "'DM Mono', monospace", textDecoration: "none" }}
              >✉ Contact Support</a>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              {[
                { icon: "◈", label: "Quick Start Guide", sub: "Get up and running in 5 minutes", href: null },
                { icon: "▤", label: "Full Documentation", sub: "All features explained in detail", href: null },
                { icon: "✦", label: "AI Tips & Prompts", sub: "Get the most from AI analysis", href: null },
                { icon: "◷", label: "Video Walkthroughs", sub: "Step-by-step feature demos", href: null },
              ].map(item => (
                <div key={item.label} style={{ background: "#07090f", border: "1px solid #1c2a40", borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 10, opacity: item.href ? 1 : 0.55 }}>
                  <div style={{ fontSize: 14, color: "#6ea3ff", marginTop: 1, flexShrink: 0 }}>{item.icon}</div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#c4d8ee", marginBottom: 2 }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono', monospace", lineHeight: 1.5 }}>{item.href ? item.sub : item.sub + ": coming soon"}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono', monospace", marginBottom: 10, letterSpacing: "0.5px" }}>FREQUENTLY ASKED QUESTIONS</div>
            {topics.map((t, i) => (
              <FaqItem key={i} q={t.q} a={t.a} />
            ))}
          </div>
        );
      })()}
      </div>{/* end settings page block 1 (Help & Support) */}

      {/* ══ EXPORT & BACKUP page (history + backup preferences) ══ */}
      <div style={{ display: page === "backup" ? "block" : "none" }}>
      {/* Row 3: Backup history + backup preferences */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>

        {/* Backup history */}
        <div style={cardStyle}>
          <div style={sectionLbl}>Backup History</div>
          {backups.slice(0, 5).map(b => (
            <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid #1c2a40" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 12, color: "#7eb8d8" }}>{b.type}</div>
              <div style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono', monospace" }}>{formatDateUS(b.date)}</div>
              <div style={{ fontSize: 12, color: "#2dd4a0", fontFamily: "'DM Mono', monospace", minWidth: 44, textAlign: "right" }}>{b.size}</div>
              <span
                onClick={() => { setRestoreId(b.id); setModal("restore"); }}
                style={{ fontSize: 12, color: "#b0c4d8", fontFamily: "'DM Mono', monospace", cursor: "pointer", marginLeft: 8 }}
                title="Restore this backup"
              >↩</span>
            </div>
          ))}
          {backups.length === 0 && (
            <div style={{ fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono', monospace", padding: "10px 0" }}>No backups yet</div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button style={{ ...btnPrimary, flex: 1 }} onClick={handleBackupNow}>Backup Now</button>
            <button style={{ ...btnGhost, flex: 1 }} onClick={() => showToast("Click ↩ on a backup entry to restore")}>Restore…</button>
          </div>
        </div>

        {/* App Settings */}
        {(() => {
          const safe = k => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };
          const allDated = [
            ...safe("mi_labs"), ...safe("mi_readings"), ...safe("mi_meds_full"),
            ...safe("mi_records"), ...safe("mi_notes"),
          ].map(r => r.date || r.startDate || r.timestamp || "").filter(Boolean).sort();
          const oldest = allDated[0] ? new Date(allDated[0]).toLocaleDateString("en-US", { year: "numeric", month: "long" }) : "No records yet";
          return (
            <div style={cardStyle}>
              <div style={sectionLbl}>Backup Preferences &amp; About</div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "#7eb8d8", marginBottom: 6 }}>Auto-backup frequency</div>
                <select
                  value={backupFreq}
                  onChange={e => { setBackupFreq(e.target.value); localStorage.setItem("mi_backup_freq", e.target.value); showToast(`Backup frequency set to ${e.target.value}`); }}
                  style={{ width: "100%", background: "#07090f", border: "1px solid #1c2a40", borderRadius: 8, padding: "8px 12px", color: "#a8c4dc", fontFamily: "'DM Mono', monospace", fontSize: 12, outline: "none", cursor: "pointer" }}
                >
                  {["Daily", "Weekly", "Monthly", "Never"].map(f => <option key={f}>{f}</option>)}
                </select>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "#7eb8d8", marginBottom: 6 }}>Data since</div>
                <div style={{ background: "#07090f", border: "1px solid #1c2a40", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#b0c4d8", fontFamily: "'DM Mono', monospace" }}>
                  {oldest}
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "#7eb8d8", marginBottom: 6 }}>App version</div>
                <div style={{ background: "#07090f", border: "1px solid #1c2a40", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#b0c4d8", fontFamily: "'DM Mono', monospace" }}>
                  Insina Health v{APP_VERSION}
                </div>
              </div>

            </div>
          );
        })()}
      </div>
      </div>{/* end backup page block 2 */}

      {/* ══ APP SETTINGS page (AI Analysis / Lab Organization / Security / Legal) ══ */}
      <div style={{ display: page === "settings" ? "block" : "none" }}>
      {/* AI Analysis Mode */}
      <div style={{ ...cardStyle, marginBottom: 14 }}>
        <div style={sectionLbl}>AI Analysis Mode</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

          {/* Current mode status */}
          <div style={{ background: "#07090f", border: "1px solid #1c2a40", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono', monospace", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>Current Mode</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: currentMode === "advanced" ? "#4f8ef7" : "#10b981",
                boxShadow: `0 0 6px ${currentMode === "advanced" ? "#4f8ef760" : "#10b98160"}`,
              }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#dde8f5" }}>
                {currentMode === "advanced" ? "Advanced Mode" : "Standard Mode"}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "#7eb8d8", fontFamily: "'DM Mono', monospace", lineHeight: 1.6 }}>
              {currentMode === "advanced"
                ? <>Model: <strong>Claude Opus 5</strong><br />Deeper cross-referenced analysis</>
                : <>Model: <strong>Claude Sonnet 5</strong><br />Clear daily-use analysis</>
              }
            </div>
            {currentMode === "advanced" && consentDate && (
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #1c2a40", fontSize: 12, color: "#4a5c6a", fontFamily: "'DM Mono', monospace", lineHeight: 1.5 }}>
                Consent given: {consentDate}<br />
                Consent version: v{consentVersion}
              </div>
            )}
          </div>

          {/* Switch controls */}
          <div style={{ background: "#07090f", border: "1px solid #1c2a40", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono', monospace", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>Switch Mode</div>

            {currentMode === "advanced" ? (
              // Currently Advanced → show switch to Standard
              <div>
                <div style={{ fontSize: 12, color: "#7eb8d8", lineHeight: 1.6, marginBottom: 12 }}>
                  Switching to Standard Mode is immediate and does not require any action. You can re-enable Advanced Mode at any time.
                </div>
                <button
                  onClick={() => {
                    if (window.confirm("Switch to Standard Mode? You can re-enable Advanced Mode at any time.")) {
                      setAIMode("standard");
                      showToast("Switched to Standard Mode");
                    }
                  }}
                  style={{ ...btnGhost, width: "100%", textAlign: "center", color: "#2dd4a0", borderColor: "rgba(16,185,129,.3)" }}
                >
                  Switch to Standard Mode
                </button>
                <button
                  onClick={() => printConsent({ mode: "Advanced", consentDate: consentDate || "–", consentVersion: consentVersion || CONSENT_VERSION })}
                  style={{ marginTop: 8, background: "none", border: "none", color: "#4a5c6a", fontSize: 12, fontFamily: "'DM Mono', monospace", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 5 }}
                ><PrintLabel size={11}>View / reprint consent document</PrintLabel></button>
              </div>
            ) : (
              // Currently Standard → show switch to Advanced with consent
              <div>
                <div style={{ fontSize: 12, color: "#7eb8d8", lineHeight: 1.6, marginBottom: 10 }}>
                  Advanced Mode uses Claude Opus for deeper analysis. Informed consent is required.
                </div>
                <button
                  onClick={() => setShowConsentText(p => !p)}
                  style={{ background: "none", border: "none", color: "#6ea3ff", fontSize: 12, fontFamily: "'DM Mono', monospace", cursor: "pointer", padding: 0, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}
                >
                  {showConsentText ? "▾" : "▸"} {showConsentText ? "Hide" : "Read"} consent details
                </button>
                {showConsentText && (
                  <div style={{ maxHeight: 160, overflowY: "auto", background: "#0b1220", border: "1px solid #1c2a40", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
                    <ConsentText style={{ fontSize: 12 }} />
                  </div>
                )}
                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 10, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={consentChecked}
                    onChange={e => setConsentChecked(e.target.checked)}
                    style={{ marginTop: 2, accentColor: "#6ea3ff", flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 12, color: "#a8c4dc", lineHeight: 1.6 }}>
                    I consent to Advanced Mode per the terms above.
                  </span>
                </label>
                <button
                  disabled={!consentChecked}
                  onClick={() => {
                    setAIMode("advanced");
                    setConsentChecked(false);
                    setShowConsentText(false);
                    showToast("Advanced Mode enabled");
                  }}
                  style={{
                    ...btnPrimary, width: "100%", textAlign: "center",
                    opacity: consentChecked ? 1 : 0.4,
                    cursor: consentChecked ? "pointer" : "not-allowed",
                  }}
                >
                  Enable Advanced Mode
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lab Category Order */}
      <div style={{ ...cardStyle, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={sectionLbl}>Lab Category Order</div>
          <button onClick={resetLabCatOrder} style={{ ...btnGhost, fontSize: 12 }}>↺ Reset to Alphabetical</button>
        </div>
        <div style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono', monospace", marginBottom: 14, lineHeight: 1.6 }}>
          Set the order categories appear in the Labs tab. Use the arrows to move categories up or down.
          Grouping different names for the same test (e.g. FK506 / Tacrolimus) lives in Labs &amp; Trends → Group Tests.
        </div>
        {labCatOrder.map((cat, idx) => (
          <div key={cat} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: idx < labCatOrder.length - 1 ? "1px solid #1c2a40" : "none" }}>
            <div style={{ width: 18, textAlign: "right", fontSize: 12, color: "#3a5060", fontFamily: "'DM Mono', monospace", flexShrink: 0 }}>{idx + 1}</div>
            <div style={{ flex: 1, fontSize: 12, color: "#c4d8ee" }}>{cat}</div>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                onClick={() => moveCat(idx, -1)}
                disabled={idx === 0}
                style={{ width: 38, height: 38, background: "#07090f", border: "1px solid #1c2a40", borderRadius: 8, color: idx === 0 ? "#1e3040" : "#7eb8d8", cursor: idx === 0 ? "not-allowed" : "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", transition: "color .15s" }}
                title="Move up" aria-label={`Move ${cat} up`}
              >↑</button>
              <button
                onClick={() => moveCat(idx, 1)}
                disabled={idx === labCatOrder.length - 1}
                style={{ width: 38, height: 38, background: "#07090f", border: "1px solid #1c2a40", borderRadius: 8, color: idx === labCatOrder.length - 1 ? "#1e3040" : "#7eb8d8", cursor: idx === labCatOrder.length - 1 ? "not-allowed" : "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", transition: "color .15s" }}
                title="Move down" aria-label={`Move ${cat} down`}
              >↓</button>
            </div>
          </div>
        ))}
      </div>

      {/* Security — UI-21: P-02 passphrase + auto-lock + pilot token live here */}
      <div style={{ background: "#0b1220", border: "1px solid #1a2f4a", borderRadius: 14, padding: "18px 20px", marginBottom: 14 }}>
        <div style={sectionLbl}>Security</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#dde8f5", marginBottom: 3 }}>Password</div>
            <div style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono', monospace" }}>
              Your password is the actual encryption key for your data (P-02). Changing it re-wraps
              the key. Your data is never re-encrypted or at risk during the change.
            </div>
          </div>
          <button
            onClick={() => { setPinForm({ current: "", next: "", confirm: "" }); setPinError(""); setPinSuccess(false); setModal("changepin"); }}
            style={{ padding: "7px 16px", background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.25)", borderRadius: 8, color: "#2dd4a0", fontSize: 12, fontFamily: "'DM Mono', monospace", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}
          >
            Change Password
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "#7eb8d8", marginBottom: 6 }}>Auto-lock after inactivity</div>
          <select
            value={autoLockMin}
            onChange={e => { const v = parseInt(e.target.value, 10); setAutoLockMin(v); setAutoLockMinutes(v); showToast(v === 0 ? "Auto-lock turned off" : `Auto-lock set to ${AUTOLOCK_OPTIONS.find(o => o.value === v)?.label}`); }}
            style={{ width: "100%", background: "#07090f", border: "1px solid #1c2a40", borderRadius: 8, padding: "8px 12px", color: "#a8c4dc", fontFamily: "'DM Mono', monospace", fontSize: 12, outline: "none", cursor: "pointer" }}
          >
            {AUTOLOCK_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <div style={{ fontSize: 12, color: "#6a8090", fontFamily: "'DM Mono', monospace", marginTop: 5, lineHeight: 1.5 }}>
            Locks when idle and clears your encryption key from memory. Your data is unreadable until you re-enter your password.
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, color: "#7eb8d8", marginBottom: 6 }}>Pilot access token</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, background: "#07090f", border: "1px solid #1c2a40", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: pilotToken ? "#b0c4d8" : "#6a8090", fontFamily: "'DM Mono', monospace" }}>
              {pilotToken ? "•".repeat(20) : "Not set. Not needed for founder use"}
            </div>
            <button onClick={() => setModal("pilot_token")} style={btnGhost}>{pilotToken ? "Change" : "Set"}</button>
          </div>
        </div>
      </div>

      {/* Legal (P-06 / PG-11) */}
      <div style={{ background: "#0b1220", border: "1px solid #1a2f4a", borderRadius: 14, padding: "18px 20px" }}>
        <div style={sectionLbl}>Legal</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono', monospace" }}>
            Terms of Service and Privacy Policy: draft, pending attorney review.
          </div>
          <button
            onClick={() => setModal("legal")}
            style={{ padding: "7px 16px", background: "rgba(79,142,247,.08)", border: "1px solid rgba(79,142,247,.25)", borderRadius: 8, color: "#7eb8d8", fontSize: 12, fontFamily: "'DM Mono', monospace", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}
          >
            View
          </button>
        </div>
      </div>

      </div>{/* end settings page block 2 */}

      {/* ══ EXPORT & BACKUP page (Danger Zone — destructive actions, separated) ══ */}
      <div style={{ display: page === "backup" ? "block" : "none" }}>
      <div style={{ background: "#0b1220", border: "1px solid rgba(239,68,68,.2)", borderRadius: 14, padding: "18px 20px" }}>
        <div style={{ fontSize: 12, color: "rgba(239,68,68,.5)", fontFamily: "'DM Mono', monospace", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 12 }}>Danger Zone</div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1, background: "#07090f", border: "1px solid rgba(239,68,68,.15)", borderRadius: 8, padding: "12px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#f87171", marginBottom: 4 }}>Clear All Data</div>
            <div style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono', monospace", lineHeight: 1.55, marginBottom: 10 }}>Permanently removes all locally stored records, notes, and settings. Cannot be undone.</div>
            <button onClick={() => setModal("clear")} style={{ padding: "6px 14px", border: "1px solid rgba(239,68,68,.3)", borderRadius: 6, fontSize: 12, color: "#f87171", cursor: "pointer", fontFamily: "'DM Mono', monospace", background: "transparent" }}>Clear Data</button>
          </div>
          {/* UI-21: demo controls only in the demo build. The stale "Demo PIN:
              1234" note is gone — PIN auth no longer exists under P-02. */}
          {IS_DEMO_BUILD && (
            <div style={{ flex: 1, background: "#07090f", border: "1px solid rgba(245,158,11,.15)", borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#f59e0b", marginBottom: 4 }}>Reset to Demo</div>
              <div style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono', monospace", lineHeight: 1.55, marginBottom: 10 }}>Restore the app to the original demo state with sample data. Clears any personal entries.</div>
              <button onClick={() => setModal("reset")} style={{ padding: "6px 14px", border: "1px solid rgba(245,158,11,.3)", borderRadius: 6, fontSize: 12, color: "#f59e0b", cursor: "pointer", fontFamily: "'DM Mono', monospace", background: "transparent" }}>Reset</button>
            </div>
          )}
        </div>
      </div>
      </div>{/* end backup page block 3 */}

      {/* Modals */}
      {modal === "apikey" && <ApiKeyModal current={apiKey} onSave={handleSaveApiKey} onClose={() => setModal(null)} />}
      {modal === "pilot_token" && <PilotTokenModal current={pilotToken} onSave={handleSavePilotToken} onClose={() => setModal(null)} />}
      {modal === "clear" && (
        <ConfirmModal
          title="Clear All Data?"
          body="This will permanently delete all locally stored records, notes, vitals, and settings, including your API key. This cannot be undone."
          confirmLabel="Yes, clear everything"
          confirmStyle={{ background: "rgba(239,68,68,.15)", border: "1px solid rgba(239,68,68,.35)", color: "#f87171" }}
          onConfirm={handleClearData}
          onCancel={() => setModal(null)}
        />
      )}
      {modal === "reset" && (
        <ConfirmModal
          title="Reset to Demo?"
          body="This will restore all tabs to the original demo data and clear any personal entries you've added. Your API key will be preserved."
          confirmLabel="Yes, reset to demo"
          confirmStyle={{ background: "rgba(245,158,11,.15)", border: "1px solid rgba(245,158,11,.35)", color: "#f59e0b" }}
          onConfirm={handleReset}
          onCancel={() => setModal(null)}
        />
      )}
      {modal === "restore" && (
        <ConfirmModal
          title="Restore this backup?"
          body={`This will overwrite your current data with the backup from ${backups.find(b => b.id === restoreId)?.date}. Your current state will be lost.`}
          confirmLabel="Yes, restore"
          confirmStyle={{ background: "rgba(79,142,247,.15)", border: "1px solid rgba(79,142,247,.35)", color: "#6ea3ff" }}
          onConfirm={confirmRestore}
          onCancel={() => setModal(null)}
        />
      )}

      {modal === "changepin" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }}>
          <div style={{ background: "#0b1220", border: "1px solid #1a2f4a", borderRadius: 16, padding: "28px 28px 24px", width: "100%", maxWidth: 340, fontFamily: "'Sora', sans-serif" }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#dde8f5", marginBottom: 4 }}>Change Password</div>
            <div style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono', monospace", marginBottom: 20 }}>Re-wraps your encryption key. Your data is not re-encrypted or touched.</div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: "#a0b4c8", marginBottom: 6 }}>Current Password</div>
              <PasswordInput
                value={pinForm.current}
                onChange={e => setPinForm(f => ({ ...f, current: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", background: "#07090f", border: "1px solid #1a2f4a", borderRadius: 8, color: "#dde8f5", fontSize: 14, fontFamily: "'Sora', sans-serif", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: "#a0b4c8", marginBottom: 6 }}>New Password (12+ characters)</div>
              <PasswordInput
                value={pinForm.next}
                onChange={e => setPinForm(f => ({ ...f, next: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", background: "#07090f", border: "1px solid #1a2f4a", borderRadius: 8, color: "#dde8f5", fontSize: 14, fontFamily: "'Sora', sans-serif", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "#a0b4c8", marginBottom: 6 }}>Confirm New Password</div>
              <PasswordInput
                value={pinForm.confirm}
                onChange={e => setPinForm(f => ({ ...f, confirm: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", background: "#07090f", border: "1px solid #1a2f4a", borderRadius: 8, color: "#dde8f5", fontSize: 14, fontFamily: "'Sora', sans-serif", boxSizing: "border-box" }}
              />
            </div>

            {pinError && <div style={{ fontSize: 12, color: "#f87171", fontFamily: "'DM Mono', monospace", marginBottom: 14 }}>{pinError}</div>}
            {pinSuccess && <div style={{ fontSize: 12, color: "#2dd4a0", fontFamily: "'DM Mono', monospace", marginBottom: 14 }}>✓ Password updated successfully.</div>}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setModal(null)} style={{ flex: 1, padding: "9px", background: "transparent", border: "1px solid #1a2f4a", borderRadius: 8, color: "#98afc4", fontSize: 12, cursor: "pointer", fontFamily: "'Sora', sans-serif" }}>Cancel</button>
              <button onClick={handleChangePin} style={{ flex: 1, padding: "9px", background: "rgba(16,185,129,.12)", border: "1px solid rgba(16,185,129,.35)", borderRadius: 8, color: "#2dd4a0", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Sora', sans-serif" }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {modal === "legal" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }}>
          <div style={{ background: "#0b1220", border: "1px solid #1a2f4a", borderRadius: 16, padding: "28px", width: "100%", maxWidth: 560, maxHeight: "80vh", overflowY: "auto", fontFamily: "'Sora', sans-serif" }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#dde8f5", marginBottom: 4 }}>Terms &amp; Privacy</div>
            <div style={{ fontSize: 12, color: "#f59e0b", fontFamily: "'DM Mono', monospace", marginBottom: 18, background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.25)", borderRadius: 6, padding: "6px 10px" }}>
              DRAFT: pending attorney review. Full text: TERMS_OF_SERVICE.md and PRIVACY_POLICY.md in the project repository.
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, color: "#7eb8d8", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 6 }}>What Insina Health is</div>
            <div style={{ fontSize: 12, color: "#a8c4dc", lineHeight: 1.65, marginBottom: 16 }}>
              A pre-commercial pilot personal health record app. It is not a medical device and
              does not diagnose, treat, or direct medical care. Every AI feature is
              informational only. This pilot is offered to a small number of invited users at
              Greg Butler's discretion, not to the general public.
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, color: "#7eb8d8", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 6 }}>Your data</div>
            <div style={{ fontSize: 12, color: "#a8c4dc", lineHeight: 1.65, marginBottom: 16 }}>
              Your health record is stored on your device, encrypted under your own password: 
              there is no Insina Health server copy and no password reset. When you use AI,
              information your request needs is sent pseudonymously through Insina's proxy to
              Anthropic; the proxy does not store or log message content, though the hosting
              infrastructure retains standard HTTP access metadata as part of normal operation.
              Pseudonymous is not the same as anonymous. You retain ownership of your data at
              all times, can export it at any time, and can delete it from your device at any
              time.
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, color: "#7eb8d8", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 6 }}>Your responsibility</div>
            <div style={{ fontSize: 12, color: "#a8c4dc", lineHeight: 1.65, marginBottom: 20 }}>
              You are responsible for your password and recovery key. Losing both means your
              data cannot be recovered by anyone. Use Insina Health only for your own health
              information (or that of someone you're legally authorized to manage it for).
            </div>

            <button onClick={() => setModal(null)} style={{ width: "100%", padding: "9px", background: "rgba(79,142,247,.12)", border: "1px solid rgba(79,142,247,.35)", borderRadius: 8, color: "#7eb8d8", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Sora', sans-serif" }}>Close</button>
          </div>
        </div>
      )}

      {toast && <Toast msg={toast} onDone={() => setToast("")} />}
    </div>
      </div>
  );
}