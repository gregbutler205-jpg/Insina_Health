import { useState, useEffect } from "react";
import PrintButton from "../PrintButton.jsx";
import { printNotesReport } from "../../lib/printReports.js";
import { formatDateUS } from "../../lib/displaySafe.js";
import { callAI, responseText } from "../../lib/aiClient.js";
import { tombstoneRecord } from "../../lib/recordTombstones.js";
import { getIdentity } from "../../prompts/identity.js";
import { buildSurfaceC } from "../../prompts/surfaceC.js";
import { downloadAnalysisMarkdown } from "../../lib/analysisExport.js";
import { PinIcon } from "../icons.jsx";
// AUDIT_SEC_02 F-03: this summary renders as a plain text child (line ~312,
// `whiteSpace:"pre-wrap"`) — safe from XSS on its own, but that means it never
// passes through renderAiText.js's shared filter. Applied explicitly here.
import { scanForProhibitedDirectives } from "../../lib/aiOutputFilter.js";
// DEC-046: mark (or retarget) any AI report for appointment prep after the fact.
import PrepMarkPicker from "../PrepMarkPicker.jsx";

const TAG_STYLES = {
  Appt:     { bg: "rgba(79,142,247,.12)",  color: "#6ea3ff", border: "rgba(79,142,247,.25)" },
  Labs:     { bg: "rgba(245,158,11,.1)",   color: "#f59e0b", border: "rgba(245,158,11,.25)" },
  Meds:     { bg: "rgba(167,139,250,.1)",  color: "#a78bfa", border: "rgba(167,139,250,.25)" },
  Symptoms: { bg: "rgba(16,185,129,.1)",   color: "#2dd4a0", border: "rgba(16,185,129,.25)" },
  General:  { bg: "rgba(79,142,247,.12)",  color: "#6ea3ff", border: "rgba(79,142,247,.25)" },
  Urgent:   { bg: "rgba(239,68,68,.1)",    color: "#f87171", border: "rgba(239,68,68,.25)" },
};

const FILTERS = ["All", "Appt", "Labs", "Meds", "Symptoms", "General", "Urgent"];


function TagBadge({ tag }) {
  const s = TAG_STYLES[tag] || TAG_STYLES.General;
  return (
    <span style={{ background: s.bg, color: s.color, borderRadius: 4, padding: "2px 7px", fontSize: 12, fontFamily: "'DM Mono', monospace" }}>
      {tag}
    </span>
  );
}

