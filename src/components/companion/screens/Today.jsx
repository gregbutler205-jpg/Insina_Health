// ── Today — the daily hub. Surfaces what needs attention, compactly. ───────────
import { useState } from "react";
import { C, mono, serif, Card, SL, LEVEL_COLOR } from "../companionUI.jsx";
import AIMark from "../../ai/AIMark.jsx";
import {
  firstName, nextAppointment, refillsDue, latestWith, relDate, fmtShort,
  flaggedLabs, appointments, daysUntil,
} from "../../../lib/companionData.js";
import { computePatternFlags, dismissFlag } from "../../../lib/patternFlags.js";
import { isDemoMode } from "../../../lib/secureStorage.js";

export default function Today({ goTab, openLog, openEmergency, openSettings, openSurgeries, openCards, startVisit, lastSynced }) {
  const [flags, setFlags] = useState(() => computePatternFlags());

  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? "Good morning" : greetingHour < 17 ? "Good afternoon" : "Good evening";

  const appt    = nextAppointment();
  const refills = refillsDue(7);
  const nextLab = appointments()
    .filter(a => a.status !== "completed" && (daysUntil(a.date) ?? -1) >= 0 && /lab|draw|blood|panel/i.test(a.title || ""))
    .sort((a, b) => daysUntil(a.date) - daysUntil(b.date))[0];
  const flagged = flaggedLabs();

  const bp  = latestWith("bp_s");
  const wt  = latestWith("weight");
  const spo = latestWith("spo2");

  const apptSoon = appt && (daysUntil(appt.date) ?? 99) <= 2;

  // Critical lab alerts (top 2) + proactive pattern flags
  const labAlerts = flagged.slice(0, 2).map(l => ({
    id: `lab-${l.name}`, level: "caution", title: `${l.name} flagged`,
    detail: `${l.value}${l.unit ? " " + l.unit : ""}${l.refRange ? ` (ref ${l.refRange})` : ""}`, fixed: true,
  }));
  const alerts = [...flags, ...labAlerts];

  function dismiss(id) { dismissFlag(id); setFlags(f => f.filter(x => x.id !== id)); }

  return (
    <div style={{ padding: "16px 16px 28px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: C.dim, fontFamily: mono }}>{greeting}{firstName() ? "," : ""}</div>
          {firstName() && <div style={{ fontFamily: serif, fontSize: 26, color: C.p, lineHeight: 1.15 }}>{firstName()}</div>}
          {!isDemoMode() && (
            <div style={{ fontSize: 12, color: C.ghost, fontFamily: mono, marginTop: 3 }}>
              {lastSynced ? `Synced ${lastSynced}` : "Not synced yet"}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={openSettings} title="Notifications"
            style={{ background: C.card, border: `1px solid ${C.b2}`, borderRadius: 10, padding: "8px 10px", color: C.dim, fontSize: 16, cursor: "pointer", lineHeight: 1 }}>
            🔔
          </button>
          <button onClick={openEmergency}
            style={{ background: "rgba(239,68,68,.1)", border: `1px solid ${C.red}40`, borderRadius: 10, padding: "8px 12px", color: C.red, fontSize: 12, fontFamily: mono, fontWeight: 600, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, lineHeight: 1.2 }}>
            <span style={{ fontSize: 16 }}>🚨</span>Emergency
          </button>
        </div>
      </div>

      {/* At-a-glance row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 14 }}>
        <Glance label="Next visit" value={appt ? relDate(appt.date) : "None"} sub={appt ? (appt.provider || appt.title) : "–"} color={apptSoon ? C.amber : C.blue} onClick={() => goTab("care")} />
        <Glance label="Labs" value={nextLab ? relDate(nextLab.date) : flagged.length ? `${flagged.length} flagged` : "OK"} sub={nextLab ? "lab draw" : flagged.length ? "review" : "up to date"} color={flagged.length && !nextLab ? C.amber : C.green} onClick={() => goTab("care")} />
        <Glance label="Refills" value={refills.length ? `${refills.length} due` : "OK"} sub={refills.length ? relDate(refills[0].refillDate) : "none soon"} color={refills.length ? C.amber : C.green} onClick={() => goTab("meds")} />
      </div>

      {/* Active alerts */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <SL>Needs a Glance</SL>
          {alerts.map(a => (
            <div key={a.id} style={{ background: C.card, border: `1px solid ${LEVEL_COLOR[a.level]}40`, borderLeft: `3px solid ${LEVEL_COLOR[a.level]}`, borderRadius: 10, padding: "10px 12px", marginBottom: 8, display: "flex", gap: 10, alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: LEVEL_COLOR[a.level], fontWeight: 700, marginBottom: 2 }}>{a.title}</div>
                <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.5 }}>{a.detail}</div>
              </div>
              {!a.fixed && <button onClick={() => dismiss(a.id)} style={{ background: "none", border: "none", color: C.ghost, cursor: "pointer", fontSize: 14, flexShrink: 0 }}>✕</button>}
            </div>
          ))}
        </div>
      )}

      {/* Imminent-visit prompt */}
      {apptSoon && (
        <Card style={{ marginBottom: 14, border: `1px solid ${C.amber}50` }} >
          {/* v1.58.3 (Greg): the card body opens the appointment page (Care tab:
              directions + visit prep); Start still launches capture directly. */}
          <div role="button" tabIndex={0} aria-label="Open this appointment"
            onClick={() => goTab("care")}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goTab("care"); } }}
            style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
            <span style={{ fontSize: 22 }}>🎙️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: C.p, fontWeight: 600 }}>{appt.title} {relDate(appt.date).toLowerCase()}</div>
              <div style={{ fontSize: 12, color: C.amber, fontFamily: mono }}>Review the brief & capture the visit</div>
              <div style={{ fontSize: 12, color: C.s, fontFamily: mono, marginTop: 3 }}>Tap for directions & details ›</div>
            </div>
            <button onClick={e => { e.stopPropagation(); startVisit(appt); }} style={{ background: "#4f8ef7", color: "#fff", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, fontFamily: mono, cursor: "pointer" }}>Start</button>
          </div>
        </Card>
      )}

      {/* Most recent vital */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
          <SL mb={0}>Latest Vitals</SL>
          <button onClick={() => openLog("vitals")} style={{ marginLeft: "auto", fontSize: 12, color: C.blue, fontFamily: mono, background: "none", border: "none", cursor: "pointer", padding: 0 }}>+ Log</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
          <Vital label="Blood Pressure" unit="mmHg" val={bp ? `${bp.bp_s}/${bp.bp_d}` : "–"} color={C.blue} />
          <Vital label="Weight" unit="lbs" val={wt ? `${wt.weight}` : "–"} color={C.green} />
          <Vital label="Oxygen" unit="SpO₂" val={spo ? `${spo.spo2}%` : "–"} color={C.purple} />
        </div>
        {bp && <div style={{ fontSize: 12, color: C.ghost, fontFamily: mono, marginTop: 8, textAlign: "center" }}>Last recorded {fmtShort(bp.date)}</div>}
      </Card>

      {/* Quick launch */}
      <SL>Quick Capture</SL>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <QuickBtn icon="❤️" label="Log a vital" onClick={() => openLog("vitals")} />
        <QuickBtn icon="🤒" label="Log a symptom" onClick={() => openLog("symptoms")} />
        <QuickBtn icon="💊" label="Confirm meds" onClick={() => goTab("meds")} />
        <QuickBtn icon="💬" label="Talk to Insina" onClick={() => openLog("quick")} />
        <QuickBtn icon={<span style={{ color: C.blue, display: "inline-flex" }}><AIMark variant="simple" size={18} /></span>} label="AI chat" onClick={() => goTab("ai")} />
      </div>

      <div style={{ marginTop: 16 }}><SL>Health Record</SL></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <QuickBtn icon="🩺" label="Procedures" onClick={openSurgeries} />
        <QuickBtn icon="💊" label="My med list" onClick={() => goTab("meds")} />
        <QuickBtn icon="🪪" label="Insurance cards" onClick={openCards} />
      </div>
    </div>
  );
}

