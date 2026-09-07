// ── Stage 4 & 5: Post-Visit AI Summary + Action Items. ────────────────────────
// Summary runs through the proxy from the transcript (preferred) or manual notes.
// Med changes are surfaced as items the patient must EXPLICITLY confirm — the app
// never edits the medication list on its own.
import { useState } from "react";
import { C, mono, Card, SL, Btn, Empty } from "../../companionUI.jsx";
import { summarizeVisit, toggleActionItem, confirmMedChange } from "../../../../lib/visitCapture.js";

export default function VisitSummary({ visit: initial, onClose }) {
  const [visit, setVisit] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const summarized = visit.status === "summarized" && visit.summary;
  const audioPendingTranscription = visit.hasAudio && !visit.transcript;

  async function generate() {
    setBusy(true); setErr("");
    try { setVisit(await summarizeVisit(visit)); }
    catch (e) { setErr(e.message || "Couldn’t generate the summary. Try again when you’re online."); }
    finally { setBusy(false); }
  }
  function toggle(id) { setVisit(toggleActionItem(visit.id, id)); }
  function confirmMed(id) { setVisit(confirmMedChange(visit.id, id)); }

  const s = visit.summary || {};

  return (
    <div style={{ overflowY: "auto", padding: 16 }}>
      {/* Saved confirmation */}
      <Card style={{ marginBottom: 12, border: `1px solid ${C.green}40` }}>
        <div style={{ fontSize: 12, color: C.green, fontFamily: mono }}>✓ Visit saved to your record</div>
        <div style={{ fontSize: 12, color: C.ghost, fontFamily: mono, marginTop: 3 }}>
          {visit.hasAudio ? "Audio captured · " : ""}{visit.durationSec ? `${Math.round(visit.durationSec / 60)} min · ` : ""}
          {visit.notes ? "notes saved" : visit.hasAudio ? "audio saved" : "no notes"} · syncs to Drive
        </div>
      </Card>

      {/* Transcription stub notice (audio path) */}
      {audioPendingTranscription && (
        <div style={{ background: "#0d1a28", border: `1px solid ${C.b1}`, borderRadius: 10, padding: "10px 12px", marginBottom: 12, fontSize: 12, color: C.dim, fontFamily: mono, lineHeight: 1.5 }}>
          🎧 Audio transcription isn’t wired up yet, so the AI summary below is built from your written notes. Full audio transcription is coming.
        </div>
      )}

      {!summarized ? (
        <>
          <Btn onClick={generate} disabled={busy}>{busy ? "Summarizing…" : "✦ Generate AI Summary"}</Btn>
          {err && <div style={{ fontSize: 12, color: C.red, fontFamily: mono, marginTop: 10 }}>{err}</div>}
          <div style={{ fontSize: 12, color: C.ghost, fontFamily: mono, marginTop: 10, lineHeight: 1.5 }}>
            You can do this later. The visit is already saved. Summarizing needs a connection.
          </div>
        </>
      ) : (
        <>
          {s.discussed && <Section title="Discussed"><div style={{ fontSize: 12, color: C.dim, lineHeight: 1.6 }}>{s.discussed}</div></Section>}

          {s.plan?.length > 0 && (
            <Section title="Plan">
              {s.plan.map((p, i) => <Bullet key={i} text={p} color={C.blue} />)}
            </Section>
          )}

          {s.whenToCall?.length > 0 && (
            <Card style={{ marginBottom: 12, border: `1px solid ${C.red}55`, background: "#1a0505" }}>
              <SL>⚠ When to Call</SL>
              {s.whenToCall.map((w, i) => <div key={i} style={{ fontSize: 13, color: "#fca5a5", lineHeight: 1.55, padding: "3px 0" }}>{w}</div>)}
            </Card>
          )}

          {s.stillOpen?.length > 0 && (
            <Section title="Still Open: Carried Forward">
              {s.stillOpen.map((q, i) => <Bullet key={i} text={q} color={C.amber} />)}
            </Section>
          )}

          {/* Action items */}
          <Card style={{ marginBottom: 12 }}>
            <SL>Action Items</SL>
            {(!visit.actionItems || visit.actionItems.length === 0) ? <Empty>No action items found.</Empty> : visit.actionItems.map(it => (
              <div key={it.id} style={{ padding: "8px 0", borderBottom: `1px solid ${C.b2}` }}>
                {it.kind === "med-change" ? (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: C.purple, fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.5px" }}>💊 Medication change</span>
                    </div>
                    <div style={{ fontSize: 13, color: C.p, fontWeight: 600 }}>{it.text}</div>
                    {it.med?.detail && <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{it.med.detail}</div>}
                    {it.confirmed
                      ? <div style={{ fontSize: 12, color: C.green, fontFamily: mono, marginTop: 6 }}>✓ Confirmed: medication list updated</div>
                      : <button onClick={() => confirmMed(it.id)} style={{ marginTop: 8, background: "rgba(167,139,250,.14)", border: `1px solid ${C.purple}55`, borderRadius: 8, padding: "8px 14px", color: C.purple, fontSize: 12, fontFamily: mono, fontWeight: 600, cursor: "pointer" }}>
                          Confirm this change
                        </button>}
                  </div>
                ) : (
                  <button onClick={() => toggle(it.id)} style={{ display: "flex", alignItems: "flex-start", gap: 10, width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}>
                    <div style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${it.done ? C.green : C.ghost}`, background: it.done ? C.green + "22" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                      {it.done && <span style={{ color: C.green, fontSize: 12 }}>✓</span>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: it.done ? C.ghost : C.p, textDecoration: it.done ? "line-through" : "none" }}>{it.text}</div>
                      {it.due && <div style={{ fontSize: 12, color: C.amber, fontFamily: mono, marginTop: 2 }}>Due {it.due}</div>}
                    </div>
                  </button>
                )}
              </div>
            ))}
          </Card>
        </>
      )}

      <div style={{ fontSize: 12, color: C.dim, fontFamily: mono, textAlign: "center", lineHeight: 1.6, margin: "8px 0 14px" }}>
        Mobile captured this visit. Open the web app for deeper review and editing.
      </div>
      <Btn onClick={onClose} color={C.blue}>Done</Btn>
    </div>
  );
}

function Section({ title, children }) {
  return <Card style={{ marginBottom: 12 }}><SL>{title}</SL>{children}</Card>;
}
function Bullet({ text, color }) {
  return (
    <div style={{ display: "flex", gap: 8, padding: "4px 0" }}>
      <span style={{ color, marginTop: 2 }}>•</span>
      <span style={{ fontSize: 12, color: C.dim, lineHeight: 1.55 }}>{text}</span>
    </div>
  );
}
