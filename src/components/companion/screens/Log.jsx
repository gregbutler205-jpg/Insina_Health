// ── Log — fast structured capture (Vitals, Symptoms) + Quick Log (natural lang). ─
import { formatDateUS } from "../../../lib/displaySafe.js";
// Structured tap-driven entry is the primary path (Insina is episodic, not a
// daily logger). Quick Log is the convenience shortcut, not the front door.
import { useState } from "react";
import { tombstoneRecord } from "../../../lib/recordTombstones.js";
import { C, mono, sans, Card, SL, Btn, Empty, Pill } from "../companionUI.jsx";
import { rls, wls, uid, toISO, readings, latestWith, recentAverage, activeMeds } from "../../../lib/companionData.js";
import { mkReading, saveReading, defaultVitalFlag } from "../../../lib/vitals.js";
import { checkVitalReading, checkVitalCrossFields } from "../../../lib/plausibility.js";
import { askInsinaJSON } from "../../../lib/companionAI.js";
import MicButton from "../MicButton.jsx";

// A-12: run the plausibility guard on a candidate reading before it's ever
// written — same deterministic check as the desktop Vitals tab, distinct
// from the tripwire (A-01). Returns { hardIssues, softFieldIssues,
// crossFieldIssues } (all empty arrays if the reading is plausible).
function evaluatePlausibility(reading) {
  const fieldIssues = checkVitalReading(reading);
  const crossFieldIssues = checkVitalCrossFields(reading);
  const hardIssues = Object.entries(fieldIssues).filter(([, v]) => v.band === "hard");
  const softFieldIssues = Object.entries(fieldIssues).filter(([, v]) => v.band === "soft");
  return { hardIssues, softFieldIssues, crossFieldIssues };
}
function isClean({ hardIssues, softFieldIssues, crossFieldIssues }) {
  return hardIssues.length === 0 && softFieldIssues.length === 0 && crossFieldIssues.length === 0;
}

// ── Plausibility gate card — hard band blocks with suggestion buttons
// (nothing auto-corrects); soft band + cross-field issues confirm-and-save
// in one tap. DEC-019. ────────────────────────────────────────────────────
function PlausibilityGateCard({ pending, onConfirm, onSuggestion, onCancel }) {
  const { reading, hardIssues, softFieldIssues, crossFieldIssues } = pending;
  const hasHard = hardIssues.length > 0;
  return (
    <Card style={{ marginBottom: 16, border: `1px solid ${hasHard ? C.red : C.amber}40` }}>
      <div style={{ fontSize: 12, letterSpacing: "1.5px", textTransform: "uppercase", color: hasHard ? C.red : C.amber, fontFamily: mono, marginBottom: 8 }}>
        {hasHard ? "Check this value" : "Unusual value"}
      </div>
      {hardIssues.map(([field, issue]) => (
        <div key={field} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: C.p, marginBottom: 6, lineHeight: 1.5 }}>
            {issue.label}: <strong>{reading[field]}</strong> {issue.unit} is outside a plausible range.
          </div>
          {issue.suggestions.length > 0 ? (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {issue.suggestions.map(s => (
                <button key={s} onClick={() => onSuggestion(field, s)}
                  style={{ padding: "6px 10px", background: "rgba(79,142,247,.1)", border: `1px solid ${C.blue}40`, borderRadius: 8, color: C.blue, fontSize: 12, fontFamily: mono, cursor: "pointer" }}>
                  Use {s} {issue.unit}?
                </button>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: C.ghost }}>No suggested correction. Edit the value manually.</div>
          )}
        </div>
      ))}
      {softFieldIssues.map(([field, issue]) => (
        <div key={field} style={{ fontSize: 12, color: C.p, marginBottom: 8, lineHeight: 1.5 }}>
          {issue.label}: <strong>{reading[field]}</strong> {issue.unit} is far from your typical range.
        </div>
      ))}
      {crossFieldIssues.map((issue, i) => (
        <div key={i} style={{ fontSize: 12, color: C.p, marginBottom: 8, lineHeight: 1.5 }}>{issue.message}</div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        {!hasHard && <Btn onClick={onConfirm} color={C.green}>Save Anyway</Btn>}
        <Btn onClick={onCancel} color={C.ghost}>{hasHard ? "Edit Manually" : "Cancel"}</Btn>
      </div>
    </Card>
  );
}

const SUBTABS = [
  { key: "vitals",   label: "Vitals" },
  { key: "symptoms", label: "Symptoms" },
  { key: "quick",    label: "Quick Log" },
];

export default function Log({ queueSync, initialTab = "vitals", askAI }) {
  const [sub, setSub] = useState(SUBTABS.some(s => s.key === initialTab) ? initialTab : "vitals");
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div style={{ display: "flex", gap: 6, padding: "12px 16px 0" }}>
        {SUBTABS.map(s => (
          <button key={s.key} onClick={() => setSub(s.key)}
            style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `1px solid ${sub === s.key ? C.blue : C.b2}`, background: sub === s.key ? "rgba(79,142,247,.12)" : "transparent", color: sub === s.key ? C.blue : C.dim, fontSize: 12, fontFamily: mono, cursor: "pointer" }}>
            {s.label}
          </button>
        ))}
      </div>
      <div style={{ padding: 16 }}>
        {sub === "vitals"   && <Vitals queueSync={queueSync} />}
        {sub === "symptoms" && <Symptoms queueSync={queueSync} askAI={askAI} />}
        {sub === "quick"    && <QuickLog queueSync={queueSync} onDone={setSub} />}
      </div>
    </div>
  );
}

