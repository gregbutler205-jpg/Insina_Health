// ── TopBar: THE shared top bar (WO_DASHBOARD_POLISH_02 item 4; DEC-059) ───────
// Extracted from App.jsx (WO_DASHBOARD_FEED_01 4.2 / DEC-056) so every screen
// renders the same bar: menu toggle, Home (hidden on the dashboard),
// Emergency, search, date and time, Import records, bell, Insina AI mark,
// avatar menu. The four standalone screens (Medications, Labs, Vitals,
// Symptoms) and Insina AI render it in place of their own headers; their
// screen-specific actions sit in a `.screen-bar` under it. Styles live in
// index.css (.topbar, .topbar-icon, .topbar-btn, .topbar-label, .screen-bar).
//
// Props the App shell passes are optional: without `readings` the bell reads
// the store itself, without `picture` the avatar uses the stored Google user.
import { useEffect, useMemo, useState } from "react";
import { PanelLeftClose, PanelLeftOpen, Search, Upload, House } from "lucide-react";
import EmergencyInfoButton from "./advisory/EmergencyInfoButton.jsx";
import AIEntryButton from "./ai/AIEntryButton.jsx";
import Bell from "./dashboard/Bell.jsx";
import AvatarMenu from "./dashboard/AvatarMenu.jsx";
import { toggleNavRail, useNavRail } from "./AppSidebar.jsx";
import { getStore } from "../store.js";
import { sortReadingsByRecency } from "../lib/vitals.js";
import { getStoredUser } from "../lib/googleAuth.js";

const fmtTime = (d) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const fmtDate = (d) => d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

function storeReadings() {
  try { return sortReadingsByRecency(getStore("readings") || []); } catch { return []; }
}

/**
 * @param {string}   activeNav  - nav id of the screen being shown
 * @param {function} onNav      - called with the target nav id
 * @param {Array}    [readings] - vitals readings (newest first) for the bell
 * @param {number}   [refreshKey] - bumps the bell after a sync or import
 * @param {string}   [picture]  - Google account picture for the avatar
 */
export default function TopBar({ activeNav, onNav, readings, refreshKey = 0, picture }) {
  const rail = useNavRail();
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const bellReadings = useMemo(() => readings ?? storeReadings(), [readings, refreshKey]);
  const avatar = picture ?? (() => { try { return getStoredUser()?.picture; } catch { return undefined; } })();
  const onDashboard = activeNav === "dashboard";

  return (
    <div className="topbar">
      <button className="topbar-icon" aria-label={rail ? "Show menu" : "Hide menu"} title={rail ? "Show menu" : "Hide menu"} onClick={toggleNavRail}>
        {rail ? <PanelLeftOpen size={20} aria-hidden="true" /> : <PanelLeftClose size={20} aria-hidden="true" />}
      </button>
      {/* DEC-059: Home on every screen except the dashboard */}
      {!onDashboard && (
        <button className="topbar-btn" aria-label="Home" title="Home" onClick={() => onNav("dashboard")}><House size={18} aria-hidden="true" /><span className="topbar-label">Home</span></button>
      )}
      {/* tripwire advisory section 5: persistent Emergency Info (topbar), unchanged */}
      <EmergencyInfoButton variant="topbar" />
      {/* UI-26: the App shell owns the search popup and listens for this event */}
      <button className="topbar-icon" onClick={() => window.dispatchEvent(new Event("insina-open-search"))} title="Search" aria-label="Search"><Search size={20} aria-hidden="true" /></button>
      <span className="topbar-date">{fmtDate(time)} · {fmtTime(time)}</span>
      {activeNav !== "import" && (
        <button className="topbar-btn" aria-label="Import records" title="Import records" onClick={() => onNav("import")}><Upload size={18} aria-hidden="true" /><span className="topbar-label">Import records</span></button>
      )}
      <Bell readings={bellReadings} refreshKey={refreshKey} />
      {/* DEC-P49: persistent entry button, left of the avatar, hidden on Import Records */}
      {activeNav !== "import" && <AIEntryButton iconSize={32} source="nav" onNavigate={() => onNav("ai")} />}
      <AvatarMenu onNav={onNav} picture={avatar} />
    </div>
  );
}
