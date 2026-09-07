// ── Stage 3: During the Visit — deliberately almost empty. ─────────────────────
// Record / pause / stop + timer, an OPTIONAL note, an OPTIONAL "mark moment".
// No category-tag buttons — categorization is the AI's job afterward.
import { useState, useRef, useEffect, useCallback } from "react";
import { C, mono, Btn } from "../../companionUI.jsx";
import { putAudio } from "../../../../lib/visitCapture.js";

const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export default function DuringVisit({ visit, onStop }) {
  const wantsAudio = visit.consent === "agreed";
  const [phase, setPhase] = useState("idle");   // idle → live → finishing
  const [sec, setSec] = useState(0);
  const [paused, setPaused] = useState(false);
  const [note, setNote] = useState(visit.notes || "");
  const [markers, setMarkers] = useState([]);
  const [err, setErr] = useState("");
  const [audioFailed, setAudioFailed] = useState(false);

  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const blobRef = useRef(null);

  // Timer ticks while live and not paused
  useEffect(() => {
    if (phase !== "live" || paused) return;
    const id = setInterval(() => setSec(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase, paused]);

  async function start() {
    setErr("");
    if (!wantsAudio) { setPhase("live"); return; }  // manual-notes mode: timer only
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.("audio/webm")) ? "audio/webm" : "";
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data?.size) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        blobRef.current = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      mediaRef.current = mr;
      setPhase("live");
    } catch {
      setAudioFailed(true);
      setErr("Microphone unavailable: continuing with manual notes. You can still capture the visit.");
      setPhase("live");
    }
  }

  function togglePause() {
    const mr = mediaRef.current;
    if (mr && mr.state !== "inactive") { paused ? mr.resume() : mr.pause(); }
    setPaused(p => !p);
  }
  function markMoment() { setMarkers(m => [...m, sec]); }

  const finalize = useCallback(async () => {
    let hasAudio = false, audioMime = "";
    if (blobRef.current && blobRef.current.size) {
      try { await putAudio(visit.id, blobRef.current); hasAudio = true; audioMime = blobRef.current.type; } catch { /* keep going — record still saves */ }
    }
    onStop({ durationSec: sec, markers, notes: note, hasAudio, audioMime });
  }, [onStop, sec, markers, note, visit.id]);

  async function stop() {
    setPhase("finishing");
    const mr = mediaRef.current;
    if (mr && mr.state !== "inactive") {
      mr.onstop = async () => {
        blobRef.current = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        mr.stream?.getTracks?.().forEach(t => t.stop());
        await finalize();
      };
      mr.stop();
    } else {
      await finalize();
    }
  }

  const recordingLive = phase === "live" && wantsAudio && !audioFailed;

  return (
    <div style={{ overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", flex: 1 }}>
      {/* Status / timer */}
      <div style={{ textAlign: "center", padding: "24px 0 16px" }}>
        <div style={{ fontSize: 12, color: C.ghost, fontFamily: mono, marginBottom: 8 }}>
          {phase === "idle" ? (wantsAudio ? "Ready to record" : "Manual notes. No audio")
            : recordingLive ? (paused ? "Paused" : "● Recording") : "Capturing notes"}
        </div>
        <div style={{ fontSize: 44, fontFamily: mono, color: recordingLive && !paused ? C.red : C.p, letterSpacing: "2px" }}>{fmt(sec)}</div>
        {markers.length > 0 && <div style={{ fontSize: 12, color: C.blue, fontFamily: mono, marginTop: 6 }}>📌 {markers.length} marked moment{markers.length > 1 ? "s" : ""}</div>}
      </div>

      {err && <div style={{ fontSize: 12, color: C.amber, fontFamily: mono, textAlign: "center", marginBottom: 12, lineHeight: 1.5 }}>{err}</div>}

      {/* Primary controls */}
      {phase === "idle" ? (
        <button onClick={start} style={{ alignSelf: "center", width: 96, height: 96, borderRadius: "50%", background: "rgba(239,68,68,.12)", border: `2px solid ${C.red}`, color: C.red, fontSize: 13, fontFamily: mono, fontWeight: 700, cursor: "pointer", marginBottom: 20 }}>
          {wantsAudio ? "● REC" : "START"}
        </button>
      ) : (
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          {recordingLive && <Btn onClick={togglePause} color={C.amber}>{paused ? "Resume" : "Pause"}</Btn>}
          <Btn onClick={stop} color={C.red} disabled={phase === "finishing"}>{phase === "finishing" ? "Saving…" : "■ Stop & Save"}</Btn>
        </div>
      )}

      {/* Optional mark-moment (only while live with audio) */}
      {recordingLive && (
        <button onClick={markMoment} style={{ width: "100%", padding: 12, background: "rgba(79,142,247,.1)", border: `1px dashed ${C.blue}55`, borderRadius: 10, color: C.blue, fontSize: 12, fontFamily: mono, cursor: "pointer", marginBottom: 16 }}>
          📌 Mark important moment
        </button>
      )}

      {/* Optional note — never required, never prompted */}
      {phase !== "idle" && (
        <div>
          <div style={{ fontSize: 12, color: C.dim, fontFamily: mono, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
            Note (optional)
          </div>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={4} placeholder={wantsAudio ? "Jot a word if you like. Not required." : "Type what you want to remember from this visit."}
            style={{ width: "100%", background: C.bg, border: `1px solid ${C.b1}`, borderRadius: 10, padding: "10px 12px", color: C.p, fontSize: 13, outline: "none", boxSizing: "border-box", resize: "vertical" }} />
        </div>
      )}

      <div style={{ flex: 1 }} />
      <div style={{ fontSize: 12, color: C.ghost, fontFamily: mono, textAlign: "center", paddingTop: 16 }}>
        Set the phone down. The summary is built afterward, from {wantsAudio ? "the recording" : "your notes"}.
      </div>
    </div>
  );
}