// Build the prompt sent to AI when asking about a logged symptom.
function symptomPrompt(e) {
  const sev = e.severity ? `, ${String(e.severity).toLowerCase()} severity` : "";
  return `I've been experiencing ${e.name}${sev}.${e.notes ? ` Notes: ${e.notes}.` : ""} Please cross-reference this symptom with my current labs, vitals, and medications to identify possible causes and what I should discuss with my care team.`;
}
const askBtn = { background: "rgba(79,142,247,.12)", border: "1px solid rgba(79,142,247,.3)", borderRadius: 8, padding: "6px 11px", color: C.blue, fontSize: 12, fontFamily: mono, cursor: "pointer", whiteSpace: "nowrap" };

// ── Vitals ────────────────────────────────────────────────────────────────────
const VITAL_FIELDS = [
  { key: "bp_s",       label: "Systolic",    ph: "120",  store: "bp_s" },
  { key: "bp_d",       label: "Diastolic",   ph: "80",   store: "bp_d" },
  { key: "hr",         label: "Heart Rate",  ph: "72",   store: "hr" },
  { key: "resting_hr", label: "Resting HR",  ph: "62",   store: "resting_hr" },
  { key: "o2",         label: "Oxygen %",    ph: "97",   store: "o2" },
  { key: "weight",     label: "Weight (lb)", ph: "192",  store: "weight" },
  { key: "temp",       label: "Temp (°F)",   ph: "98.6", store: "temp" },
  { key: "glucose",    label: "Glucose",     ph: "95",   store: "glucose" },
  { key: "sleep",      label: "Sleep (hrs)", ph: "7.5",  store: "sleep" },
];
const BLANK_V = Object.fromEntries(VITAL_FIELDS.map(f => [f.key, ""]));

