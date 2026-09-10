// ── DEC-046: "include in appointment prep" picker ────────────────────────────
// One control, two homes: AnalysisOverlay (right after a report is saved — the
// moment Greg described: "when I have the AI report generated, I mark it") and
// Tab10 My Notes (mark or retarget any AI report after the fact).
//
// Care-team members the report mentions are PRE-CHECKED via the deterministic
// text scan in prepMarks.suggestPrepTargets — but nothing persists until the
// patient presses Mark. Suggestions propose; the patient disposes.
import { useMemo, useState } from "react";
import {
  getPrepTargets, setPrepTargets, suggestPrepTargets, targetFor,
} from "../lib/prepMarks.js";

const memberKey = m => String(m?.id ?? m?.name ?? "");

/**
 * `persist` (optional) overrides how the chosen targets are written. Default
 * is prepMarks.setPrepTargets (straight to storage) — right for the overlay.
 * Tab10 passes its own: it keeps the notes array in React state and rewrites
 * the WHOLE array on every edit, so a direct storage write here would be
 * silently clobbered by its next keystroke. Routing through Tab10's
 * updateNote keeps its state and storage in step.
 */
export default function PrepMarkPicker({ noteId, reportText, onChanged, persist }) {
  const careTeam = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("mi_care_team") || "[]"); } catch { return []; }
  }, []);

  // Existing marks win; otherwise start from the deterministic suggestions.
  const existing = useMemo(() => {
    try {
      const notes = JSON.parse(localStorage.getItem("mi_notes") || "[]");
      return getPrepTargets(notes.find(n => String(n.id) === String(noteId)));
    } catch { return []; }
  }, [noteId]);

  const [selected, setSelected] = useState(() => {
    if (existing.length) {
      return new Set(existing.map(t => String(t.careTeamId ?? t.name)));
    }
    return new Set(suggestPrepTargets(reportText, careTeam).map(t => String(t.careTeamId ?? t.name)));
  });
  const [applied, setApplied] = useState(existing.length > 0);
  const [dirty, setDirty] = useState(false);

  if (!careTeam.length) return null; // nothing to target without a care team

  const toggle = (m) => {
    setSelected(prev => {
      const next = new Set(prev);
      const k = memberKey(m);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
    setDirty(true);
  };

  const apply = () => {
    const targets = careTeam.filter(m => selected.has(memberKey(m))).map(targetFor);
    (persist || setPrepTargets)(noteId, targets);
    setApplied(true);
    setDirty(false);
    onChanged?.(targets);
  };

  const count = selected.size;
  const mono = "'DM Mono',monospace";

  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
      <span style={{ fontSize: 12, color: "#a0b4c8", fontFamily: mono, letterSpacing: "0.8px", textTransform: "uppercase" }}>
        Include in appointment prep for:
      </span>
      {careTeam.map(m => {
        const on = selected.has(memberKey(m));
        return (
          <button key={memberKey(m)} onClick={() => toggle(m)}
            title={m.specialty || m.role || ""}
            style={{
              padding: "4px 10px", borderRadius: 12, fontSize: 12, fontFamily: "'Sora',sans-serif",
              cursor: "pointer", transition: "all .12s",
              background: on ? "rgba(79,142,247,.16)" : "transparent",
              border: `1px solid ${on ? "rgba(79,142,247,.45)" : "#1a2f4a"}`,
              color: on ? "#7eb8d8" : "#8299ad",
            }}>
            {on ? "✓ " : ""}{m.name}
          </button>
        );
      })}
      <button onClick={apply} disabled={applied && !dirty}
        style={{
          padding: "4px 12px", borderRadius: 8, fontSize: 12, fontFamily: "'Sora',sans-serif",
          cursor: applied && !dirty ? "default" : "pointer",
          background: applied && !dirty ? "rgba(16,185,129,.10)" : "rgba(16,185,129,.16)",
          border: "1px solid rgba(16,185,129,.35)", color: "#2dd4a0",
        }}>
        {applied && !dirty
          ? (count ? "✓ Marked for prep" : "✓ Marks cleared")
          : (count ? `Mark for prep (${count})` : (applied ? "Remove marks" : "Mark for prep"))}
      </button>
      <span style={{ fontSize: 12, color: "#8299ad", fontFamily: mono }}>
        Included when you prep for that doctor · clears after the visit
      </span>
    </div>
  );
}