function NoteItem({ note, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "11px 14px", cursor: "pointer", borderBottom: "1px solid #1c2a40",
        borderLeft: `2px solid ${active ? "#4f8ef7" : "transparent"}`,
        background: active ? "rgba(79,142,247,.07)" : "transparent",
        transition: "background .12s",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: active ? "#c4d8ee" : "#7eb8d8", lineHeight: 1.3, flex: 1, marginRight: 6 }}>
          {note.title}
        </div>
        {note.aiGenerated && (
          <span title="AI-generated content" style={{ fontSize: 12, background: "rgba(79,142,247,.14)", color: "#6ea3ff", border: "1px solid rgba(79,142,247,.3)", padding: "1px 5px", borderRadius: 3, fontFamily: "'DM Mono',monospace", letterSpacing: "0.5px", flexShrink: 0, marginRight: 4 }}>AI</span>
        )}
        {note.prepTargets?.length > 0 && (
          <span title={`Marked for appointment prep: ${note.prepTargets.map(t => t.name).join(", ")}`} style={{ fontSize: 12, background: "rgba(16,185,129,.12)", color: "#2dd4a0", border: "1px solid rgba(16,185,129,.3)", padding: "1px 5px", borderRadius: 3, fontFamily: "'DM Mono',monospace", letterSpacing: "0.5px", flexShrink: 0, marginRight: 4 }}>PREP</span>
        )}
        {note.pinned && <span style={{ color: "#f59e0b", flexShrink: 0, display: "flex" }} title="Pinned"><PinIcon size={11} /></span>}
      </div>
      <div style={{ fontSize: 12, color: "#98afc4", lineHeight: 1.4, marginBottom: 6, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
        {note.preview}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <TagBadge tag={note.tag} />
        <span style={{ fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono', monospace", marginLeft: "auto" }}>{formatDateUS(note.date)}</span>
      </div>
    </div>
  );
}

function ChecklistSection({ section, onToggle }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono', monospace", letterSpacing: "1.4px", textTransform: "uppercase", marginBottom: 10, marginTop: 18 }}>
        {section.header}
      </div>
      {section.items.map(item => (
        <div key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
          <div
            onClick={() => onToggle(section.id, item.id)}
            style={{
              width: 15, height: 15, border: `1px solid ${item.done ? "#10b981" : "#1c2a40"}`,
              borderRadius: 3, background: item.done ? "rgba(16,185,129,.1)" : "#0b1220",
              flexShrink: 0, marginTop: 2, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", transition: "all .15s",
            }}
          >
            {item.done && <span style={{ fontSize: 12, color: "#2dd4a0" }}>✓</span>}
          </div>
          <div style={{ fontSize: 13, color: item.done ? "#b0c4d8" : "#a8c4dc", lineHeight: 1.55, textDecoration: item.done ? "line-through" : "none", transition: "color .15s" }}>
            {item.text}
          </div>
        </div>
      ))}
    </div>
  );
}

function TextSection({ section, onEdit }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono', monospace", letterSpacing: "1.4px", textTransform: "uppercase", marginBottom: 10, marginTop: 18 }}>
        {section.header}
      </div>
      <div style={{ background: "#0b1220", border: "1px solid #1c2a40", borderRadius: 10, padding: "12px 14px" }}>
        <textarea
          value={section.body}
          onChange={e => onEdit(section.id, e.target.value)}
          rows={Math.max(3, section.body.split("\n").length + 1)}
          style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: "#a8c4dc", fontFamily: "'Sora', sans-serif", fontSize: 13, lineHeight: 1.75, resize: "none" }}
        />
      </div>
    </div>
  );
}