function Vitals({ queueSync }) {
  const [form, setForm] = useState(BLANK_V);
  const [date, setDate] = useState(toISO());   // reading's own date — editable, defaults to today
  const [saved, setSaved] = useState(false);
  // A-12: pending plausibility gate — { reading, hardIssues, softFieldIssues, crossFieldIssues } | null.
  const [pending, setPending] = useState(null);
  const recent = readings();

  const prevBP = latestWith("bp_s");
  const avgSys = recentAverage("bp_s");

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function commit(reading) {
    saveReading(reading);
    setForm(BLANK_V); setDate(toISO()); setSaved(true); setTimeout(() => setSaved(false), 2500);
    queueSync?.();
  }

  function attemptSave(reading) {
    const result = evaluatePlausibility(reading);
    if (isClean(result)) { commit(reading); return; }
    setPending({ reading, ...result });
  }

  function save() {
    if (!Object.values(form).some(v => v !== "")) return;
    attemptSave(mkReading({ date, source: "companion", ...form }));
  }

  function applySuggestion(field, value) {
    if (!pending) return;
    const updated = { ...pending.reading, [field]: value };
    updated.flag = defaultVitalFlag(updated); // corrected value must not keep the typo's stale flag
    setPending(null);
    attemptSave(updated);
  }

  return (
    <div>
      {saved && <Card style={{ marginBottom: 12, border: `1px solid ${C.green}40` }}><span style={{ fontSize: 12, color: C.green, fontFamily: mono }}>✓ Reading saved: will sync to Drive</span></Card>}

      {(prevBP || avgSys) && (
        <div style={{ fontSize: 12, color: C.ghost, fontFamily: mono, marginBottom: 10 }}>
          {prevBP && `Previous BP ${prevBP.bp_s}/${prevBP.bp_d}`}{prevBP && avgSys ? "  ·  " : ""}{avgSys && `recent avg systolic ${avgSys}`}
        </div>
      )}

      {pending && (
        <PlausibilityGateCard
          pending={pending}
          onConfirm={() => { commit(pending.reading); setPending(null); }}
          onSuggestion={applySuggestion}
          onCancel={() => setPending(null)}
        />
      )}

      {!pending && (
        <Card style={{ marginBottom: 16 }}>
          <SL>New Reading</SL>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: C.dim, fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3 }}>Date</div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              style={{ width: "100%", background: C.bg, border: `1px solid ${C.b1}`, borderRadius: 6, padding: "9px 10px", color: C.p, fontSize: 14, fontFamily: mono, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            {VITAL_FIELDS.map(f => (
              <div key={f.key}>
                <div style={{ fontSize: 12, color: C.dim, fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3 }}>{f.label}</div>
                <input type="number" inputMode="decimal" value={form[f.key]} placeholder={f.ph} onChange={e => set(f.key, e.target.value)}
                  style={{ width: "100%", background: C.bg, border: `1px solid ${C.b1}`, borderRadius: 6, padding: "9px 10px", color: C.p, fontSize: 14, fontFamily: mono, outline: "none", boxSizing: "border-box" }} />
              </div>
            ))}
          </div>
          <Btn onClick={save} color={C.green}>Save Reading</Btn>
        </Card>
      )}

      <SL>Recent Readings</SL>
      {recent.length === 0 ? <Empty>No readings recorded yet.</Empty> : recent.slice(0, 12).map(r => (
        <div key={r.id || r.ts} style={{ background: C.card, border: `1px solid ${C.b2}`, borderRadius: 10, padding: "10px 14px", marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 12, color: C.ghost, fontFamily: mono }}>{formatDateUS(r.date)}</span>
            {r.source === "companion" && <span style={{ fontSize: 12, color: C.blue, fontFamily: mono }}>📱 companion</span>}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
            {r.bp_s && r.bp_d && <Stat label="BP" val={`${r.bp_s}/${r.bp_d}`} color={C.blue} />}
            {r.weight != null && <Stat label="Wt" val={`${r.weight} lb`} color={C.green} />}
            {r.spo2 != null && <Stat label="SpO₂" val={`${r.spo2}%`} color={C.purple} />}
            {r.hr != null && <Stat label="HR" val={`${r.hr}`} color={C.amber} />}
            {r.resting_hr != null && <Stat label="RHR" val={`${r.resting_hr}`} color={C.amber} />}
            {r.temp != null && <Stat label="Temp" val={`${r.temp}°`} color={C.dim} />}
            {r.glucose != null && <Stat label="Glu" val={`${r.glucose}`} color={C.green} />}
            {r.sleep != null && <Stat label="Sleep" val={`${r.sleep}h`} color={C.blue} />}
          </div>
        </div>
      ))}
    </div>
  );
}
function Stat({ label, val, color }) {
  return <div><div style={{ fontSize: 12, color: C.ghost, fontFamily: mono }}>{label}</div><div style={{ fontSize: 13, fontWeight: 700, color }}>{val}</div></div>;
}