function Glance({ label, value, sub, color, onClick }) {
  return (
    <button onClick={onClick} style={{ background: C.card, border: `1px solid ${C.b2}`, borderRadius: 10, padding: "10px 8px", textAlign: "left", cursor: "pointer" }}>
      <div style={{ fontSize: 12, color: C.ghost, fontFamily: mono, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 12, color: C.dim, fontFamily: mono, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
    </button>
  );
}
function Vital({ label, unit, val, color }) {
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.b2}`, borderRadius: 8, padding: "10px 6px", textAlign: "center" }}>
      <div style={{ fontSize: 16, fontWeight: 700, color, letterSpacing: "-0.5px" }}>{val}</div>
      <div style={{ fontSize: 12, color: C.ghost, fontFamily: mono, marginTop: 2 }}>{unit}</div>
      <div style={{ fontSize: 12, color: C.ghost, fontFamily: mono, marginTop: 1 }}>{label}</div>
    </div>
  );
}
function QuickBtn({ icon, label, onClick }) {
  return (
    <button onClick={onClick} style={{ background: C.card, border: `1px solid ${C.b2}`, borderRadius: 10, padding: "14px 8px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", textAlign: "left" }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ fontSize: 12, color: C.s, fontWeight: 600 }}>{label}</span>
    </button>
  );
}
