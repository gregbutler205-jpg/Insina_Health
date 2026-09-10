// ─────────────────────────────────────────────────────────────────────────────
// SearchPopup.jsx — Global search across everything already in Insina
// Every query — keyword OR question — is answered from localStorage. No tokens,
// no network: "which doctor did my EGD", "when was my last cervical MRI", and
// "what's my dosage of tacrolimus" are lookups, and the answers are already in
// the record (src/lib/recordQuery.js). AI is an explicit secondary choice, for
// questions that genuinely need reasoning rather than retrieval.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from "react";
import { setPendingSelect } from "../lib/searchSelect.js";
import { extractTerms, matchesTerms, buildDirectAnswer, sortByDate, detectCategoryHint, snippet } from "../lib/recordQuery.js";
import { canonicalLabId } from "../lib/labCanonical.js";

const C = {
  overlay: "rgba(0,0,0,.72)",
  card:    "#0b1220",
  b1:      "#1a2f4a",
  b2:      "#1c2a40",
  blue:    "#6ea3ff",
  green:   "#2dd4a0",
  amber:   "#f59e0b",
  red:     "#f87171",
  purple:  "#a78bfa",
  p:       "#dde8f5",
  s:       "#7eb8d8",
  dim:     "#98afc4",
  ghost:   "#8299ad",
};

const CATEGORIES = {
  labs:         { label: "Labs & Results",  color: "#10b981", tab: "labs"         },
  medications:  { label: "Medications",     color: "#f59e0b", tab: "medications"  },
  conditions:   { label: "Conditions",      color: "#a78bfa", tab: "conditions"   },
  pharmacies:   { label: "Pharmacy",        color: "#4f8ef7", tab: "profile"       },
  appointments: { label: "Appointments",    color: "#4f8ef7", tab: "appointments" },
  symptoms:     { label: "Symptoms",        color: "#ef4444", tab: "symptoms"     },
  surgeries:    { label: "Procedures",      color: "#7eb8d8", tab: "surgeries"    },
  diagnostics:  { label: "Diagnostics",     color: "#7eb8d8", tab: "diagnostics"  },
  documents:    { label: "Source Documents", color: "#f59e0b", tab: "documents"    },
  aiHistory:    { label: "AI History",      color: "#a78bfa", tab: "ai"           },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function safeRead(key, fb) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fb; } catch { return fb; }
}

function snippetOf(text, terms) {
  const t = terms.find(x => String(text ?? "").toLowerCase().includes(x));
  return t ? snippet(String(text), t) : "";
}