function EditorPanel({ note, onUpdate, onDelete, onPin, onAI }) {
  if (!note) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 32, opacity: 0.15 }}>◻</div>
      <div style={{ fontSize: 13, color: "#a0b4c8", fontFamily: "'DM Mono', monospace" }}>Select a note or create a new one</div>
    </div>
  );

  function toggleCheck(sectionId, itemId) {
    const updated = {
      ...note,
      sections: note.sections.map(s =>
        s.id === sectionId ? { ...s, items: s.items.map(i => i.id === itemId ? { ...i, done: !i.done } : i) } : s
      )
    };
    onUpdate(updated);
  }

  function editText(sectionId, val) {
    const updated = { ...note, sections: note.sections.map(s => s.id === sectionId ? { ...s, body: val } : s) };
    onUpdate(updated);
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#07090f" }}>
      {/* Toolbar */}
      <div style={{ height: 50, background: "#080c14", borderBottom: "1px solid #1c2a40", display: "flex", alignItems: "center", padding: "0 20px", gap: 14, flexShrink: 0 }}>
        <select
          value={note.tag}
          onChange={e => onUpdate({ ...note, tag: e.target.value })}
          style={{ background: "#0b1220", border: "1px solid rgba(79,142,247,.25)", borderRadius: 6, padding: "3px 8px", fontSize: 12, color: "#6ea3ff", fontFamily: "'DM Mono', monospace", outline: "none", cursor: "pointer" }}
        >
          {Object.keys(TAG_STYLES).map(t => <option key={t}>{t}</option>)}
        </select>
        <span style={{ fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono', monospace" }}>{formatDateUS(note.date)}</span>
        <div style={{ flex: 1 }} />
        <span onClick={() => onPin(note.id)} role="button" style={{ color: note.pinned ? "#f59e0b" : "#98afc4", cursor: "pointer", display: "flex" }} title={note.pinned ? "Unpin" : "Pin"}><PinIcon size={14} /></span>
        <div style={{ width: 1, height: 16, background: "#0d1a28" }} />
        <span onClick={() => onAI(note)} style={{ fontSize: 12, color: "#98afc4", cursor: "pointer", fontFamily: "'DM Mono', monospace", transition: "color .12s" }}
          onMouseEnter={e => e.target.style.color = "#7eb8d8"} onMouseLeave={e => e.target.style.color = "#98afc4"}>✦ AI</span>
        <div style={{ width: 1, height: 16, background: "#0d1a28" }} />
        <span onClick={() => onDelete(note.id)} style={{ fontSize: 12, color: "#98afc4", cursor: "pointer", fontFamily: "'DM Mono', monospace", transition: "color .12s" }}
          onMouseEnter={e => e.target.style.color = "#ef4444"} onMouseLeave={e => e.target.style.color = "#98afc4"}>Delete</span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 30px" }}>
        <input
          value={note.title}
          onChange={e => onUpdate({ ...note, title: e.target.value })}
          style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: "#dde8f5", fontFamily: "'DM Serif Display', serif", fontSize: 24, letterSpacing: "-0.3px", marginBottom: 4 }}
        />
        <div style={{ fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono', monospace", marginBottom: 20 }}>{formatDateUS(note.date)}</div>

        {/* DEC-022: explicit AI-generated label — distinguishes this from
            clinician or patient-authored text, plus a markdown download. */}
        {note.aiGenerated && (
          <div style={{ background: "rgba(79,142,247,.07)", border: "1px solid rgba(79,142,247,.22)", borderRadius: 8, padding: "9px 13px", marginBottom: 18, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, background: "rgba(79,142,247,.14)", color: "#6ea3ff", border: "1px solid rgba(79,142,247,.3)", padding: "1px 6px", borderRadius: 3, fontFamily: "'DM Mono', monospace", letterSpacing: "0.5px", flexShrink: 0 }}>AI</span>
            <span style={{ fontSize: 12, color: "#7eb8d8", flex: 1, lineHeight: 1.5 }}>
              AI-generated analysis: informational only, not clinician text. Verify against source records.
            </span>
            <button
              onClick={() => downloadAnalysisMarkdown({
                analysisType: note.title,
                content: (note.sections || []).map(s => s.type === "checklist"
                  ? (s.items || []).map(i => `- [${i.done ? "x" : " "}] ${i.text}`).join("\n")
                  : s.body || "").join("\n\n"),
                mode: note.aiMode,
              })}
              title="Download this analysis as a dated markdown file"
              style={{ background: "none", border: "1px solid rgba(79,142,247,.3)", borderRadius: 6, color: "#6ea3ff", fontSize: 12, fontFamily: "'DM Mono', monospace", padding: "3px 10px", cursor: "pointer", flexShrink: 0 }}
            >↓ .md</button>
          </div>
        )}

        {/* DEC-046: mark this report for appointment prep — after the fact,
            for reports saved before marking existed or to retarget. persist
            routes through updateNote because this component rewrites the whole
            notes array from React state on every edit; a direct storage write
            would be clobbered by the next keystroke. */}
        {note.aiGenerated && (
          <div key={`prep-${note.id}`} style={{ background: "rgba(16,185,129,.05)", border: "1px solid rgba(16,185,129,.18)", borderRadius: 8, padding: "9px 13px", marginBottom: 18 }}>
            <PrepMarkPicker
              noteId={note.id}
              reportText={(note.sections || []).map(s => s.body || "").join("\n\n")}
              persist={(id, targets) => {
                const copy = { ...note, updatedAt: Date.now() };
                if (targets.length) copy.prepTargets = targets;
                else delete copy.prepTargets;
                onUpdate(copy);
              }}
            />
          </div>
        )}

        {note.linked && (
          <div style={{ background: "#0b1220", border: "1px solid #1c2a40", borderRadius: 8, padding: "10px 14px", marginBottom: 18, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 14 }}>📅</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#7eb8d8" }}>{note.linked.label}</div>
              <div style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono', monospace" }}>{note.linked.date}</div>
            </div>
            <span style={{ fontSize: 12, color: "#6ea3ff", fontFamily: "'DM Mono', monospace", marginLeft: "auto", cursor: "pointer" }}>View →</span>
          </div>
        )}

        {note.sections.map(s =>
          s.type === "checklist"
            ? <ChecklistSection key={s.id} section={s} onToggle={toggleCheck} />
            : <TextSection key={s.id} section={s} onEdit={editText} />
        )}

        <div style={{ background: "linear-gradient(135deg,rgba(79,142,247,.08),rgba(167,139,250,.05))", border: "1px solid rgba(79,142,247,.2)", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, marginTop: 20 }}>
          <span style={{ color: "#6ea3ff", fontSize: 14 }}>✦</span>
          <div style={{ fontSize: 12, color: "#6ea3ff", flex: 1 }}>AI can summarize this note into a pre-visit brief or suggest questions from your labs.</div>
          <button onClick={() => onAI(note)} style={{ fontSize: 12, color: "#6ea3ff", border: "1px solid rgba(79,142,247,.35)", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontFamily: "'DM Mono', monospace", background: "transparent" }}>Generate →</button>
        </div>
      </div>
    </div>
  );
}

function NewNoteModal({ onSave, onClose }) {
  const [title, setTitle] = useState("");
  const [tag, setTag] = useState("General");
  const [body, setBody] = useState("");

  function save() {
    if (!title.trim()) return;
    const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    onSave({
      id: Date.now(), pinned: false, tag, date: dateStr,
      title: title.trim(),
      preview: body.slice(0, 80) + (body.length > 80 ? "..." : ""),
      sections: [{ id: "s1", type: "text", header: "Notes", body }]
    });
    onClose();
  }

  const inputStyle = { width: "100%", background: "#07090f", border: "1px solid #1c2a40", borderRadius: 8, padding: "9px 12px", color: "#dde8f5", fontFamily: "'Sora', sans-serif", fontSize: 13, outline: "none", marginBottom: 12 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#0b1220", border: "1px solid #1a2f4a", borderRadius: 14, padding: 28, width: 480 }}>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: "#dde8f5", marginBottom: 18 }}>New Note</div>
        <input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} />
        <select value={tag} onChange={e => setTag(e.target.value)} style={{ ...inputStyle, color: "#7eb8d8", fontFamily: "'DM Mono', monospace", fontSize: 12, cursor: "pointer" }}>
          {Object.keys(TAG_STYLES).map(t => <option key={t}>{t}</option>)}
        </select>
        <textarea placeholder="Start writing..." value={body} onChange={e => setBody(e.target.value)} rows={5}
          style={{ ...inputStyle, color: "#a8c4dc", resize: "vertical", lineHeight: 1.65 }} />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <button onClick={onClose} style={{ padding: "8px 18px", background: "transparent", border: "1px solid #1c2a40", borderRadius: 8, color: "#b0c4d8", fontFamily: "'Sora', sans-serif", cursor: "pointer", fontSize: 12 }}>Cancel</button>
          <button onClick={save} style={{ padding: "8px 18px", background: "rgba(79,142,247,.15)", border: "1px solid rgba(79,142,247,.35)", borderRadius: 8, color: "#6ea3ff", fontFamily: "'Sora', sans-serif", cursor: "pointer", fontSize: 12 }}>Save Note</button>
        </div>
      </div>
    </div>
  );
}

