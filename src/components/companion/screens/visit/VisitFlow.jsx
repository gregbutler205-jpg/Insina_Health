// ── Doctor Visit Capture — five-stage flow orchestrator. ───────────────────────
// Pre-Visit Brief → Consent (cannot be skipped) → During → (processing) → Summary
// + Action Items. Capture works offline; transcription/summary defer to network.
import { useState, useEffect } from "react";
import { C, mono, serif, Card, SL, Btn, Prose, LEVEL_COLOR } from "../../companionUI.jsx";
import { safetyFlags, flagsForSpecialty, flaggedLabs, relDate, fmtShort, conditions, appointments, prepSig, getVisitPrep, saveVisitPrep } from "../../../../lib/companionData.js";
import { selectRelevantFlags, generateVisitPrep } from "../../../../lib/companionAI.js";
import { newVisit, getVisit, saveVisit } from "../../../../lib/visitCapture.js";
import { enqueue } from "../../../../lib/outbox.js";
// AUDIT_SEC_02 F-03: the prep brief renders via <Prose> (plain text, safe from
// XSS already) which bypasses renderAiText.js's shared filter — applied here
// explicitly, once, on the final generated text before it's stored/displayed.
import { scanForProhibitedDirectives } from "../../../../lib/aiOutputFilter.js";
import DuringVisit from "./DuringVisit.jsx";
import VisitSummary from "./VisitSummary.jsx";

export default function VisitFlow({ appt, visitId, onClose, queueSync }) {
  const [visit, setVisit] = useState(() => (visitId ? getVisit(visitId) : newVisit(appt)));
  const [stage, setStage] = useState(visitId ? "summary" : "prebrief");

  if (!visit) { return <div style={{ padding: 24, color: C.dim, fontFamily: mono }}>Visit not found. <button onClick={onClose} style={{ color: C.blue, background: "none", border: "none", cursor: "pointer" }}>Back</button></div>; }

  function chooseConsent(consent) {
    const v = { ...visit, consent, status: "recording" };
    setVisit(v); saveVisit(v); setStage("during");
  }
  function handleStop(data) {
    const v = { ...visit, ...data, status: "saved" };
    setVisit(v); saveVisit(v);
    if (v.hasAudio) enqueue("visit-audio", { visitId: v.id });
    queueSync?.();
    setStage("summary");
  }

  const head = (title) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: C.card, borderBottom: `1px solid ${C.b2}`, position: "sticky", top: 0, zIndex: 10 }}>
      <button onClick={onClose} style={{ background: "none", border: "none", color: C.blue, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
      <div style={{ fontFamily: serif, fontSize: 18, color: C.p, flex: 1 }}>{title}</div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {stage === "prebrief" && <>{head("Pre-Visit Brief")}<PreVisitBrief visit={visit} onStart={() => setStage("consent")} /></>}
      {stage === "consent"  && <>{head("Consent")}<Consent onChoose={chooseConsent} onBack={() => setStage("prebrief")} /></>}
      {stage === "during"   && <>{head("Recording Visit")}<DuringVisit visit={visit} onStop={handleStop} /></>}
      {stage === "summary"  && <>{head(visit.apptTitle)}<VisitSummary visit={visit} onClose={onClose} /></>}
    </div>
  );
}