// ── Symptoms ──────────────────────────────────────────────────────────────────
const COMMON = ["Fatigue", "Headache", "Nausea", "Fever", "Swelling", "Rash", "Dizziness", "Shortness of breath", "Pain", "Cough", "Diarrhea", "Chills"];
const SEV = ["Mild", "Moderate", "Severe"];
const sevColor = s => s === "Severe" ? C.red : s === "Moderate" ? C.amber : C.green;

function Symptoms({ queueSync, askAI }) {
  const [entries, setEntries] = useState(() => rls("mi_symptoms", []));
  const [name, setName] = useState("");
  const [severity, setSeverity] = useState("Moderate");
  const [trigger, setTrigger] = useState("");
  const [note, setNote] = useState("");
  const [savedEntry, setSavedEntry] = useState(null);

  function save() {
    if (!name.trim()) return;
    const notes = [note.trim(), trigger.trim() ? `Possible trigger: ${trigger.trim()}` : ""].filter(Boolean).join(" · ");
    const entry = { id: uid(), name: name.trim(), severity, date: toISO(), notes, source: "companion" };
    const updated = [entry, ...entries];
    setEntries(updated); wls("mi_symptoms", updated);
    setName(""); setTrigger(""); setNote(""); setSeverity("Moderate");
    setSavedEntry(entry);
    setTimeout(() => setSavedEntry(c => (c?.id === entry.id ? null : c)), 8000);
    queueSync?.();
  }
  function remove(id) {
    tombstoneRecord("mi_symptoms", entries.find(e => e.id === id));
    const u = entries.filter(e => e.id !== id); setEntries(u); wls("mi_symptoms", u); queueSync?.();
  }

  return (
    <div>
      {savedEntry && (
        <Card style={{ marginBottom: 12, border: `1px solid ${C.green}40` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: C.green, fontFamily: mono, flex: 1, minWidth: 130 }}>✓ {savedEntry.name} saved: will sync to Drive</span>
            {askAI && <button onClick={() => askAI(symptomPrompt(savedEntry), "symptomPrep")} style={askBtn}>✦ Ask Insina about this</button>}
          </div>
        </Card>
      )}
      <Card style={{ marginBottom: 16 }}>
        <SL>What are you feeling?</SL>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {COMMON.map(s => (
            <button key={s} onClick={() => setName(s)}
              style={{ padding: "6px 10px", borderRadius: 16, border: `1px solid ${name === s ? C.blue : C.b2}`, background: name === s ? "rgba(79,142,247,.12)" : "transparent", color: name === s ? C.blue : C.dim, fontSize: 12, cursor: "pointer" }}>
              {s}
            </button>
          ))}
        </div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Or type a symptom"
          style={{ width: "100%", background: C.bg, border: `1px solid ${C.b1}`, borderRadius: 6, padding: "9px 10px", color: C.p, fontSize: 13, outline: "none", marginBottom: 10, boxSizing: "border-box" }} />
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {SEV.map(s => (
            <button key={s} onClick={() => setSeverity(s)}
              style={{ flex: 1, padding: "8px 0", borderRadius: 6, border: `1.5px solid ${severity === s ? sevColor(s) : C.b2}`, background: severity === s ? sevColor(s) + "22" : "transparent", color: severity === s ? sevColor(s) : C.ghost, fontSize: 12, fontFamily: mono, cursor: "pointer" }}>
              {s}
            </button>
          ))}
        </div>
        <input value={trigger} onChange={e => setTrigger(e.target.value)} placeholder="Possible trigger (optional)"
          style={{ width: "100%", background: C.bg, border: `1px solid ${C.b1}`, borderRadius: 6, padding: "9px 10px", color: C.p, fontSize: 12, outline: "none", marginBottom: 8, boxSizing: "border-box" }} />
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)"
          style={{ width: "100%", background: C.bg, border: `1px solid ${C.b1}`, borderRadius: 6, padding: "9px 10px", color: C.p, fontSize: 12, outline: "none", marginBottom: 10, boxSizing: "border-box" }} />
        <Btn onClick={save} color={C.green} disabled={!name.trim()}>Save Symptom</Btn>
      </Card>

      <SL>Recent Symptoms</SL>
      {entries.length === 0 ? <Empty>No symptoms logged.</Empty> : entries.slice(0, 20).map(e => (
        <div key={e.id} style={{ background: C.card, border: `1px solid ${C.b2}`, borderRadius: 10, padding: "10px 14px", marginBottom: 8, display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: C.p, fontWeight: 600 }}>{e.name}</span>
              <Pill color={sevColor(e.severity)}>{e.severity}</Pill>
            </div>
            <div style={{ fontSize: 12, color: C.ghost, fontFamily: mono, marginTop: 2 }}>{formatDateUS(e.date)}</div>
            {e.notes && <div style={{ fontSize: 12, color: C.dim, marginTop: 3 }}>{e.notes}</div>}
            {askAI && <button onClick={() => askAI(symptomPrompt(e), "symptomPrep")} style={{ ...askBtn, marginTop: 8 }}>✦ Ask Insina about this</button>}
          </div>
          <button onClick={() => remove(e.id)} style={{ background: "none", border: "none", color: C.ghost, cursor: "pointer", fontSize: 14, alignSelf: "flex-start" }}>✕</button>
        </div>
      ))}
    </div>
  );
}