function AIPanel({ note, onClose }) {
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true); setError(""); setResult("");
    const noteText = note.sections.map(s =>
      s.type === "text"
        ? `${s.header}:\n${s.body}`
        : `${s.header}:\n${s.items.map(i => `[${i.done ? "✓" : " "}] ${i.text}`).join("\n")}`
    ).join("\n\n");

    try {
      // PG-08: was a direct api.anthropic.com call with a stale model string,
      // a missing required browser-access header, and the patient's real name
      // in the prompt. A-02 routed it through the proxy; A-09 replaces the
      // inline system string with the shared CSC + Surface C builder.
      const conditionsActive = (() => {
        try {
          const c = JSON.parse(localStorage.getItem("mi_conditions") || "[]");
          const active = c.filter(x => x.status === "active");
          return active.length > 0 ? active.map(x => `- ${x.name}`).join("\n") : "- No active conditions on file.";
        } catch { return "- No active conditions on file."; }
      })();
      const { userId, age, sex } = getIdentity();
      const { system } = buildSurfaceC({ userId, age, sex, dataSections: `ACTIVE CONDITIONS\n${conditionsActive}` });
      const res = await callAI({
        surface: "notes.summary",
        mode: "standard",
        system,
        messages: [{ role: "user", content: `Note title: ${note.title}\n\n${noteText}\n\nProvide a brief pre-visit summary and action suggestions.` }],
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || err?.error || `Server error ${res.status}`);
      }
      const data = await res.json();
      setResult(scanForProhibitedDirectives(responseText(data)).redactedText);
    } catch (e) {
      setError(e.message || "Request failed.");
    }
    setLoading(false);
  }

  useEffect(() => { generate(); }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#0b1220", border: "1px solid #1a2f4a", borderRadius: 14, padding: 28, width: 520, maxHeight: "70vh", overflow: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <span style={{ color: "#6ea3ff", fontSize: 16 }}>✦</span>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: "#dde8f5", flex: 1 }}>AI Note Summary</div>
          <span onClick={onClose} style={{ color: "#98afc4", cursor: "pointer", fontSize: 16 }}>✕</span>
        </div>
        <div style={{ fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono', monospace", marginBottom: 14 }}>{note.title}</div>
        {loading && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "20px 0" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981", animation: "pulse 2s infinite" }} />
            <span style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono', monospace" }}>Analyzing note...</span>
          </div>
        )}
        {error && <div style={{ fontSize: 12, color: "#f87171", lineHeight: 1.6, fontFamily: "'DM Mono', monospace" }}>{error}</div>}
        {result && <div style={{ fontSize: 13, color: "#a8c4dc", lineHeight: 1.75, whiteSpace: "pre-wrap" }}>{result}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18, gap: 10 }}>
          {error && <button onClick={generate} style={{ padding: "7px 16px", background: "rgba(79,142,247,.15)", border: "1px solid rgba(79,142,247,.35)", borderRadius: 8, color: "#6ea3ff", fontFamily: "'Sora', sans-serif", cursor: "pointer", fontSize: 12 }}>Retry</button>}
          <button onClick={onClose} style={{ padding: "7px 16px", background: "transparent", border: "1px solid #1c2a40", borderRadius: 8, color: "#b0c4d8", fontFamily: "'Sora', sans-serif", cursor: "pointer", fontSize: 12 }}>Close</button>
        </div>
      </div>
    </div>
  );
}

