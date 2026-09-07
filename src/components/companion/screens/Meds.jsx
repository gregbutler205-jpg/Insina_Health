// ── Meds — the one genuinely daily screen. ────────────────────────────────────
// Pick a tracking MODE once (then it collapses to "current + Change"); confirm a
// whole group in one tap; name a drug only when flagging an exception. Reminders
// are per dose-time group, each independently on/off.
import { useState } from "react";
import { C, mono, Card, SL, Pill, Btn, Empty } from "../companionUI.jsx";
import {
  medGroups, refillsDue, relDate, medId,
  MED_MODES, getMedMode, setMedMode, isMedModeChosen,
  todayConfirms, confirmGroup, unconfirmGroup,
  EXCEPTION_TYPES, todayExceptions, logException, removeException,
} from "../../../lib/companionData.js";
import { getMedReminders, setMedReminder, requestNotifPermission } from "../../../lib/notify.js";

const modeLabel = (k) => MED_MODES.find(m => m.key === k)?.label || k;

export default function Meds({ queueSync, openMedList }) {
  const [mode, setMode] = useState(getMedMode());
  const [chosen, setChosen] = useState(isMedModeChosen());
  const [choosing, setChoosing] = useState(false);
  const [confirmed, setConfirmed] = useState(todayConfirms());
  const [exceptions, setExceptions] = useState(todayExceptions());
  const [showException, setShowException] = useState(false);
  const [reminders, setReminders] = useState(getMedReminders());

  const { groups, prn } = medGroups();
  const refills = refillsDue(7);
  const canConfirm = mode === "quick" || mode === "full";
  const canFlag    = mode === "quick" || mode === "full";
  const showPicker = !chosen || choosing;

  function pickMode(m) { setMode(m); setMedMode(m); setChosen(true); setChoosing(false); queueSync?.(); }
  function toggleGroup(key) {
    if (confirmed.includes(key)) { unconfirmGroup(key); setConfirmed(c => c.filter(k => k !== key)); }
    else { confirmGroup(key); setConfirmed(c => [...c, key]); }
    queueSync?.();
  }
  async function toggleReminder(group) {
    const cur = reminders[group];
    if (!cur.on) await requestNotifPermission();
    setMedReminder(group, { on: !cur.on });
    setReminders(getMedReminders());
  }
  function setReminderTime(group, time) { setMedReminder(group, { time }); setReminders(getMedReminders()); }
  function saveException(entry) { setExceptions(e => [logException(entry), ...e]); setShowException(false); queueSync?.(); }
  function dropException(id) { removeException(id); setExceptions(e => e.filter(x => x.id !== id)); queueSync?.(); }

  return (
    <div style={{ padding: "16px 16px 28px" }}>

      {/* Tracking mode: a one-time picker, then collapsed to current + Change */}
      {showPicker ? (
        <Card style={{ marginBottom: 16 }}>
          <SL>{chosen ? "Change Tracking Mode" : "Choose How to Track Meds"}</SL>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {MED_MODES.map(m => {
              const active = mode === m.key;
              return (
                <button key={m.key} onClick={() => pickMode(m.key)}
                  style={{ textAlign: "left", background: active ? "rgba(79,142,247,.12)" : C.bg, border: `1px solid ${active ? C.blue : C.b2}`, borderRadius: 8, padding: "9px 10px", cursor: "pointer" }}>
                  <div style={{ fontSize: 12, color: active ? C.blue : C.s, fontWeight: 600 }}>{m.label}</div>
                  <div style={{ fontSize: 12, color: C.ghost, fontFamily: mono, marginTop: 1, lineHeight: 1.3 }}>{m.blurb}</div>
                </button>
              );
            })}
          </div>
          {chosen && <button onClick={() => setChoosing(false)} style={{ background: "none", border: "none", color: C.ghost, fontSize: 12, fontFamily: mono, cursor: "pointer", marginTop: 10 }}>Cancel</button>}
        </Card>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 12, color: C.dim, fontFamily: mono }}>Tracking: <span style={{ color: C.s }}>{modeLabel(mode)}</span></span>
          <button onClick={() => setChoosing(true)} style={{ background: "none", border: "none", color: C.blue, fontSize: 12, fontFamily: mono, cursor: "pointer" }}>Change</button>
          <button onClick={openMedList} style={{ marginLeft: "auto", background: "rgba(79,142,247,.12)", border: `1px solid ${C.blue}40`, borderRadius: 8, padding: "6px 12px", color: C.blue, fontSize: 12, fontFamily: mono, cursor: "pointer" }}>📋 My med list</button>
        </div>
      )}

      {/* Refills surfaced at the top */}
      {refills.length > 0 && (
        <Card style={{ marginBottom: 16, border: `1px solid ${C.amber}40` }}>
          <SL>Refills Due Soon</SL>
          {refills.map(m => (
            <div key={medId(m)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
              <span style={{ fontSize: 15 }}>💊</span>
              <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: C.s, fontWeight: 600 }}>{m.name}</div>
              <span style={{ fontSize: 12, color: C.amber, fontFamily: mono }}>{relDate(m.refillDate)}</span>
            </div>
          ))}
        </Card>
      )}

      {/* Scheduled groups — whole-group one-tap confirm + per-group reminder */}
      {groups.length === 0 ? <Empty>No active medications on file.</Empty> : groups.map(g => {
        const done = confirmed.includes(g.key);
        const rem = reminders[g.key] || { on: false, time: "08:00" };
        return (
          <Card key={g.key} style={{ marginBottom: 12, border: `1px solid ${done ? C.green + "55" : C.b2}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 18 }}>{g.icon}</span>
              <div style={{ fontSize: 14, color: C.p, fontWeight: 600 }}>{g.label}</div>
              <Pill color={C.dim}>{g.meds.length} meds</Pill>
            </div>
            <GroupMeds meds={g.meds} />

            {/* Reminder toggle (any mode except Off) */}
            {mode !== "off" && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.b2}` }}>
                <button onClick={() => toggleReminder(g.key)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  <span style={{ fontSize: 14, opacity: rem.on ? 1 : 0.4 }}>🔔</span>
                  <MiniToggle on={rem.on} />
                  <span style={{ fontSize: 12, color: rem.on ? C.s : C.ghost, fontFamily: mono }}>Reminder</span>
                </button>
                {rem.on && (
                  <input type="time" value={rem.time} onChange={e => setReminderTime(g.key, e.target.value)}
                    style={{ marginLeft: "auto", background: C.bg, border: `1px solid ${C.b1}`, borderRadius: 6, color: C.p, padding: "4px 8px", fontSize: 12, fontFamily: mono }} />
                )}
              </div>
            )}

            {canConfirm && (
              done
                ? <button onClick={() => toggleGroup(g.key)} style={{ width: "100%", marginTop: 10, padding: 10, background: "rgba(16,185,129,.12)", border: `1px solid ${C.green}55`, borderRadius: 8, color: C.green, fontSize: 12, fontFamily: mono, fontWeight: 600, cursor: "pointer" }}>
                    ✓ Confirmed. Tap to undo
                  </button>
                : <Btn onClick={() => toggleGroup(g.key)} color={C.green} style={{ marginTop: 10 }}>Took my {g.label.toLowerCase()} meds</Btn>
            )}
          </Card>
        );
      })}

      {/* PRN / as-needed */}
      {prn.length > 0 && (
        <Card style={{ marginBottom: 12 }}>
          <SL>As Needed</SL>
          {prn.map(m => (
            <div key={medId(m)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px solid ${C.b2}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: C.s, fontWeight: 600 }}>{m.name}</div>
                <div style={{ fontSize: 12, color: C.ghost, fontFamily: mono }}>{[m.dose, m.frequency].filter(Boolean).join(" · ")}</div>
              </div>
              {canFlag && (
                <button onClick={() => saveException({ group: "prn", medId: medId(m), medName: m.name, type: "prn", note: "" })}
                  style={{ background: "rgba(79,142,247,.12)", border: `1px solid ${C.blue}40`, borderRadius: 8, padding: "5px 10px", color: C.blue, fontSize: 12, fontFamily: mono, cursor: "pointer", flexShrink: 0 }}>
                  Took one
                </button>
              )}
            </div>
          ))}
        </Card>
      )}

      {/* Exception path — the only place a single drug gets named */}
      {canFlag && !showException && (
        <button onClick={() => setShowException(true)} style={{ width: "100%", padding: 10, background: "none", border: `1px dashed ${C.b1}`, borderRadius: 8, color: C.dim, fontSize: 12, fontFamily: mono, cursor: "pointer", marginBottom: 12 }}>
          Something off? Flag a skipped / late / reaction
        </button>
      )}
      {showException && <ExceptionForm groups={groups} prn={prn} onSave={saveException} onCancel={() => setShowException(false)} />}

      {exceptions.length > 0 && (
        <Card>
          <SL>Today’s Exceptions</SL>
          {exceptions.map(e => (
            <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.b2}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: C.p }}>{e.medName}</div>
                <div style={{ fontSize: 12, color: C.amber, fontFamily: mono }}>{EXCEPTION_TYPES.find(t => t.key === e.type)?.label || e.type}{e.note ? `: ${e.note}` : ""}</div>
              </div>
              <button onClick={() => dropException(e.id)} style={{ background: "none", border: "none", color: C.ghost, cursor: "pointer", fontSize: 13 }}>✕</button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function MiniToggle({ on }) {
  return (
    <span style={{ width: 30, height: 17, borderRadius: 9, border: `1px solid ${on ? C.green : C.b1}`, background: on ? "rgba(16,185,129,.25)" : C.bg, position: "relative", display: "inline-block" }}>
      <span style={{ position: "absolute", top: 1, left: on ? 14 : 1, width: 13, height: 13, borderRadius: "50%", background: on ? C.green : C.ghost, transition: "left .15s" }} />
    </span>
  );
}

function GroupMeds({ meds }) {
  const [open, setOpen] = useState(false);
  const shown = open ? meds : meds.slice(0, 4);
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {shown.map(m => (
          <span key={medId(m)} style={{ fontSize: 12, color: C.dim, background: C.bg, border: `1px solid ${C.b2}`, borderRadius: 6, padding: "3px 8px" }}>
            {m.name}{m.dose ? ` ${m.dose}` : ""}
          </span>
        ))}
      </div>
      {meds.length > 4 && (
        <button onClick={() => setOpen(o => !o)} style={{ background: "none", border: "none", color: C.blue, fontSize: 12, fontFamily: mono, cursor: "pointer", padding: "6px 0 0" }}>
          {open ? "Show less" : `+${meds.length - 4} more`}
        </button>
      )}
    </div>
  );
}

function ExceptionForm({ groups, prn, onSave, onCancel }) {
  const allMeds = [...groups.flatMap(g => g.meds), ...prn];
  const [type, setType] = useState("skipped");
  const [mid, setMid] = useState(allMeds[0] ? medId(allMeds[0]) : "");
  const [note, setNote] = useState("");
  const chosen = allMeds.find(m => medId(m) === mid);

  return (
    <Card style={{ marginBottom: 12, border: `1px solid ${C.amber}40` }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 13, color: C.p, fontWeight: 600 }}>Flag an exception</div>
        <button onClick={onCancel} style={{ marginLeft: "auto", background: "none", border: "none", color: C.ghost, cursor: "pointer", fontSize: 18 }}>✕</button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {EXCEPTION_TYPES.map(t => (
          <button key={t.key} onClick={() => setType(t.key)}
            style={{ padding: "6px 10px", borderRadius: 6, border: `1.5px solid ${type === t.key ? C.amber : C.b2}`, background: type === t.key ? C.amber + "22" : "transparent", color: type === t.key ? C.amber : C.dim, fontSize: 12, fontFamily: mono, cursor: "pointer" }}>
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 12, color: C.dim, fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Which medication</div>
      <select value={mid} onChange={e => setMid(e.target.value)}
        style={{ width: "100%", background: C.bg, border: `1px solid ${C.b1}`, borderRadius: 6, padding: "8px 10px", color: C.p, fontSize: 12, marginBottom: 10, boxSizing: "border-box" }}>
        {allMeds.map(m => <option key={medId(m)} value={medId(m)}>{m.name}{m.dose ? ` ${m.dose}` : ""}</option>)}
      </select>
      <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)"
        style={{ width: "100%", background: C.bg, border: `1px solid ${C.b1}`, borderRadius: 6, padding: "8px 10px", color: C.p, fontSize: 12, marginBottom: 10, boxSizing: "border-box", outline: "none" }} />
      <Btn onClick={() => chosen && onSave({ group: "exception", medId: mid, medName: chosen.name, type, note })} color={C.amber} disabled={!chosen}>Save exception</Btn>
    </Card>
  );
}
