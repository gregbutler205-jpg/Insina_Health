// ── Dashboard (WO_DASHBOARD_FEED_01; DEC-051 to DEC-055) ─────────────────────
// Greeting row, conditional emergency strip, five quick actions, one "Your
// updates" column, three vitals, and a right rail with Who to call and the
// existing Insina AI panel. Data comes from feed.js; nothing here computes
// urgency or authors flag text. The reference mockup is
// docs/mockups/insina_dashboard_feed.jsx; the work order wins where they differ.
import { useCallback, useEffect, useState } from "react";
import {
  Activity, Pill, Calendar, ClipboardList, Printer, TriangleAlert, FileText, FlaskConical,
  Phone, Check, X, ChevronRight,
} from "lucide-react";
import {
  buildFeed, dismissFeedItem, acknowledgeFlag, openAdvisoryFlag, currentVitals, rosterFromCareTeam,
  FEED_PREVIEW, NEEDS_ATTENTION,
} from "./feed.js";
import { setPendingSelect } from "../../lib/searchSelect.js";
import { AI_FEATURES_ENABLED } from "../../config/aiFeatures.js";
import AILauncher from "../ai/AILauncher.jsx";
import AIEntryButton from "../ai/AIEntryButton.jsx";
import TaskCards from "../onboarding/TaskCards.jsx";
import { formatDateUS } from "../../lib/displaySafe.js";

const MONO = "'DM Mono',monospace";
const SANS = "'Sora',sans-serif";
const SERIF = "'DM Serif Display',serif";
const T = {
  card: "#0b1220", raised: "#101a2c", border: "#1c2a40", text: "#e6eef8", text2: "#c4d8ee",
  muted: "#8fabc7", faint: "#7a97b6", accent: "#6ea3ff", ink: "#07090f",
  ok: "#2dd4a0", warn: "#f59e0b", danger: "#f87171",
  warnBg: "rgba(245,158,11,0.10)", dangerBg: "rgba(248,113,113,0.10)",
};
const KIND_ICON = { flag: TriangleAlert, review: FileText, result: FlaskConical, appt: Calendar, refill: Pill };
// Vitals keep the existing dashboard coloring: resting BP is dark orange (red is
// reserved for a flagged reading), weight purple, temperature amber.
const VITAL_COLOR = { bp: "#ea580c", weight: "#a78bfa", temp: "#f59e0b" };

const CSS = `
  .dash-btn { min-height: 44px; border-radius: 10px; border: 1.5px solid ${T.border}; background: ${T.raised}; color: ${T.text}; font-size: 14px; font-weight: 600; font-family: ${SANS}; padding: 0 16px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; white-space: nowrap; cursor: pointer; }
  .dash-btn.primary { background: ${T.accent}; color: ${T.ink}; border-color: ${T.accent}; }
  .dash-btn.ghost { background: transparent; }
  .dash-btn.icon { width: 44px; min-width: 44px; padding: 0; background: transparent; border-color: transparent; color: ${T.muted}; }
  .dash-btn.icon:hover { background: ${T.raised}; color: ${T.text}; }
  .dash-btn.wrap { white-space: normal; text-align: left; justify-content: flex-start; font-weight: 500; }
  .dash-tile { min-height: 96px; padding: 10px 6px; border-radius: 14px; border: 1px solid ${T.border}; background: ${T.card}; color: ${T.text2}; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; font-size: 14px; font-weight: 600; font-family: ${SANS}; position: relative; cursor: pointer; text-align: center; white-space: normal; line-height: 1.2; }
  .dash-tile:hover { border-color: ${T.accent}; color: ${T.text}; }
  .dash-tiles { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 28px; }
  .dash-grid { display: grid; grid-template-columns: minmax(0, 720px) 300px; gap: 24px; align-items: start; }
  .dash-vitals { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .dash-clamp2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .dash-badge { background: ${T.warn}; color: ${T.ink}; font-size: 12px; font-weight: 700; border-radius: 999px; min-width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; padding: 0 6px; font-family: ${SANS}; }
  @media (max-width: 900px) {
    .dash-tiles { grid-template-columns: repeat(3, 1fr); gap: 6px; }
    .dash-tile { font-size: 12px; padding: 8px 4px; letter-spacing: -0.2px; }
    .dash-grid { grid-template-columns: 1fr; }
    .dash-vitals { grid-template-columns: 1fr; }
  }
`;