// ── Stage 1: Pre-Visit Brief (read-only, from the record) ─────────────────────
function PreVisitBrief({ visit, onStart }) {
  const allFlags = safetyFlags();
  const labs = flaggedLabs();

  // Show only flags relevant to THIS visit. Start with the deterministic
  // specialty filter (instant, offline-safe); refine with AI when online.
  const ctx = `${visit.specialty || ""} ${visit.apptTitle || ""}`;
  const [shown, setShown] = useState(() => flagsForSpecialty(ctx, allFlags));
  const [showAll, setShowAll] = useState(false);
  const [refining, setRefining] = useState(navigator.onLine);

  useEffect(() => {
    if (!navigator.onLine) { setRefining(false); return; }
    let cancelled = false;
    selectRelevantFlags({ title: visit.apptTitle, provider: visit.provider, specialty: visit.specialty }, allFlags)
      .then(picked => { if (!cancelled) setShown(picked); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setRefining(false); });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const flags = showAll ? allFlags : shown;
  const hiddenCount = allFlags.length - shown.length;
  // "What's changed" — recent active conditions as review items
  const recentConditions = conditions().filter(c => c.status === "active" && c.since && new Date(c.since) > new Date(Date.now() - 365 * 86400000));

  // ── Shared consultation prep: read it if either app already generated it for
  // this appointment (synced via Drive); otherwise generate + save here. ───────
  const appt = appointments().find(a => String(a.id) === String(visit.apptId)) ||
    { id: visit.apptId, title: visit.apptTitle, provider: visit.provider, specialty: visit.specialty, date: visit.date };
  const sig = prepSig(appt);
  const prepKey = visit.apptId || sig;
  const [prep, setPrep] = useState(() => { const s = getVisitPrep(prepKey); return s && s.sig === sig ? s.text : ""; });
  const [prepLoading, setPrepLoading] = useState(false);
  const [prepErr, setPrepErr] = useState("");

  const runPrep = () => {
    setPrepLoading(true); setPrepErr("");
    generateVisitPrep(appt)
      .then(text => {
        const { redactedText } = scanForProhibitedDirectives(text);
        setPrep(redactedText); saveVisitPrep(prepKey, { text: redactedText, sig });
      })
      .catch(e => {
        const net = /failed to fetch|networkerror|load failed/i.test(e.message || "");
        setPrepErr(net ? "Couldn’t reach the AI server. Check your connection and try again." : (e.message || "Couldn’t generate prep. Try again when online."));
      })
      .finally(() => setPrepLoading(false));
  };

  // Auto-generate on first open when nothing is cached and we're online.
  useEffect(() => {
    if (!prep && navigator.onLine) runPrep();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Offline + nothing cached → a few record-grounded questions so it's not empty.
  const fallbackQuestions = [
    ...labs.slice(0, 3).map(l => `Ask about your ${l.name} (${l.value}${l.unit ? " " + l.unit : ""}).`),
    "Any interactions among my current medications I should watch?",
  ].slice(0, 4);

  return (
    <div style={{ overflowY: "auto", padding: 16 }}>
      <Card style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 15, color: C.p, fontWeight: 600 }}>{visit.apptTitle}</div>
        <div style={{ fontSize: 12, color: C.s, fontFamily: mono, marginTop: 3 }}>
          {visit.provider || "–"}{visit.date ? ` · ${relDate(visit.date)} · ${fmtShort(visit.date)}` : ""}
        </div>
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <SL mb={0}>Safety Flags For This Visit</SL>
          {refining && <span style={{ marginLeft: "auto", fontSize: 12, color: C.ghost, fontFamily: mono }}>✦ tailoring…</span>}
        </div>
        {flags.length === 0 ? <div style={{ fontSize: 12, color: C.ghost, fontFamily: mono }}>None on file.</div> : flags.map((f, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "5px 0" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: LEVEL_COLOR[f.level], marginTop: 5, flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.45 }}>{f.text}</div>
          </div>
        ))}
        {hiddenCount > 0 && (
          <button onClick={() => setShowAll(s => !s)} style={{ background: "none", border: "none", color: C.blue, fontSize: 12, fontFamily: mono, cursor: "pointer", padding: "8px 0 0" }}>
            {showAll ? "Show only relevant" : `Show all flags (+${hiddenCount})`}
          </button>
        )}
      </Card>

      {recentConditions.length > 0 && (
        <Card style={{ marginBottom: 12 }}>
          <SL>What’s Changed Recently</SL>
          {recentConditions.map((c, i) => (
            <div key={i} style={{ fontSize: 12, color: C.dim, padding: "4px 0" }}>New: {c.name}{c.since ? ` (since ${c.since})` : ""}</div>
          ))}
        </Card>
      )}

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <SL mb={0}>Consultation Prep</SL>
          {prep && !prepLoading && (
            <button onClick={runPrep} style={{ marginLeft: "auto", background: "none", border: "none", color: C.blue, fontSize: 12, fontFamily: mono, cursor: "pointer" }}>↻ Regenerate</button>
          )}
        </div>
        {prepLoading ? (
          <div style={{ fontSize: 12, color: C.ghost, fontFamily: mono }}>✦ Preparing for this visit…</div>
        ) : prep ? (
          <Prose text={prep} />
        ) : (
          <>
            {prepErr && <div style={{ fontSize: 12, color: C.amber, fontFamily: mono, marginBottom: 8 }}>{prepErr}</div>}
            <div style={{ fontSize: 12, color: C.dim, marginBottom: 8 }}>
              {navigator.onLine ? "Tailored prep will appear here." : "You’re offline. Here are a few questions from your record. Tailored prep generates when you’re back online."}
            </div>
            {fallbackQuestions.map((q, i) => (
              <div key={i} style={{ display: "flex", gap: 8, padding: "4px 0", fontSize: 12, color: C.dim }}>
                <span style={{ color: C.blue, fontFamily: mono }}>{i + 1}.</span><span style={{ lineHeight: 1.45 }}>{q}</span>
              </div>
            ))}
            {navigator.onLine && <button onClick={runPrep} style={{ background: "none", border: "none", color: C.blue, fontSize: 12, fontFamily: mono, cursor: "pointer", padding: "8px 0 0" }}>✦ Generate prep</button>}
          </>
        )}
      </Card>

      <Btn onClick={onStart}>Start Visit Capture →</Btn>
    </div>
  );
}

// ── Stage 2: Consent (cannot be skipped) ──────────────────────────────────────
function Consent({ onChoose, onBack }) {
  return (
    <div style={{ overflowY: "auto", padding: 16 }}>
      <div style={{ background: "#1c1200", border: `1px solid ${C.amber}40`, borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: C.amber, fontFamily: mono, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>⚠ Always ask first</div>
        <div style={{ fontSize: 12, color: "#fcd34d", lineHeight: 1.55 }}>
          Recording laws vary by state. Your care spans <b>Mississippi</b> and <b>Louisiana</b>, which have different consent rules. Ask the doctor’s permission before recording.
        </div>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <SL>A script you can read aloud</SL>
        <div style={{ fontSize: 13, color: C.p, lineHeight: 1.65, fontStyle: "italic" }}>
          “Would it be okay if I record our conversation? It’s just for my own personal health records so I can remember everything we discuss.”
        </div>
      </Card>

      <SL>What did the doctor say?</SL>
      <Btn onClick={() => onChoose("agreed")} color={C.green} style={{ marginBottom: 8 }}>✓ Doctor agreed: record audio</Btn>
      <Btn onClick={() => onChoose("declined")} color={C.amber} style={{ marginBottom: 8 }}>Doctor declined: manual notes only</Btn>
      <Btn onClick={() => onChoose("skipped")} color={C.dim} style={{ marginBottom: 16 }}>Skip recording: manual notes only</Btn>

      <button onClick={onBack} style={{ width: "100%", background: "none", border: "none", color: C.ghost, fontSize: 12, fontFamily: mono, cursor: "pointer" }}>← Back to brief</button>
    </div>
  );
}
