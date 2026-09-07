import AIMark from "./ai/AIMark.jsx";
// ── UI-10: THE shared application sidebar ─────────────────────────────────────
// One sidebar, one NAV list, shared by App.jsx and the standalone tabs
// (Medications, Labs, Vitals, Symptoms). Styles come from index.css
// (.nav-item, .nav-group-header; UI-8 tokens).
//
// WO_DASHBOARD_FEED_01 4.11 (DEC-056): four groups. Today and My health are
// always expanded; Records (default collapsed) and Tools (default expanded)
// toggle, and the state persists in a plain localStorage key. Emergency
// information stays pinned at the bottom. Profile, Settings, Backup, and Log
// out moved to the avatar menu (AvatarMenu.jsx). The sidebar collapses to a
// 96px icon rail (top bar toggle, persisted) and does so on its own below
// 900px wide. Icons are lucide-react per WO_ACCESSIBLE_TOKENS_01 4.6; the AI
// row keeps the Insina AI mark (DEC-P47).
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Calendar, FlaskConical, Pill, HeartPulse, ClipboardList, User, Users,
  Stethoscope, Scissors, ScanLine, FolderOpen, FileText, NotebookPen, Upload, Printer,
  ShieldAlert, ChevronDown, ChevronRight,
} from "lucide-react";
import { openEmergencyInfo } from "../lib/advisoryRuntime.js";

// Labels are sentence case per the work order. ids and store keys are unchanged.
export const NAV = [
  { id: "dashboard",   icon: LayoutDashboard, label: "Dashboard" },
  { id: "appointments",icon: Calendar,        label: "Appointments" },
  { id: "labs",        icon: FlaskConical,    label: "Labs and trends" },
  { id: "medications", icon: Pill,            label: "Medications" },
  { id: "vitals",      icon: HeartPulse,      label: "Vitals" },
  { id: "symptoms",    icon: ClipboardList,   label: "Symptoms" },
  { id: "profile",     icon: User,            label: "Health profile" },
  { id: "careplan",    icon: Users,           label: "Care team" },
  { id: "conditions",  icon: Stethoscope,     label: "Conditions" },
  { id: "surgeries",   icon: Scissors,        label: "Procedures" },   // renamed from "Surgeries"; id/store keys unchanged
  { id: "diagnostics", icon: ScanLine,        label: "Diagnostics" },
  { id: "records",     icon: FileText,        label: "Medical records" }, // DEC-056 note: two record modules stay reachable
  { id: "documents",   icon: FolderOpen,      label: "Documents" },
  { id: "notes",       icon: NotebookPen,     label: "Notes" },
  { id: "import",      icon: Upload,          label: "Import records" },
  { id: "reports",     icon: Printer,         label: "Reports" },
  { id: "ai",          icon: null,            label: "Insina AI" },     // renders the Insina AI mark (DEC-P47)
];

export const NAV_GROUPS = [
  { key: "today",   label: "Today",     fixed: true, ids: ["dashboard", "appointments"] },
  { key: "health",  label: "My health", fixed: true, ids: ["labs", "medications", "vitals", "symptoms", "profile", "careplan"] },
  { key: "records", label: "Records",   defaultCollapsed: true, ids: ["conditions", "surgeries", "diagnostics", "records", "documents", "notes"] },
  { key: "tools",   label: "Tools",     defaultCollapsed: false, ids: ["import", "reports", "ai"] },
];

// Plain keys on purpose: mi_* keys are vault-managed (encrypted, unreadable
// while locked); a UI preference must survive lock state.
const COLLAPSE_KEY = "insina_nav_collapsed";
const RAIL_KEY = "insina_nav_rail";
const RAIL_EVENT = "insina-nav-rail";
const NARROW_QUERY = "(max-width: 900px)";

function readCollapsed() {
  try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || "{}"); } catch { return {}; }
}
export function readNavRail() {
  try { return localStorage.getItem(RAIL_KEY) === "1"; } catch { return false; }
}
/** Top bar menu toggle: flips the persisted rail preference for every sidebar instance. */
export function toggleNavRail() {
  const next = !readNavRail();
  try { localStorage.setItem(RAIL_KEY, next ? "1" : "0"); } catch { /* preference only */ }
  try { window.dispatchEvent(new Event(RAIL_EVENT)); } catch { /* not in a browser */ }
}
/** Rail when the patient chose it, or when the viewport is narrow. */
export function useNavRail() {
  const [pref, setPref] = useState(readNavRail);
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(NARROW_QUERY).matches);
  useEffect(() => {
    const onRail = () => setPref(readNavRail());
    window.addEventListener(RAIL_EVENT, onRail);
    const mq = window.matchMedia ? window.matchMedia(NARROW_QUERY) : null;
    const onMq = (e) => setNarrow(e.matches);
    if (mq) { if (mq.addEventListener) mq.addEventListener("change", onMq); else mq.addListener(onMq); }
    return () => {
      window.removeEventListener(RAIL_EVENT, onRail);
      if (mq) { if (mq.removeEventListener) mq.removeEventListener("change", onMq); else mq.removeListener(onMq); }
    };
  }, []);
  return pref || narrow;
}

const LOGO = import.meta.env.BASE_URL + "logo-white.png";