function firstName() {
  try { const p = JSON.parse(localStorage.getItem("mi_profile_personal") || "{}"); return (p.name || "").split(" ")[0] || ""; } catch { return ""; }
}
function careTeam() {
  try { const t = JSON.parse(localStorage.getItem("mi_care_team") || "[]"); return Array.isArray(t) ? t : []; } catch { return []; }
}
function greetingWord(d) {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
function fmtTime(ts) {
  const d = ts ? new Date(ts) : null;
  return d && !isNaN(d) ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : null;
}
function whenLabel(item) {
  if (!item.date) return "";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? new Date(item.date + "T12:00:00") : new Date(item.date);
  if (isNaN(d)) return "";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d); that.setHours(0, 0, 0, 0);
  if (that.getTime() === today.getTime()) return "Today";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function Dashboard({ readings = [], onNav, onLogVitals, lastSyncTs, refreshKey = 0, now = new Date() }) {
  const [feed, setFeed] = useState(() => buildFeed(now));
  const [showAll, setShowAll] = useState(false);
  const rebuild = useCallback(() => setFeed(buildFeed(new Date())), []);

  useEffect(() => { rebuild(); }, [refreshKey, rebuild]);
  useEffect(() => {
    const events = ["mi-data-synced", "mi-dashboard-changed", "mi_tripwire_changed", "insina-advisory"];
    events.forEach(e => window.addEventListener(e, rebuild));
    return () => events.forEach(e => window.removeEventListener(e, rebuild));
  }, [rebuild]);

  const go = (item) => {
    if (item.select) setPendingSelect(item.select.category, item.select.title);
    if (item.nav) onNav(item.nav);
  };
  const view = (item) => {
    if (item.kind === "flag" && item.engine === "advisory") { openAdvisoryFlag(item); return; }
    go(item);
  };
  const dismiss = (item) => { dismissFeedItem(item); rebuild(); };
  const acknowledge = (item) => { acknowledgeFlag(item.flagId, "patient"); rebuild(); };

  const name = firstName();
  const n = feed.attention;
  const subtitle = n === 0 ? "Nothing needs your attention today." : `${n} thing${n === 1 ? "" : "s"} need${n === 1 ? "s" : ""} your attention.`;
  const synced = fmtTime(lastSyncTs);
  const items = showAll ? feed.items : feed.items.slice(0, FEED_PREVIEW);
  const vitals = currentVitals(readings);
  const team = careTeam();
  const roster = rosterFromCareTeam(team);

  const tiles = [
    { id: "vitals", label: "Log vitals", icon: Activity, color: "#f87171", onClick: onLogVitals },
    { id: "medications", label: "Medications", icon: Pill, color: "#fbbf24", badge: feed.refillsDue, onClick: () => onNav("medications") },
    { id: "appointments", label: "Appointments", icon: Calendar, color: "#6ea3ff", badge: feed.appointmentsSoon, onClick: () => onNav("appointments") },
    { id: "symptoms", label: "Symptoms", icon: ClipboardList, color: "#c4b5fd", onClick: () => onNav("symptoms") },
    { id: "reports", label: "Reports", icon: Printer, color: "#2dd4a0", onClick: () => onNav("reports") },
  ];

  return (
    <div style={{ fontFamily: SANS, color: T.text }}>
      <style>{CSS}</style>

      {/* 4.3 greeting row */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 32, margin: "0 0 4px", letterSpacing: "-0.3px", color: "#dde8f5" }}>
          {greetingWord(now)}{name ? `, ${name}.` : "."}
        </h1>
        {synced && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.muted, fontFamily: MONO }}>
            <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: "50%", background: T.ok, display: "inline-block" }} />
            Last updated {synced}
          </div>
        )}
      </div>
      <p style={{ fontSize: 15, color: T.muted, margin: "0 0 20px" }}>{subtitle}</p>

      {/* 4.4 emergency strip: engine text verbatim, no dismiss, only when an emergency-tier flag is current */}
      {feed.emergency.map(flag => (
        <section key={flag.id} role="alert" aria-label="Emergency"
          style={{ background: T.dangerBg, border: `1px solid ${T.danger}`, borderRadius: 14, padding: 16, marginBottom: 20, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <TriangleAlert size={24} color={T.danger} strokeWidth={2.2} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "1.5px", color: T.danger, fontFamily: MONO, marginBottom: 6 }}>EMERGENCY</div>
            <div style={{ fontSize: 15, color: T.text, lineHeight: 1.55 }}>{flag.text}</div>
            <div style={{ marginTop: 12 }}>
              {/* Outline, not a red fill: white on #ef4444 is 3.8:1 and fails AA (DEC-049) */}
              <button className="dash-btn" style={{ background: "transparent", color: T.text, borderColor: T.danger }} onClick={() => view(flag)}>{flag.action}</button>
            </div>
          </div>
        </section>
      ))}

      {/* 4.5 quick actions */}
      <div className="dash-tiles">
        {tiles.map(({ id, label, icon: Icon, color, badge, onClick }) => (
          <button key={id} className="dash-tile" onClick={onClick}>
            <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 10, background: `${color}22`, display: "flex", alignItems: "center", justifyContent: "center", color }}>
              <Icon size={22} strokeWidth={2.2} />
            </span>
            {label}
            {badge > 0 && <span className="dash-badge" aria-label={`${badge} ${id === "medications" ? "refills due within 7 days" : "appointments within 14 days"}`} style={{ position: "absolute", top: 8, right: 10 }}>{badge}</span>}
          </button>
        ))}
      </div>

      <div className="dash-grid">
        <section>
          {/* ONBOARDING_SPEC v1.1 section 7 task engine stays on the dashboard (Tier 2, logged). */}
          <TaskCards onNav={onNav} />

          {/* 4.6 Your updates */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: T.text2 }}>Your updates</h2>
            {n > 0 && <span className="dash-badge" title="Need a response">{n}</span>}
          </div>

          {feed.items.length === 0 && (
            <div style={{ border: `1px solid ${T.ok}`, background: "rgba(45,212,160,0.08)", borderRadius: 14, padding: 18, color: T.ok, fontSize: 15, display: "flex", gap: 10, alignItems: "center" }}>
              <Check size={20} aria-hidden="true" /> Nothing new. Your record is up to date.
            </div>
          )}

          {items.map(item => {
            const attention = NEEDS_ATTENTION.has(item.kind);
            const isFlag = item.kind === "flag";
            const Icon = KIND_ICON[item.kind] || FileText;
            return (
              <article key={item.id} style={{ background: attention ? T.warnBg : T.card, border: `1px solid ${attention ? T.warn : T.border}`, borderRadius: 14, padding: 14, marginBottom: 10 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 10, background: T.raised, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: attention ? T.warn : T.accent }}>
                    <Icon size={18} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="dash-clamp2" style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}>{item.title}</div>
                    {whenLabel(item) && <div style={{ fontSize: 13, color: T.faint, fontFamily: MONO, marginTop: 2 }}>{whenLabel(item)}</div>}
                  </div>
                  {!isFlag && (
                    <button className="dash-btn icon" aria-label="Dismiss" title="Dismiss" onClick={() => dismiss(item)}><X size={18} /></button>
                  )}
                </div>
                {item.body && <div className="dash-clamp2" style={{ fontSize: 14, color: T.text2, lineHeight: 1.5, marginTop: 8 }}>{item.body}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  {item.kind === "appt" && AI_FEATURES_ENABLED ? (
                    <AILauncher label="Prepare for this visit"
                      scope={{ source: "appointment", items: [{ kind: "appointment", id: String(item.appointment?.id ?? item.id), label: `Visit: ${item.appointment?.provider || item.title}, ${formatDateUS(item.date)}`, date: item.date }] }}
                      onNavigate={() => onNav("ai")} style={{ minHeight: 44, borderRadius: 10, padding: "0 12px", fontSize: 14 }} />
                  ) : (
                    <button className={`dash-btn ${isFlag ? "primary" : ""}`} style={{ padding: "0 12px" }} onClick={() => view(item)}>{item.action}</button>
                  )}
                  {isFlag && (
                    <button className="dash-btn" style={{ padding: "0 12px" }} onClick={() => acknowledge(item)}><Check size={16} aria-hidden="true" /> Acknowledge</button>
                  )}
                </div>
              </article>
            );
          })}

          {feed.items.length > FEED_PREVIEW && (
            <button className="dash-btn ghost" style={{ width: "100%" }} onClick={() => setShowAll(s => !s)}>
              {showAll ? "Show fewer" : `View all ${feed.items.length}`} <ChevronRight size={16} aria-hidden="true" />
            </button>
          )}

          {/* 4.7 vitals */}
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: "28px 0 12px" }}>Current vitals</h2>
          <div className="dash-vitals">
            {vitals.map(v => (
              <div key={v.id} style={{ background: T.card, border: `1px solid ${v.flagged ? "rgba(248,113,113,.35)" : T.border}`, borderRadius: 12, padding: "12px 12px 10px" }}>
                <div style={{ fontSize: 13, color: T.muted, marginBottom: 6 }}>{v.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: v.value == null ? T.faint : v.flagged ? T.danger : VITAL_COLOR[v.id], lineHeight: 1, fontFamily: MONO }}>
                  {v.value == null ? "–" : v.value}{v.value != null && <span style={{ fontSize: 12, fontWeight: 500, marginLeft: 3 }}>{v.unit}</span>}
                </div>
                <div style={{ fontSize: 12, color: T.faint, marginTop: 6, fontFamily: MONO }}>{v.date ? formatDateUS(v.date) : "No reading yet"}</div>
              </div>
            ))}
          </div>
          <button className="dash-btn ghost" style={{ marginTop: 10, width: "100%" }} onClick={() => onNav("vitals")}>All vitals and trends <ChevronRight size={16} aria-hidden="true" /></button>
        </section>

        {/* 4.8 right rail */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <section aria-label="Who to call" style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 12px" }}>Who to call</h2>
            {roster.length === 0 && <div style={{ fontSize: 14, color: T.muted, lineHeight: 1.5 }}>Add phone numbers to your care team to see them here.</div>}
            {roster.map(r => (
              <div key={`${r.role}:${r.tel}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: `1px solid ${T.border}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{r.role}</div>
                  {r.name && <div style={{ fontSize: 13, color: T.muted }}>{r.name}</div>}
                </div>
                <a href={`tel:${r.tel}`} style={{ color: T.accent, fontSize: 15, fontWeight: 600, fontFamily: MONO, textDecoration: "none", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44 }}>
                  <Phone size={15} aria-hidden="true" /> {r.display}
                </a>
              </div>
            ))}
            <button className="dash-btn ghost" style={{ marginTop: 10, width: "100%" }} onClick={() => onNav("careplan")}>Full care team ({team.length}) <ChevronRight size={16} aria-hidden="true" /></button>
          </section>

          {/* DEC-P49 / DEC-P51: the existing quick-launch panel, subtitle per 4.8 */}
          {AI_FEATURES_ENABLED && (
            <section aria-label="Insina AI" style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <AIEntryButton iconSize={44} source="dashboard" onNavigate={() => onNav("ai")} />
              </div>
              <div style={{ textAlign: "center", fontSize: 14, fontWeight: 600, color: "var(--text-primary)", letterSpacing: ".2px", margin: "-4px 0 6px" }}>
                Insina <span style={{ color: "var(--accent-blue, var(--accent))" }}>AI</span>
              </div>
              <p style={{ fontSize: 14, color: T.muted, margin: "0 0 12px", lineHeight: 1.5 }}>Asks questions about your record. It never tells you what to do.</p>
              {["Analyze my current health status", "Review my medications for interactions", "Prep for Hepatology appt"].map((q, i) => (
                <AILauncher key={i} className="dash-btn wrap" label={q} question={q} scope={{ source: "dashboard", items: [] }} onNavigate={() => onNav("ai")}
                  style={{ width: "100%", marginBottom: 8 }} />
              ))}
              <AILauncher className="dash-btn primary" label="Custom query..." scope={{ source: "dashboard", items: [] }} onNavigate={() => onNav("ai")}
                style={{ width: "100%", marginTop: 4 }} />
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