// Tolerate the older mi_notes shapes two earlier AI-analysis writers produced
// (a flat `content` string with no sections, and sections keyed `heading`
// instead of `header`) — either previously crashed or mis-rendered the editor.
// Read-time only; the note is written back normalized on its next edit.
function normalizeNote(n) {
  if (Array.isArray(n.sections)) {
    return { ...n, preview: n.preview ?? "", sections: n.sections.map(s => s.header == null && s.heading != null ? { ...s, header: s.heading } : s) };
  }
  return {
    ...n,
    preview: n.preview ?? (n.content || "").slice(0, 110),
    sections: [{ id: "s1", type: "text", header: "Notes", body: n.content || "" }],
  };
}

export default function Notes() {
  const [notes, setNotes] = useState(() => {
    try { const r = localStorage.getItem("mi_notes"); return r ? JSON.parse(r).map(normalizeNote) : []; } catch { return []; }
  });
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [aiNote, setAiNote] = useState(null);

  const filtered = notes.filter(n => {
    const matchFilter = filter === "All" || n.tag === filter;
    const matchSearch = !search || n.title.toLowerCase().includes(search.toLowerCase()) || n.preview.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const pinned = filtered.filter(n => n.pinned);
  const recent = filtered.filter(n => !n.pinned);
  const selected = notes.find(n => n.id === selectedId) || null;

  const saveNotes = (updated) => { try { localStorage.setItem("mi_notes", JSON.stringify(updated)); } catch {} };

  function updateNote(updated) { const next = notes.map(n => n.id === updated.id ? updated : n); saveNotes(next); setNotes(next); }
  function deleteNote(id) {
    tombstoneRecord("mi_notes", notes.find(n => n.id === id));
    const remaining = notes.filter(n => n.id !== id);
    saveNotes(remaining);
    setNotes(remaining);
    setSelectedId(remaining.length > 0 ? remaining[0].id : null);
  }
  function pinNote(id) { const next = notes.map(n => n.id === id ? { ...n, pinned: !n.pinned } : n); saveNotes(next); setNotes(next); }
  function addNote(note) { const next = [note, ...notes]; saveNotes(next); setNotes(next); setSelectedId(note.id); }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <style>{`@media print { .no-print { display:none !important; } aside { display:none !important; } body { background:white !important; } }`}</style>

      {/* Topbar */}
      <div style={{ height: 54, background: "#080c14", borderBottom: "1px solid #1c2a40", display: "flex", alignItems: "center", padding: "0 24px", gap: 12, flexShrink: 0 }}>
        
        <div style={{ flex: 1 }} />
        <PrintButton reportType="notes" onPrint={() => printNotesReport(notes)} />
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

      {/* Left list panel */}
      <div style={{ width: 290, minWidth: 290, background: "#080c14", borderRight: "1px solid #1c2a40", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid #1c2a40" }}>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: "#dde8f5", marginBottom: 2 }}>Notes</div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#a0b4c8", letterSpacing: "1.5px", textTransform: "uppercase" }}>
            {notes.length} entries · {notes.filter(n => n.pinned).length} pinned
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: "10px 12px", borderBottom: "1px solid #1c2a40" }}>
          <div style={{ background: "#0b1220", border: "1px solid #1c2a40", borderRadius: 8, padding: "7px 12px", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#98afc4", fontSize: 13 }}>⌕</span>
            <input
              placeholder="Search notes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ background: "transparent", border: "none", outline: "none", color: "#a8c4dc", fontFamily: "'DM Mono', monospace", fontSize: 12, width: "100%" }}
            />
          </div>
        </div>

        {/* Filter pills */}
        <div style={{ padding: "8px 12px", display: "flex", gap: 5, flexWrap: "wrap", borderBottom: "1px solid #1c2a40" }}>
          {FILTERS.map(f => (
            <div
              key={f}
              onClick={() => setFilter(f)}
              style={{
                background: filter === f ? "rgba(79,142,247,.15)" : "#0b1220",
                border: `1px solid ${filter === f ? "rgba(79,142,247,.35)" : "#1c2a40"}`,
                borderRadius: 20, padding: "3px 10px", fontSize: 12,
                color: filter === f ? "#6ea3ff" : "#b0c4d8",
                fontFamily: "'DM Mono', monospace", cursor: "pointer", transition: "all .12s",
              }}
            >{f}</div>
          ))}
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {pinned.length > 0 && (
            <>
              <div style={{ padding: "8px 14px 3px", fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono', monospace", letterSpacing: "1.5px", textTransform: "uppercase" }}>PINNED</div>
              {pinned.map(n => <NoteItem key={n.id} note={n} active={selectedId === n.id} onClick={() => setSelectedId(n.id)} />)}
            </>
          )}
          {recent.length > 0 && (
            <>
              <div style={{ padding: "10px 14px 3px", fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono', monospace", letterSpacing: "1.5px", textTransform: "uppercase" }}>RECENT</div>
              {recent.map(n => <NoteItem key={n.id} note={n} active={selectedId === n.id} onClick={() => setSelectedId(n.id)} />)}
            </>
          )}
          {filtered.length === 0 && (
            <div style={{ padding: "30px 20px", textAlign: "center", fontSize: 12, color: "#a0b4c8", fontFamily: "'DM Mono', monospace" }}>No notes found</div>
          )}
        </div>

        {/* New note button */}
        <div style={{ padding: 12, borderTop: "1px solid #1c2a40" }}>
          <button
            onClick={() => setShowNew(true)}
            style={{ width: "100%", padding: 10, background: "linear-gradient(135deg,rgba(79,142,247,.15),rgba(167,139,250,.1))", border: "1px solid rgba(79,142,247,.3)", borderRadius: 10, color: "#7eb8d8", fontFamily: "'Sora', sans-serif", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <span style={{ color: "#6ea3ff", fontSize: 18, lineHeight: 1 }}>+</span> New Note
          </button>
        </div>
      </div>

      {/* Editor */}
      <EditorPanel note={selected} onUpdate={updateNote} onDelete={deleteNote} onPin={pinNote} onAI={n => setAiNote(n)} />

      {showNew && <NewNoteModal onSave={addNote} onClose={() => setShowNew(false)} />}
      {aiNote && <AIPanel note={aiNote} onClose={() => setAiNote(null)} />}
    </div>
      </div>
  );
}