// ── Quick Log / Talk to Insina (secondary, low-friction path) ──────────────────
// Patient says it in plain language; AI proposes a structured draft; patient
// confirms before anything is filed. AI proposes; the patient disposes.
function QuickLog({ queueSync, onDone }) {
  const [text, setText] = useState("");
  const [draft, setDraft] = useState(null);
  // UI-4: the reading date Quick Log will file a vital draft under, shown
  // and editable before saving — defaults to today, not silently assumed.
  const [draftDate, setDraftDate] = useState(toISO());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // A-12: pending plausibility gate for the vital branch — same guard as the
  // structured Vitals tab, distinct from the tripwire (A-01). DEC-019.
  const [pending, setPending] = useState(null);

  async function interpret() {
    const t = text.trim();
    if (!t) return;
    setBusy(true); setError(""); setDraft(null);
    try {
      const meds = activeMeds().map(m => m.name).join(", ") || "none on file";
      const data = await askInsinaJSON({
        system: `You convert a patient's plain-language health note into ONE structured entry. Decide the kind and return a JSON object of this shape:
{"kind":"vital"|"symptom"|"medication","summary":"one short human sentence of what will be filed","vital":{"bp_s":number,"bp_d":number,"hr":number,"resting_hr":number,"o2":number,"weight":number,"temp":number,"glucose":number,"sleep":number},"symptom":{"name":string,"severity":"Mild"|"Moderate"|"Severe","notes":string},"medication":{"name":string,"type":"skipped"|"late"|"reaction"|"prn","note":string}}
Include only the sub-object matching "kind"; omit any numeric field you don't know. For medication entries, match the name to the patient's current medications when possible: ${meds}.`,
        messages: [{ role: "user", content: t }],
      });
      setDraft(data);
      setDraftDate(toISO());
    } catch (e) { setError(e.message || "Couldn’t interpret that. Try the Vitals or Symptoms tab."); }
    finally { setBusy(false); }
  }

  function commitVital(reading) {
    saveReading(reading);
    setDraft(null); setText(""); setPending(null); queueSync?.();
    onDone?.("vitals");
  }

  function attemptSaveVital(reading) {
    const result = evaluatePlausibility(reading);
    if (isClean(result)) { commitVital(reading); return; }
    setPending({ reading, ...result });
  }

  function applySuggestion(field, value) {
    if (!pending) return;
    const updated = { ...pending.reading, [field]: value };
    updated.flag = defaultVitalFlag(updated); // corrected value must not keep the typo's stale flag
    setPending(null);
    attemptSaveVital(updated);
  }

  function confirm() {
    if (!draft) return;
    if (draft.kind === "vital" && draft.vital) {
      attemptSaveVital(mkReading({ date: draftDate, source: "companion", ...draft.vital }));
      return;
    }
    if (draft.kind === "symptom" && draft.symptom) {
      const s = { id: uid(), name: draft.symptom.name || "Symptom", severity: draft.symptom.severity || "Moderate", date: toISO(), notes: draft.symptom.notes || "", source: "companion" };
      wls("mi_symptoms", [s, ...rls("mi_symptoms", [])]);
    } else if (draft.kind === "medication" && draft.medication) {
      const m = draft.medication;
      const e = { id: uid(), date: toISO(), ts: new Date().toISOString(), group: "quicklog", medId: m.name, medName: m.name || "Medication", type: m.type || "skipped", note: m.note || "" };
      wls("mi_med_exceptions", [e, ...rls("mi_med_exceptions", [])]);
    }
    setDraft(null); setText(""); queueSync?.();
    onDone?.(draft.kind === "symptom" ? "symptoms" : "vitals");
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.6, marginBottom: 12 }}>
        Say what happened in plain language, e.g. <span style={{ color: C.s }}>“skipped my evening dose, felt nauseous”</span> or <span style={{ color: C.s }}>“BP was 138 over 84 this morning.”</span> Insina drafts an entry; you confirm before it’s filed.
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={3} placeholder="Tell or dictate to Insina what happened…"
          style={{ flex: 1, minWidth: 0, background: C.bg, border: `1px solid ${C.b1}`, borderRadius: 10, padding: "10px 12px", color: C.p, fontSize: 13, fontFamily: sans, outline: "none", boxSizing: "border-box", resize: "vertical" }} />
        <MicButton onText={t => setText(prev => (prev ? prev + " " : "") + t)} />
      </div>
      <Btn onClick={interpret} disabled={busy || !text.trim()}>{busy ? "Interpreting…" : "Interpret"}</Btn>
      {error && <div style={{ fontSize: 12, color: C.red, fontFamily: mono, marginTop: 10 }}>{error}</div>}

      {pending && (
        <PlausibilityGateCard
          pending={pending}
          onConfirm={() => commitVital(pending.reading)}
          onSuggestion={applySuggestion}
          onCancel={() => setPending(null)}
        />
      )}

      {!pending && draft && (
        <Card style={{ marginTop: 14, border: `1px solid ${C.blue}40` }}>
          <SL>Insina suggests filing</SL>
          <div style={{ fontSize: 13, color: C.p, marginBottom: 4 }}>{draft.summary || `${draft.kind} entry`}</div>
          <Pill color={C.blue}>{draft.kind}</Pill>
          {draft.kind === "vital" && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: C.dim, fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Reading Date</div>
              <input type="date" value={draftDate} onChange={e => setDraftDate(e.target.value)}
                style={{ padding: "7px 10px", background: C.bg, border: `1px solid ${C.b1}`, borderRadius: 6, color: C.p, fontSize: 12, fontFamily: mono, outline: "none" }} />
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Btn onClick={confirm} color={C.green}>Confirm & file</Btn>
            <Btn onClick={() => setDraft(null)} color={C.ghost}>Discard</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}