// ── Core search ───────────────────────────────────────────────────────────────
// Term-based AND matching: every content term must appear somewhere in the
// record. The old contiguous-substring match meant "cervical MRI" could not
// find a study named "MRI Cervical Spine", and any question-shaped query
// matched nothing at all. Each result carries its source `record` so the
// answer layer can read fields (provider, dose, value) straight off it.
function searchAll(query) {
  const terms = extractTerms(query);
  // "my pharmacy's phone number" leaves no content terms — the section word IS
  // the query. Fall back to listing that section rather than finding nothing.
  const hint = detectCategoryHint(query);
  if (!terms.length && !hint) return [];
  const results = [];
  const add = (category, fields, record, shape) => {
    const hit = terms.length ? matchesTerms(fields, terms) : hint === category;
    if (hit) results.push({ category, record, ...shape });
  };

  safeRead("mi_labs", []).forEach(l => add("labs",
    // v1.54.2: the canonical id joins the haystack so "PSA" finds a row named
    // "Prostate Specific Antigen" (and FK506 finds Tacrolimus) — same alias
    // table the trends and tripwire grouping already use.
    [l.name, canonicalLabId(l.name), l.value, l.notes, l.date, l.refRange, l.category, l.facility], l, {
      title: l.name || "Lab Result",
      subtitle: [
        l.value != null ? `${l.value}${l.unit ? " " + l.unit : ""}` : null,
        l.refRange ? `Ref: ${l.refRange}` : null,
        l.flag ? "⚠ Flagged" : null,
        l.date,
      ].filter(Boolean).join(" · "),
      date: l.date || "",
    }));

  safeRead("mi_meds_full", []).forEach(m => add("medications",
    [m.name, m.brand, m.dose, m.strength, m.frequency, m.notes, m.category, m.prescriber, m.route], m, {
      title: m.name || "Medication",
      subtitle: [m.dose || m.strength, m.frequency, m.status !== "active" ? m.status : null].filter(Boolean).join(" · "),
      date: "",
    }));

  safeRead("mi_conditions", []).forEach(c => add("conditions",
    [c.name, c.notes, c.status, c.severity, c.since], c, {
      title: c.name || "Condition",
      subtitle: [c.status, c.since ? "Since " + c.since : null].filter(Boolean).join(" · "),
      date: c.since || "",
    }));

  safeRead("mi_pharmacies", []).forEach(ph => add("pharmacies",
    [ph.name, ph.type, ph.phone, ph.fax, ph.address, ph.hours, ph.notes], ph, {
      title: ph.name || "Pharmacy",
      subtitle: [ph.type, ph.phone, ph.address].filter(Boolean).join(" · "),
      date: "",
    }));

  safeRead("mi_appointments", []).forEach(a => add("appointments",
    [a.title, a.provider, a.facility, a.notes, a.type, a.address, a.specialty, a.date], a, {
      title: a.title || "Appointment",
      subtitle: [a.provider, a.facility, a.date].filter(Boolean).join(" · "),
      date: a.date || "",
    }));

  safeRead("mi_symptoms", []).forEach(sy => {
    const name = sy.symptom || sy.name;
    add("symptoms", [name, sy.note, sy.notes, sy.location, sy.severity, sy.date], sy, {
      title: name || "Symptom",
      subtitle: [sy.severity != null && sy.severity !== "" ? `Severity ${sy.severity}` : null, sy.date].filter(Boolean).join(" · "),
      date: sy.date || "",
    });
  });

  safeRead("mi_surgeries", []).forEach(sg => add("surgeries",
    [sg.procedure, sg.surgeon, sg.facility, sg.notes, sg.outcome, sg.date], sg, {
      title: sg.procedure || "Procedure",
      subtitle: [sg.surgeon, sg.facility, sg.date].filter(Boolean).join(" · "),
      date: sg.date || "",
    }));

  safeRead("mi_diagnostics", []).forEach(d => add("diagnostics",
    [d.name, d.type, d.bodyPart, d.orderedBy, d.readingProvider, d.impression, d.relatedCondition, d.facility, d.date], d, {
      title: d.name || [d.type, d.bodyPart].filter(Boolean).join(" ") || "Diagnostic study",
      subtitle: [d.readingProvider || d.orderedBy, d.facility, d.date].filter(Boolean).join(" · "),
      date: d.date || "",
    }));

  safeRead("mi_ref_docs", []).forEach(d => {
    if (!matchesTerms([d.name, d.text], terms)) return;
    results.push({
      category: "documents", record: d,
      title: d.name || "Document",
      subtitle: snippetOf(d.text, terms) || "Matched document name",
      date: d.addedAt ? String(d.addedAt).slice(0, 10) : "",
    });
  });

  safeRead("insina_ai_messages", []).forEach((m, i) => {
    if (!matchesTerms([m.text], terms)) return;
    results.push({
      category: "aiHistory", record: m,
      title: m.role === "user" ? "Your question" : "AI response",
      subtitle: snippetOf(m.text, terms),
      date: "", msgIndex: i,
    });
  });

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function SearchPopup({ onClose, onNavChange }) {
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState([]);
  const [answer,  setAnswer]  = useState(null);
  const inputRef = useRef(null);

  // Focus input on open
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Close on Escape
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Every query searches the record — questions included. The record is the
  // answer source; AI is a separate, explicit action the user can still take.
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); setAnswer(null); return; }
    const found = searchAll(q);
    setResults(found);
    setAnswer(buildDirectAnswer(q, found));
  }, [query]);

  function handleAskAI() {
    localStorage.setItem("mi_ai_pending", query.trim());
    onNavChange("ai");
    onClose();
  }

  // UI-26: selecting a result opens the underlying record — the destination
  // tab takes the pending selection on mount, or via the event if it is
  // already the visible tab (no remount happens then).
  function handleResult(cat, result) {
    if (result?.title) setPendingSelect(cat, result.title);
    onNavChange(CATEGORIES[cat].tab);
    onClose();
    window.dispatchEvent(new Event("insina-pending-select"));
  }

  // Group results by category
  const grouped = {};
  results.forEach(r => {
    if (!grouped[r.category]) grouped[r.category] = [];
    grouped[r.category].push(r);
  });
  const total = results.length;
  const q = query.trim();

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: C.overlay, zIndex: 9999, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 72 }}
    >
      <div style={{ width: "100%", maxWidth: 660, background: C.card, border: `1px solid ${C.b1}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 28px 72px rgba(0,0,0,.7)", display: "flex", flexDirection: "column", maxHeight: "72vh" }}>

        {/* ── Search bar ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: `1px solid ${C.b2}` }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.dim} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key !== "Enter") return;
              if (answer) handleResult(answer.result.category, answer.result);
              else if (results.length === 0 && query.trim()) handleAskAI();
            }}
            placeholder="Search or ask: which doctor did my EGD, dosage of tacrolimus…"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: C.p, fontSize: 14, fontFamily: "'Sora',sans-serif" }}
          />
          {query && (
            <button onClick={() => setQuery("")} style={{ background: "none", border: "none", color: C.ghost, cursor: "pointer", fontSize: 15, padding: "0 4px", lineHeight: 1 }}>✕</button>
          )}
          <kbd style={{ background: "#0d1520", border: `1px solid ${C.b1}`, borderRadius: 5, color: C.ghost, fontSize: 12, fontFamily: "'DM Mono',monospace", padding: "3px 7px", cursor: "pointer" }} onClick={onClose}>ESC</kbd>
        </div>

        {/* ── Results ── */}
        <div style={{ overflowY: "auto", flex: 1 }}>

          {/* Direct answer — read straight out of the record, no AI, no tokens */}
          {answer && (
            <div style={{ padding: "14px 18px 4px" }}>
              <button
                onClick={() => handleResult(answer.result.category, answer.result)}
                style={{ width: "100%", display: "flex", alignItems: "flex-start", gap: 13, padding: "13px 15px", background: "rgba(16,185,129,.07)", border: `1px solid rgba(16,185,129,.28)`, borderRadius: 10, cursor: "pointer", textAlign: "left" }}
              >
                <span style={{ fontSize: 15, color: C.green, flexShrink: 0, marginTop: 1 }}>✓</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: C.p, fontWeight: 600, marginBottom: 3, lineHeight: 1.45 }}>{answer.text}</div>
                  <div style={{ fontSize: 12, color: C.dim, fontFamily: "'DM Mono',monospace" }}>
                    {answer.sourceLabel} · {CATEGORIES[answer.result.category]?.label} · click to open
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* Keyword results grouped by category */}
          {q && total === 0 && (
            <div style={{ padding: "34px 18px 26px", textAlign: "center" }}>
              <div style={{ color: C.ghost, fontSize: 12, fontFamily: "'DM Mono',monospace", marginBottom: 16 }}>
                Nothing in your record matches "{q}"
              </div>
              <button
                onClick={handleAskAI}
                style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "10px 16px", background: "linear-gradient(135deg,rgba(79,142,247,.12),rgba(167,139,250,.08))", border: `1px solid rgba(79,142,247,.3)`, borderRadius: 10, cursor: "pointer", color: C.p, fontSize: 12, fontFamily: "'Sora',sans-serif" }}
              >
                <span style={{ color: C.blue, fontSize: 14 }}>✦</span>
                Ask AI Analysis instead
                <span style={{ color: C.dim, fontSize: 12, fontFamily: "'DM Mono',monospace" }}>· uses tokens</span>
              </button>
            </div>
          )}

          {Object.entries(grouped).map(([cat, items]) => {
            const cfg = CATEGORIES[cat];
            return (
              <div key={cat} style={{ padding: "12px 18px 4px" }}>
                <div style={{ fontSize: 12, letterSpacing: "1.5px", textTransform: "uppercase", color: cfg.color, fontFamily: "'DM Mono',monospace", marginBottom: 6, paddingLeft: 2 }}>
                  {cfg.label}
                </div>
                {sortByDate(items).slice(0, 6).map((r, i) => (
                  <button
                    key={i}
                    onClick={() => handleResult(cat, r)}
                    style={{ width: "100%", display: "flex", alignItems: "flex-start", gap: 12, padding: "9px 10px", background: "transparent", border: "1px solid transparent", borderRadius: 8, cursor: "pointer", textAlign: "left", marginBottom: 2, transition: "background .1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,.03)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.color, flexShrink: 0, marginTop: 5 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: C.p, fontWeight: 600, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
                      {r.subtitle && (
                        <div style={{ fontSize: 12, color: C.dim, fontFamily: "'DM Mono',monospace", lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {r.subtitle}
                        </div>
                      )}
                    </div>
                    {r.date && <div style={{ fontSize: 12, color: C.ghost, fontFamily: "'DM Mono',monospace", flexShrink: 0, paddingTop: 2 }}>{String(r.date).slice(0, 10)}</div>}
                  </button>
                ))}
              </div>
            );
          })}

          {/* Empty state */}
          {!q && (
            <div style={{ padding: "36px 18px", textAlign: "center" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.ghost} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <div style={{ fontSize: 12, color: C.ghost, fontFamily: "'DM Mono',monospace", lineHeight: 2 }}>
                Search labs, medications, conditions, appointments,<br />
                symptoms, procedures, diagnostics, documents and more.<br />
                <span style={{ color: C.green }}>Ask in plain words: answered from your record.</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        {total > 0 && (
          <div style={{ padding: "8px 18px", borderTop: `1px solid ${C.b2}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: C.ghost, fontFamily: "'DM Mono',monospace" }}>
              {total} result{total !== 1 ? "s" : ""} · click any to open that section
            </span>
            <button onClick={handleAskAI} title="Send this question to AI Analysis (uses tokens)"
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: C.blue, fontFamily: "'DM Mono',monospace", padding: 0 }}>
              ✦ Ask AI instead
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