function PatientBlock() {
  let name = "", condition = "";
  try {
    const p = JSON.parse(localStorage.getItem("mi_profile_personal") || "{}");
    name = p.name || "";
  } catch { /* locked or unset */ }
  try {
    const c = JSON.parse(localStorage.getItem("mi_conditions") || "[]").filter(x => x.status === "active");
    condition = c[0]?.name || "";
  } catch { /* locked or unset */ }
  return (
    <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--divider)" }}>
      <div style={{ fontSize: 12, color: "var(--text-label)", fontFamily: "var(--font-mono)", marginBottom: 4 }}>PATIENT</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{name}</div>
      {condition && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{condition}</div>}
    </div>
  );
}

function NavItem({ id, icon, label, active, onNav, rail }) {
  // DEC-P49: the AI row carries the Insina AI mark (simple, 14) in place of a
  // generic sparkle; the mark stays visible when the AI features flag is off (DEC-P51).
  const isAI = id === "ai";
  const Icon = icon;
  return (
    <div
      className={`nav-item ${active ? "active" : ""}`}
      onClick={() => onNav(id)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNav(id); } }}
      role="button"
      tabIndex={0}
      aria-current={active ? "page" : undefined}
      aria-label={rail ? label : undefined}
      title={rail ? label : undefined}
      style={rail ? { justifyContent: "center", padding: "11px 0" } : undefined}
    >
      <span className="nav-icon" aria-hidden="true">
        {isAI ? <AIMark variant="simple" size={14} /> : (Icon ? <Icon size={16} strokeWidth={2} /> : null)}
      </span>
      {!rail && <span>{label}</span>}
    </div>
  );
}

/**
 * @param {string}   activeNav - nav id of the screen being shown
 * @param {function} onNav     - called with the target nav id
 */
export default function AppSidebar({ activeNav, onNav }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const rail = useNavRail();

  const isCollapsed = (group) => {
    if (group.fixed) return false;
    if (group.ids.includes(activeNav)) return false; // the active screen's group stays open
    return collapsed[group.key] ?? !!group.defaultCollapsed;
  };
  const toggleGroup = (group) => {
    if (group.fixed) return;
    // Collapsing the group that holds the active screen is a visual no-op
    // (it force-renders expanded), so don't store a collapse the user never saw.
    if (group.ids.includes(activeNav) && !isCollapsed(group)) return;
    setCollapsed(prev => {
      const next = { ...prev, [group.key]: !(prev[group.key] ?? !!group.defaultCollapsed) };
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)); } catch { /* quota/denied: state still works this session */ }
      return next;
    });
  };

  const byId = Object.fromEntries(NAV.map(item => [item.id, item]));
  const width = rail ? 96 : 220;

  return (
    <aside style={{
      width, minWidth: width, height: "100vh",
      background: "var(--bg-deep)",
      borderRight: "1px solid var(--divider)",
      display: "flex", flexDirection: "column",
      flexShrink: 0, transition: "width .2s, min-width .2s",
    }}>
      {/* Wordmark: the logo lockup when expanded, the text wordmark on the rail (brand accent, DEC-050) */}
      <div style={{ padding: rail ? "14px 8px 12px" : "10px 20px", borderBottom: "1px solid var(--divider)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        {rail ? (
          <>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, color: "#4f8ef7", lineHeight: 1, whiteSpace: "nowrap" }}>Insina</div>
            <div style={{ fontSize: 12, color: "var(--text-label)", marginTop: 4 }}>Health</div>
          </>
        ) : (
          <img src={LOGO} alt="Insina Health" style={{ width: "100%", height: "auto", display: "block" }} />
        )}
      </div>

      {!rail && <PatientBlock />}

      <nav aria-label="Main" style={{ flex: 1, overflowY: "auto", padding: "10px 0" }}>
        {NAV_GROUPS.map(group => {
          const closed = isCollapsed(group);
          return (
            <div key={group.key}>
              {!rail && (group.fixed ? (
                <div className="nav-group-header" style={{ cursor: "default" }}><span>{group.label}</span></div>
              ) : (
                <button className="nav-group-header" onClick={() => toggleGroup(group)} aria-expanded={!closed}>
                  <span>{group.label}</span>
                  <span aria-hidden="true" style={{ display: "inline-flex", color: "var(--text-dim)" }}>{closed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</span>
                </button>
              ))}
              {(rail || !closed) && group.ids.map(id => {
                const item = byId[id];
                return item ? <NavItem key={id} {...item} active={activeNav === id} onNav={onNav} rail={rail} /> : null;
              })}
            </div>
          );
        })}
      </nav>

      {/* UI-9 + tripwire advisory section 5: Emergency Information, pinned, always
          visible, never inside a collapsible group. Opens the Emergency Info screen. */}
      <div style={{ borderTop: "1px solid var(--divider)", padding: "8px 0" }}>
        <div
          className="nav-item"
          onClick={openEmergencyInfo}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEmergencyInfo(); } }}
          role="button"
          tabIndex={0}
          title="Emergency Information: call 911, directions to the nearest ED, your emergency card"
          aria-label={rail ? "Emergency Information" : undefined}
          style={{ color: "var(--red)", ...(rail ? { justifyContent: "center", padding: "11px 0" } : {}) }}
        >
          <span className="nav-icon" aria-hidden="true"><ShieldAlert size={16} strokeWidth={2} /></span>
          {!rail && <span>Emergency Information</span>}
        </div>
      </div>
    </aside>
  );
}
