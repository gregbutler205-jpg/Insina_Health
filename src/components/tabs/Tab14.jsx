import { useState, useEffect, useCallback, useRef } from "react";
import { listCalendars, listEvents, diffNewAppointments, getSelectedCalendar, setSelectedCalendar, tombstoneAppt, filterTombstoned } from "../../lib/calendarSync.js";
import { matchCareTeamMember } from "../../lib/careTeamMatch.js";
import { formatPhone, displayPhone, formatDateUS } from "../../lib/displaySafe.js";
import AILauncher from "../ai/AILauncher.jsx";
import { directionsUrl } from "../../lib/mapsLink.js";
import { requestReport } from "../../rie/preflightChecks.js";
import { PrintLabel } from "../icons.jsx";
import { escapeHtml, applyBoldSafe, stripAiEmojis } from "../../lib/renderAiText.js";
import { loadPdfjs } from "../../lib/pdfjs.js";
import { compressImage } from "../../lib/cards.js";
import { getDiagnostics, setDiagnostics, getMedsFull, setMedsFull } from "../../store.js";
import { callAI } from "../../lib/aiClient.js";
import { formatDocumentBlock } from "../../prompts/documents.js";
import { QUESTION_RULES } from "../../prompts/core.js";
import { takePendingSelect } from "../../lib/searchSelect.js";
import { wirePrintWindow } from "../../lib/printWindow.js";
// DEC-046: reports the patient marked for this visit ride into the prep prompt;
// completing the visit consumes the marks.
import { markedReportsForAppointment, buildMarkedReportsSection, clearPrepMarksForAppointment } from "../../lib/prepMarks.js";
// DEC-048: the demo replays pre-generated (real) AI prep reports instead of
// erroring — AI itself stays off in the demo (DEC-045); each sample says so.
import { isDemoMode } from "../../lib/secureStorage.js";
import { DEMO_PREP_REPORTS } from "../../config/demoPrepReports.js";

const PRINT_LOGO = import.meta.env.BASE_URL + "logo.png";

// Shared consultation prep, keyed by appointment id and synced via Drive so the
// mobile companion reads the same prep. `prepSig` must match the companion's
// (src/lib/companionData.js) so both detect when the appointment has changed.
function prepSig(appt) {
  return [appt?.title, appt?.specialty, appt?.provider, appt?.facility, appt?.date, appt?.notes, appt?.prepInstructions]
    .map(x => (x == null ? "" : String(x).trim())).join("|");
}
function loadVisitPrep(apptId) {
  try { return (JSON.parse(localStorage.getItem("mi_visit_prep") || "{}"))[String(apptId)] || null; } catch { return null; }
}
function saveVisitPrep(apptId, entry) {
  try {
    const all = JSON.parse(localStorage.getItem("mi_visit_prep") || "{}");
    all[String(apptId)] = { ...entry, generatedAt: new Date().toISOString() };
    localStorage.setItem("mi_visit_prep", JSON.stringify(all));
  } catch {}
}

function printConsultationPrep(appt, analysis) {
  const date = new Date().toLocaleDateString("en-US", { year:"numeric", month:"long", day:"numeric" });
  const apptDate = appt.date ? new Date(appt.date + "T12:00:00").toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric", year:"numeric" }) : "–";
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  const renderText = rawText => {
    if (!rawText) return "";
    const text = stripAiEmojis(rawText);
    return text.split("\n").map(line => {
      const t = line.trim();
      if (/^-{3,}$/.test(t)) return `<hr style="border:none;border-top:1px solid #ddd;margin:12px 0">`;
      if (t.startsWith("- ") || t.startsWith("• ")) return `<div style="display:flex;gap:8px;margin-bottom:5px;padding-left:8px"><span style="color:#2563eb;font-weight:700">&#9658;</span><span>${applyBoldSafe(t.replace(/^[-•]\s+/,""))}</span></div>`;
      const nm = t.match(/^(\d+)\.\s+(.+)/);
      if (nm) return `<div style="display:flex;gap:8px;margin-bottom:5px;padding-left:8px"><span style="font-weight:700;color:#2563eb;min-width:22px">${nm[1]}.</span><span>${applyBoldSafe(nm[2])}</span></div>`;
      const hm = t.match(/^\*\*([^*]+?)\*\*:?\s*$/);
      if (hm) return `<div style="font-weight:700;font-size:14px;margin-top:14px;margin-bottom:5px">${escapeHtml(hm[1].replace(/:$/,""))}</div>`;
      if (t === "") return `<div style="height:7px"></div>`;
      return `<div style="margin-bottom:3px;line-height:1.7">${applyBoldSafe(line)}</div>`;
    }).join("");
  };
  win.document.write(`<!DOCTYPE html><html><head>
    <title>Consultation Prep — Insina Health</title>
    <style>
      * { box-sizing:border-box; margin:0; padding:0; }
      body { font-family:Georgia,serif; max-width:760px; margin:48px auto; color:#1a1a1a; font-size:14px; line-height:1.65; padding:0 24px; }
      .logo { height:52px; margin-bottom:18px; }
      h1 { text-align:center; font-size:28px; font-weight:700; letter-spacing:-.5px; margin-bottom:8px; }
      .subtitle { text-align:center; font-size:13px; color:#555; margin-bottom:22px; }
      .rule { border:none; border-top:2px solid #2563eb; margin-bottom:24px; }
      .appt-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:22px; background:#f8f9fa; border:1px solid #ddd; border-radius:6px; padding:16px; }
      .appt-field label { font-size:10px; text-transform:uppercase; letter-spacing:.8px; color:#777; font-family:monospace; display:block; margin-bottom:3px; }
      .appt-field span { font-size:13px; color:#1a1a1a; font-weight:600; }
      .section-title { font-weight:700; font-size:16px; margin-bottom:12px; }
      .footer { margin-top:48px; border-top:1px solid #ddd; padding-top:12px; font-size:11px; color:#777; display:flex; justify-content:space-between; }
      @media print { body { margin:28px; } }
    </style>
  </head><body>
    <img src="${PRINT_LOGO}" class="logo" />
    <h1>Consultation Prep</h1>
    <div class="subtitle">Insina Health &mdash; AI Appointment Analysis</div>
    <hr class="rule" />
    <div class="appt-grid">
      <div class="appt-field"><label>Appointment</label><span>${escapeHtml(appt.title)}</span></div>
      <div class="appt-field"><label>Date</label><span>${apptDate}</span></div>
      <div class="appt-field"><label>Provider</label><span>${escapeHtml(appt.provider||"—")}</span></div>
      <div class="appt-field"><label>Specialty</label><span>${escapeHtml(appt.specialty||"—")}</span></div>
      ${appt.facility ? `<div class="appt-field" style="grid-column:1/-1"><label>Facility</label><span>${escapeHtml(appt.facility)}</span></div>` : ""}
      ${appt.prepInstructions ? `<div class="appt-field" style="grid-column:1/-1"><label>Prep Instructions</label><span>${escapeHtml(appt.prepInstructions)}</span></div>` : ""}
      ${appt.notes ? `<div class="appt-field" style="grid-column:1/-1"><label>Notes</label><span style="font-weight:400;white-space:pre-wrap">${escapeHtml(appt.notes)}</span></div>` : ""}
    </div>
    <div class="section-title">AI Preparation Analysis</div>
    ${renderText(analysis)}
    <div class="footer">
      <span>Insina Health &mdash; Personal Health Intelligence</span>
      <span>Generated ${date}</span>
    </div>
  </body></html>`);
  win.document.close();
  wirePrintWindow(win); // CSP-safe: the opener fires print; inline scripts are blocked in the popup
}

const URGENCY_CFG = {
  high: { color: "#f87171", bg: "rgba(239,68,68,.10)", border: "rgba(239,68,68,.25)", label: "High" },
  med:  { color: "#f59e0b", bg: "rgba(245,158,11,.10)", border: "rgba(245,158,11,.25)", label: "Med"  },
  low:  { color: "#2dd4a0", bg: "rgba(16,185,129,.10)", border: "rgba(16,185,129,.25)", label: "Low"  },
};

const STATUS_CFG = {
  upcoming:  { color: "#4f8ef7", label: "Upcoming"  },
  completed: { color: "#10b981", label: "Completed" },
  cancelled: { color: "#6b7a8d", label: "Cancelled" },
  suggested: { color: "#f59e0b", label: "Suggested" },
};

const SPECIALTIES = [
  "Cardiology", "Dentistry", "Dermatology", "Endocrinology", "Gastroenterology",
  "Hepatology / Liver Transplant", "Lab / Imaging", "Neurology",
  "Ophthalmology", "Orthopedics", "Physical Therapy", "Primary Care",
  "Pulmonology", "Rheumatology", "Urology", "Other",
];

const BLANK = {
  id: null, title: "", provider: "", specialty: "", facility: "",
  date: "", time: "", phone: "", address: "", notes: "",
  prepInstructions: "", status: "upcoming", urgency: "med", reminder: true,
};

function genId() { return Math.random().toString(36).slice(2); }

// Google Maps DIRECTIONS link to the appointment's location (v1.58.2: was a
// search link that listed places to pick from). Shared with the companion.
function mapsUrl(appt) {
  let team = [];
  try { team = JSON.parse(localStorage.getItem("mi_care_team") || "[]"); } catch { team = []; }
  return directionsUrl(appt, team) || "https://www.google.com/maps";
}

const GCAL_LAST_SYNC_KEY = "mi_gcal_last_sync";
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function loadAppts() {
  try {
    const raw = localStorage.getItem("mi_appointments");
    // filterTombstoned: heal synced records the user already deleted but that a
    // pre-tombstone sync or Drive merge resurrected (manual records untouched).
    return raw ? filterTombstoned(JSON.parse(raw)) : seedAppts();
  } catch { return seedAppts(); }
}

function seedAppts() {
  const appts = [];
  localStorage.setItem("mi_appointments", JSON.stringify(appts));
  return appts;
}

function saveAppts(appts) {
  localStorage.setItem("mi_appointments", JSON.stringify(appts));
  // Also sync to mi_upcoming for Dashboard
  const upcoming = appts
    .filter(a => a.status === "upcoming")
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 5)
    .map(a => ({
      label:   a.title,
      date:    new Date(a.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      urgency: a.urgency,
      doctor:  a.provider,
      facility: a.facility,
    }));
  localStorage.setItem("mi_upcoming", JSON.stringify(upcoming));
}

// formatPhone comes from displaySafe.js (v1.56.2 shared field formats).

function fmtDate(iso) {
  if (!iso) return "–";
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" });
}
function daysUntil(iso) {
  if (!iso) return null;
  const diff = Math.ceil((new Date(iso + "T00:00:00") - new Date().setHours(0,0,0,0)) / 86400000);
  return diff;
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function ApptModal({ appt, onSave, onClose }) {
  const [form, setForm] = useState({ ...BLANK, ...appt });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isNew = !form.id;

  // UI-29: closing a dirty form prompts before discarding.
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const initialRef = useRef(JSON.stringify({ ...BLANK, ...appt }));
  const dirty = JSON.stringify(form) !== initialRef.current;
  const requestClose = () => { if (dirty) setConfirmDiscard(true); else onClose(); };

  // Load care team for auto-fill
  const careTeam = (() => {
    try { return JSON.parse(localStorage.getItem("mi_care_team") || "[]"); } catch { return []; }
  })();

  // Quick-add a provider to the care team without leaving the appointment.
  // The overlay renders above this modal, so the in-progress form is untouched;
  // saving writes mi_care_team (fresh read — never a stale base) and drops the
  // new member straight into the provider field.
  const [quickAdd, setQuickAdd] = useState(null); // null | {name, role, specialty, facility, phone}
  const setQA = (k, v) => setQuickAdd(q => ({ ...q, [k]: v }));
  const openQuickAdd = () => setQuickAdd({
    name: form.provider || "", role: "", specialty: form.specialty || "",
    facility: form.facility || "", phone: "",
  });
  const saveQuickAdd = () => {
    const name = (quickAdd.name || "").trim();
    if (!name) return;
    let fresh = [];
    try { fresh = JSON.parse(localStorage.getItem("mi_care_team") || "[]"); } catch {}
    const member = {
      id: Date.now(), name,
      role: (quickAdd.role || "").trim(),
      specialty: quickAdd.specialty || "",
      facility: (quickAdd.facility || "").trim(),
      address: "", phone: (quickAdd.phone || "").trim(), phone24: "", email: "",
      pcp: false, color: "#4f8ef7",
    };
    try { localStorage.setItem("mi_care_team", JSON.stringify([...fresh, member])); } catch {}
    // Emergency-card selection defaults to all when unset; only an explicit
    // list needs the new name appended (mirrors Care Team's handleSaveDoc).
    try {
      const sel = JSON.parse(localStorage.getItem("mi_care_team_selected") || "null");
      if (Array.isArray(sel)) localStorage.setItem("mi_care_team_selected", JSON.stringify([...new Set([...sel, name])]));
    } catch {}
    setForm(f => ({
      ...f,
      provider:  name,
      specialty: f.specialty || member.specialty,
      phone:     f.phone     || formatPhone(member.phone),
      facility:  f.facility  || member.facility,
    }));
    setQuickAdd(null);
  };

  // When the provider field loses focus, try to auto-fill phone/address from care team.
  // Uses scored matching so "Dr. Clay Thames" won't accidentally match "Dr. Stone Thames"
  // just because they share a last name.
  const handleProviderBlur = () => {
    const match = matchCareTeamMember(form.provider, careTeam);
    if (!match) return;
    setForm(f => ({
      ...f,
      specialty: f.specialty || match.specialty || "",
      phone:     f.phone     || formatPhone(match.phone || ""),
      facility:  f.facility  || match.facility || "",
      address:   f.address   || match.address  || "",
    }));
  };

  const handleSave = () => {
    if (!form.title || !form.date) return;
    onSave({ ...form, id: form.id || genId() });
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ position:"relative", background:"#0b1220", border:"1px solid #1a2f4a", borderRadius:16, width:"100%", maxWidth:620, maxHeight:"90vh", overflowY:"auto", padding:28 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:22 }}>
          <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:22, color:"#dde8f5", fontWeight:400 }}>
            {isNew ? "New Appointment" : "Edit Appointment"}
          </h2>
          <button onClick={requestClose} aria-label="Close" style={{ background:"none", border:"none", color:"#7eb8d8", fontSize:18, cursor:"pointer" }}>✕</button>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
          {/* Title */}
          <div style={{ gridColumn:"1/-1" }}>
            <label style={lbl}>Appointment Title *</label>
            <input style={inp} placeholder="e.g. Nephrology Follow-up" value={form.title} onChange={e=>set("title",e.target.value)} />
          </div>
          {/* Provider */}
          <div>
            <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between" }}>
              <label style={lbl}>Provider / Doctor</label>
              <button
                onClick={openQuickAdd}
                style={{ background:"none", border:"none", color:"#6ea3ff", fontFamily:"'Sora',sans-serif", fontSize:12, cursor:"pointer", padding:0, marginBottom:5 }}
              >+ Add to Care Team</button>
            </div>
            <input style={inp} placeholder="e.g. Dr. Ari Cohen" value={form.provider} onChange={e=>set("provider",e.target.value)} onBlur={handleProviderBlur} />
          </div>
          {/* Specialty */}
          <div>
            <label style={lbl}>Specialty</label>
            <select style={inp} value={form.specialty} onChange={e=>set("specialty",e.target.value)}>
              <option value="">Select…</option>
              {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {/* Facility */}
          <div style={{ gridColumn:"1/-1" }}>
            <label style={lbl}>Facility / Location</label>
            <input style={inp} placeholder="e.g. Ochsner Medical Center" value={form.facility} onChange={e=>set("facility",e.target.value)} />
          </div>
          {/* Address */}
          <div style={{ gridColumn:"1/-1" }}>
            <label style={lbl}>Address</label>
            <input style={inp} placeholder="Street, City, State ZIP" value={form.address} onChange={e=>set("address",e.target.value)} />
          </div>
          {/* Date */}
          <div>
            <label style={lbl}>Date *</label>
            <input style={inp} type="date" value={form.date} onChange={e=>set("date",e.target.value)} />
          </div>
          {/* Time */}
          <div>
            <label style={lbl}>Time</label>
            <select style={inp} value={form.time} onChange={e=>set("time",e.target.value)}>
              <option value="">Select time…</option>
              {["7:00 AM","7:15 AM","7:30 AM","7:45 AM",
                "8:00 AM","8:15 AM","8:30 AM","8:45 AM",
                "9:00 AM","9:15 AM","9:30 AM","9:45 AM",
                "10:00 AM","10:15 AM","10:30 AM","10:45 AM",
                "11:00 AM","11:15 AM","11:30 AM","11:45 AM",
                "12:00 PM","12:15 PM","12:30 PM","12:45 PM",
                "1:00 PM","1:15 PM","1:30 PM","1:45 PM",
                "2:00 PM","2:15 PM","2:30 PM","2:45 PM",
                "3:00 PM","3:15 PM","3:30 PM","3:45 PM",
                "4:00 PM","4:15 PM","4:30 PM","4:45 PM",
                "5:00 PM","5:15 PM","5:30 PM","5:45 PM",
                "6:00 PM","6:15 PM","6:30 PM","6:45 PM",
                "7:00 PM","7:30 PM","8:00 PM",
              ].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {/* Phone */}
          <div>
            <label style={lbl}>Phone</label>
            <input style={inp} placeholder="(601)555-0000" value={form.phone} onChange={e=>set("phone",formatPhone(e.target.value))} />
          </div>
          {/* Urgency */}
          <div>
            <label style={lbl}>Priority</label>
            <select style={inp} value={form.urgency} onChange={e=>set("urgency",e.target.value)}>
              <option value="high">High</option>
              <option value="med">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          {/* Status */}
          <div>
            <label style={lbl}>Status</label>
            <select style={inp} value={form.status} onChange={e=>set("status",e.target.value)}>
              <option value="upcoming">Upcoming</option>
              <option value="suggested">Suggested</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          {/* Prep */}
          <div>
            <label style={lbl}>Prep Instructions</label>
            <input style={inp} placeholder="e.g. Fast 8 hours" value={form.prepInstructions} onChange={e=>set("prepInstructions",e.target.value)} />
          </div>
          {/* Notes */}
          <div style={{ gridColumn:"1/-1" }}>
            <label style={lbl}>Notes</label>
            <textarea style={{ ...inp, height:76, resize:"vertical" }} placeholder="Questions to ask, things to bring, etc." value={form.notes} onChange={e=>set("notes",e.target.value)} />
          </div>
        </div>

        <div style={{ display:"flex", gap:10, marginTop:20 }}>
          <button
            onClick={handleSave}
            disabled={!form.title || !form.date}
            style={{ flex:1, padding:"10px 0", background:"rgba(79,142,247,.18)", border:"1px solid rgba(79,142,247,.45)", borderRadius:9, color:"#7eb8d8", fontFamily:"'Sora',sans-serif", fontSize:13, fontWeight:600, cursor:"pointer" }}
          >
            {isNew ? "Add Appointment" : "Save Changes"}
          </button>
          <button onClick={requestClose} style={{ padding:"10px 20px", background:"transparent", border:"1px solid #1a2f4a", borderRadius:9, color:"#b0c4d8", fontFamily:"'Sora',sans-serif", fontSize:13, cursor:"pointer" }}>
            Cancel
          </button>
        </div>

        {/* Quick-add provider overlay — the appointment form stays mounted beneath */}
        {quickAdd && (
          <div role="dialog" aria-modal="true" aria-label="Add care team member" style={{ position:"fixed", inset:0, zIndex:1002, background:"rgba(8,12,20,.88)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
            <div style={{ background:"#0b1220", border:"1px solid #1a2f4a", borderRadius:14, width:"100%", maxWidth:440, padding:24 }}>
              <h3 style={{ fontFamily:"'DM Serif Display',serif", fontSize:18, color:"#dde8f5", fontWeight:400, marginBottom:6 }}>Add to Care Team</h3>
              <div style={{ fontSize:12, color:"#98afc4", fontFamily:"'Sora',sans-serif", marginBottom:16 }}>
                Saves this provider to your Care Team and returns you to the appointment. Address, email, and other details can be added later on the Care Team tab.
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div style={{ gridColumn:"1/-1" }}>
                  <label style={lbl}>Name *</label>
                  <input style={inp} placeholder="e.g. Dr. Ari Cohen" value={quickAdd.name} onChange={e=>setQA("name",e.target.value)} autoFocus />
                </div>
                <div>
                  <label style={lbl}>Role</label>
                  <input style={inp} placeholder="e.g. Hepatologist" value={quickAdd.role} onChange={e=>setQA("role",e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>Specialty</label>
                  <select style={inp} value={quickAdd.specialty} onChange={e=>setQA("specialty",e.target.value)}>
                    <option value="">Select…</option>
                    {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Facility</label>
                  <input style={inp} placeholder="e.g. Ochsner Medical Center" value={quickAdd.facility} onChange={e=>setQA("facility",e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>Phone</label>
                  <input style={inp} placeholder="(601)555-0000" value={quickAdd.phone} onChange={e=>setQA("phone",formatPhone(e.target.value))} />
                </div>
              </div>
              <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:18 }}>
                <button onClick={() => setQuickAdd(null)} style={{ padding:"8px 18px", background:"transparent", border:"1px solid #1a2f4a", borderRadius:8, color:"#b0c4d8", fontFamily:"'Sora',sans-serif", fontSize:12, cursor:"pointer" }}>Cancel</button>
                <button
                  onClick={saveQuickAdd}
                  disabled={!(quickAdd.name || "").trim()}
                  style={{ padding:"8px 18px", background:"rgba(79,142,247,.18)", border:"1px solid rgba(79,142,247,.45)", borderRadius:8, color:"#7eb8d8", fontFamily:"'Sora',sans-serif", fontSize:12, fontWeight:600, cursor:"pointer", opacity:(quickAdd.name || "").trim() ? 1 : .5 }}
                >Save &amp; use in appointment</button>
              </div>
            </div>
          </div>
        )}

        {/* UI-29: discard prompt for a dirty form */}
        {confirmDiscard && (
          <div role="alertdialog" aria-modal="true" aria-label="Discard unsaved changes?" style={{ position:"fixed", inset:0, zIndex:1001, background:"rgba(8,12,20,.88)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:16, color:"#dde8f5", marginBottom:8 }}>Discard unsaved changes?</div>
              <div style={{ fontSize:12, color:"#98afc4", marginBottom:18 }}>This appointment has changes that haven't been saved.</div>
              <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
                <button onClick={() => setConfirmDiscard(false)} style={{ padding:"9px 18px", background:"rgba(79,142,247,.18)", border:"1px solid rgba(79,142,247,.45)", borderRadius:9, color:"#7eb8d8", fontFamily:"'Sora',sans-serif", fontSize:12, fontWeight:600, cursor:"pointer" }}>Keep editing</button>
                <button onClick={onClose} style={{ padding:"9px 18px", background:"transparent", border:"1px solid #1a2f4a", borderRadius:9, color:"#b0c4d8", fontFamily:"'Sora',sans-serif", fontSize:12, cursor:"pointer" }}>Discard</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const lbl = { display:"block", fontSize:12, color:"#a0b4c8", fontFamily:"'DM Mono',monospace", letterSpacing:"0.8px", textTransform:"uppercase", marginBottom:5 };
const inp = { width:"100%", background:"#080c14", border:"1px solid #1a2f4a", borderRadius:8, padding:"9px 12px", color:"#c4d8ee", fontFamily:"'Sora',sans-serif", fontSize:12, outline:"none" };

// ── Keyword / date extractor for smart record matching ───────────────────────
const STOP_WORDS = new Set([
  "the","and","for","with","from","this","that","have","will","been","were","your",
  "about","what","when","which","they","their","there","here","also","any","all",
  "our","you","how","can","not","but","are","was","has","its","may","than","then",
  "into","over","after","during","would","should","could","just","each","more",
  "very","some","make","like","need","ask","help","use","per","via","my","is","in",
  "at","to","of","on","or","be","do","if","so","by","an","as","it","me","we","he",
  "she","him","her","his","hers","them","us","get","got","let","now","see","did",
  "new","old","day","days","week","weeks","month","months","year","years","time",
  "please","provide","bring","discuss","prepare","relevant","current","recent",
  "upcoming","appointment","medical","visit","doctor","specialist","follow","up",
]);

function extractSearchTerms(text) {
  if (!text) return { keywords: [], dates: [] };

  // Date patterns: 1/5/24, 01/05/2024, Jan 2024, January 2024, 2024-01-05, etc.
  const dateRe = /\b(?:\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{2,4}|\d{4}[\/\-]\d{2}[\/\-]\d{2})\b/gi;
  const dates = (text.match(dateRe) || []).map(d => d.toLowerCase());

  // Keywords: words > 3 chars, not stop words, letters only (captures "tacrolimus", "MRI", "knee", etc.)
  const keywords = text
    .split(/[\s\-\/,;:.!?()\[\]]+/)
    .map(w => w.replace(/[^a-zA-Z0-9]/g, "").toLowerCase())
    .filter(w => w.length > 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));

  return { keywords: [...new Set(keywords)], dates: [...new Set(dates)] };
}

function scoreMatch(text, keywords, dates) {
  if (!text) return 0;
  const lower = text.toLowerCase();
  let score = 0;
  for (const kw of keywords) if (lower.includes(kw)) score += 1;
  for (const dt of dates)    if (lower.includes(dt))  score += 2; // dates are stronger signals
  return score;
}

/**
 * Build a "RELEVANT RECORDS" section by searching all stored records for
 * items matching keywords/dates extracted from the appointment context.
 */
function buildDocContext(searchText) {
  const { keywords, dates } = extractSearchTerms(searchText);
  if (!keywords.length && !dates.length) return "";

  const sections = [];

  // ── Matching documents ───────────────────────────────────────────────────
  try {
    const refDocs  = JSON.parse(localStorage.getItem("mi_ref_docs")  || "[]");
    const fullDocs = JSON.parse(localStorage.getItem("mi_documents")  || "[]");

    // Build a lookup: fullDoc by id
    const fullById = new Map(fullDocs.map(d => [d.id, d]));

    const matched = [];
    for (const rd of refDocs) {
      const nameScore = scoreMatch(rd.name || "", keywords, dates);
      const dateScore = scoreMatch(rd.addedDate || "", keywords, dates);
      if (nameScore + dateScore === 0) continue;

      // Try to get extractedText from fullDocs first
      const full = fullById.get(rd.id);
      const body = full?.extractedText || rd.text || "";  // fall back to AI summary

      if (body) matched.push({ id: rd.id, name: rd.name, date: rd.addedDate, body });
    }

    // Also check fullDocs not in refDocs
    for (const fd of fullDocs) {
      if (refDocs.find(r => r.id === fd.id)) continue; // already handled
      const titleScore = scoreMatch(fd.title || "", keywords, dates);
      const dateScore  = scoreMatch(fd.studyDate || "", keywords, dates);
      if (titleScore + dateScore === 0) continue;
      if (fd.extractedText) {
        matched.push({ id: fd.id, name: fd.title, date: fd.studyDate, body: fd.extractedText });
      }
    }

    for (const doc of matched) {
      sections.push(formatDocumentBlock({ id: doc.id, source: doc.name, date: doc.date, text: doc.body, maxLength: 3000 }));
    }
  } catch {}

  // ── Matching conditions ──────────────────────────────────────────────────
  try {
    const conditions = JSON.parse(localStorage.getItem("mi_conditions") || "[]");
    const matched = conditions.filter(c => scoreMatch(
      `${c.name || ""} ${c.notes || ""} ${c.category || ""}`, keywords, dates
    ) > 0);
    for (const c of matched) {
      const parts = [c.name];
      if (c.diagnosedDate) parts.push(`diagnosed ${c.diagnosedDate}`);
      if (c.status)        parts.push(`status: ${c.status}`);
      if (c.notes)         parts.push(`notes: ${c.notes}`);
      sections.push(`Condition: ${parts.join(" | ")}`);
    }
  } catch {}

  // ── Matching surgeries ───────────────────────────────────────────────────
  try {
    const surgeries = JSON.parse(localStorage.getItem("mi_surgeries") || "[]");
    const matched = surgeries.filter(s => scoreMatch(
      `${s.procedure || ""} ${s.notes || ""} ${s.outcome || ""}`, keywords, dates
    ) > 0);
    for (const s of matched) {
      const parts = [s.procedure || s.name];
      if (s.date)    parts.push(`date: ${s.date}`);
      if (s.outcome) parts.push(`outcome: ${s.outcome}`);
      if (s.notes)   parts.push(`notes: ${s.notes}`);
      sections.push(`Surgery: ${parts.join(" | ")}`);
    }
  } catch {}

  if (!sections.length) return "";
  return `\n\nRELEVANT RECORDS (referenced in this appointment):\n${sections.map((s,i) => `\n[${i+1}] ${s}`).join("\n")}`;
}

// ── Appointment attachments (documents, imaging, notes, prep) ────────────────
const ATT_META = {
  document: { icon: "▣", label: "Document",  color: "#4f8ef7", nav: "documents" },
  imaging:  { icon: "◍", label: "Diagnostic", color: "#a78bfa", nav: "diagnostics" },
  note:     { icon: "◻", label: "Note",      color: "#10b981", nav: "notes"     },
  record:   { icon: "▤", label: "Record",    color: "#b0c4d8", nav: "records"   },
  prep:     { icon: "✦", label: "Consultation Prep", color: "#f59e0b", nav: null },
};

/** Pull all attachable records (documents, imaging studies, notes, clinical records) from storage. */
function loadAttachables() {
  const safe = k => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };
  const docs    = safe("mi_documents").map(d => ({ type: "document", refId: d.id, title: d.title || "Untitled document", date: d.date || d.studyDate || "" }));
  const imaging = safe("mi_diagnostics").map(i => ({ type: "imaging", refId: i.id, title: i.name || [i.type, i.bodyPart].filter(Boolean).join(": ") || "Diagnostic study", date: i.date || "" }));
  const notes   = safe("mi_notes").map(n => ({ type: "note", refId: n.id, title: n.title || "Note", date: n.date || "" }));
  const records = safe("mi_records").map(r => ({ type: "record", refId: r.id, title: r.title || "Untitled record", date: r.date || "" }));
  return [...docs, ...imaging, ...notes, ...records];
}

/** Does an item look related to this appointment? (keyword/date match or within 14 days) */
function attSuggested(item, appt) {
  const { keywords, dates } = extractSearchTerms([appt.title, appt.provider, appt.specialty, appt.facility].filter(Boolean).join(" "));
  if (scoreMatch(`${item.title} ${item.date}`, keywords, dates) > 0) return true;
  if (item.date && appt.date) {
    const diff = Math.abs(new Date(item.date) - new Date(appt.date)) / 86400000;
    if (!isNaN(diff) && diff <= 14) return true;
  }
  return false;
}

const attKey = a => `${a.type}:${a.refId}`;

function AttachModal({ appt, onSave, onClose }) {
  const items = loadAttachables();
  const [sel, setSel] = useState(() => new Set((appt.attachments || []).map(attKey)));
  const toggle = item => setSel(s => { const n = new Set(s); const k = attKey(item); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const suggested = items.filter(i => attSuggested(i, appt));
  // v1.56.0 (Greg): after the suggestions, everything else pages ten at a
  // time, newest first, behind a Load More — the Save button stays reachable
  // instead of sitting under the entire library.
  const others = items.filter(i => !attSuggested(i, appt))
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  const [othersShown, setOthersShown] = useState(10);

  const Row = ({ item }) => {
    const m = ATT_META[item.type];
    const checked = sel.has(attKey(item));
    return (
      <div onClick={() => toggle(item)} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 11px", borderRadius:8, background: checked ? "rgba(79,142,247,.10)" : "#080c14", border:`1px solid ${checked ? "rgba(79,142,247,.35)" : "#1c2a40"}`, marginBottom:6, cursor:"pointer" }}>
        <input type="checkbox" readOnly checked={checked} style={{ width:14, height:14 }} />
        <span style={{ color:m.color, fontSize:13 }}>{m.icon}</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:12, color:"#c4d8ee", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{item.title}</div>
          <div style={{ fontSize:12, color:"#98afc4", fontFamily:"'DM Mono',monospace" }}>{m.label}{item.date ? ` · ${formatDateUS(item.date)}` : ""}</div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:1100, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:"#0b1220", border:"1px solid #1a2f4a", borderRadius:16, width:"100%", maxWidth:520, maxHeight:"88vh", overflowY:"auto", padding:24 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
          <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:20, color:"#dde8f5", fontWeight:400 }}>Attach Records</h2>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#7eb8d8", fontSize:18, cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ fontSize:12, color:"#98afc4", fontFamily:"'DM Mono',monospace", marginBottom:16 }}>Tie documents, imaging, notes, or clinical records to &ldquo;{appt.title}&rdquo;.</div>

        {items.length === 0 && <div style={{ fontSize:12, color:"#98afc4", textAlign:"center", padding:"24px 0" }}>No documents, imaging, or notes saved yet.</div>}

        {suggested.length > 0 && <>
          <div style={{ fontSize:12, color:"#f59e0b", fontFamily:"'DM Mono',monospace", letterSpacing:"1px", textTransform:"uppercase", margin:"4px 0 8px" }}>✦ Suggested (matches date / provider)</div>
          {suggested.map(i => <Row key={attKey(i)} item={i} />)}
        </>}
        {others.length > 0 && <>
          <div style={{ fontSize:12, color:"#a0b4c8", fontFamily:"'DM Mono',monospace", letterSpacing:"1px", textTransform:"uppercase", margin:"14px 0 8px" }}>
            All records: newest first{others.length > othersShown ? ` (showing ${Math.min(othersShown, others.length)} of ${others.length})` : ""}
          </div>
          {others.slice(0, othersShown).map(i => <Row key={attKey(i)} item={i} />)}
          {others.length > othersShown && (
            <button onClick={() => setOthersShown(n => n + 10)}
              style={{ width:"100%", padding:"8px 0", background:"transparent", border:"1px dashed #1a2f4a", borderRadius:8, color:"#7eb8d8", fontFamily:"'DM Mono',monospace", fontSize:12, cursor:"pointer", marginBottom:6 }}>
              Load 10 more ({others.length - othersShown} remaining)
            </button>
          )}
        </>}

        <div style={{ display:"flex", gap:10, marginTop:18 }}>
          <button onClick={() => { const byKey = new Map(items.map(i => [attKey(i), i])); onSave([...sel].map(k => byKey.get(k)).filter(Boolean).map(i => ({ type:i.type, refId:i.refId, title:i.title, date:i.date }))); }}
            style={{ flex:1, padding:"10px 0", background:"rgba(79,142,247,.18)", border:"1px solid rgba(79,142,247,.45)", borderRadius:9, color:"#7eb8d8", fontFamily:"'Sora',sans-serif", fontSize:13, fontWeight:600, cursor:"pointer" }}>
            Save Attachments
          </button>
          <button onClick={onClose} style={{ padding:"10px 20px", background:"transparent", border:"1px solid #1a2f4a", borderRadius:9, color:"#b0c4d8", fontFamily:"'Sora',sans-serif", fontSize:13, cursor:"pointer" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/** The "Records & Documents" block shown inside an appointment's expanded detail. */
function ApptDocuments({ appt, onAttach, onDetach, onOpen, onViewPrep }) {
  const prep = loadVisitPrep(appt.id);
  const atts = appt.attachments || [];
  return (
    <div style={{ marginTop:14, background:"#080c14", border:"1px solid #1c2a40", borderRadius:10, padding:"14px 16px" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
        <span style={{ fontSize:12, color:"#a0b4c8", fontFamily:"'DM Mono',monospace", letterSpacing:"1px", textTransform:"uppercase" }}>Records &amp; Documents</span>
        <button className="apt-btn" style={{ background:"rgba(79,142,247,.10)", borderColor:"rgba(79,142,247,.3)", color:"#7eb8d8", padding:"5px 11px" }} onClick={onAttach}>+ Attach</button>
      </div>

      {prep && (
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", borderRadius:8, background:"rgba(245,158,11,.06)", border:"1px solid rgba(245,158,11,.2)", marginBottom:6 }}>
          <span style={{ color:ATT_META.prep.color, fontSize:13 }}>✦</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12, color:"#c4d8ee" }}>Consultation Prep</div>
            <div style={{ fontSize:12, color:"#98afc4", fontFamily:"'DM Mono',monospace" }}>AI-generated prep for this visit</div>
          </div>
          <button onClick={onViewPrep} style={{ background:"none", border:"none", color:"#f59e0b", fontSize:12, cursor:"pointer", fontFamily:"'DM Mono',monospace" }}>⎙ View</button>
        </div>
      )}

      {atts.length === 0 && !prep && (
        <div style={{ fontSize:12, color:"#98afc4", fontFamily:"'DM Mono',monospace", padding:"6px 0" }}>No records attached yet. Use "+ Attach" to link documents, imaging, or notes.</div>
      )}

      {atts.map(att => {
        const m = ATT_META[att.type] || ATT_META.document;
        return (
          <div key={attKey(att)} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", borderRadius:8, background:"#0b1220", border:"1px solid #1c2a40", marginBottom:6 }}>
            <span style={{ color:m.color, fontSize:13 }}>{m.icon}</span>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, color:"#c4d8ee", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{att.title}</div>
              <div style={{ fontSize:12, color:"#98afc4", fontFamily:"'DM Mono',monospace" }}>{m.label}{att.date ? ` · ${formatDateUS(att.date)}` : ""}</div>
            </div>
            {m.nav && <button onClick={() => onOpen(att)} title={`Open in ${m.label}`} style={{ background:"none", border:"none", color:"#7eb8d8", fontSize:12, cursor:"pointer", fontFamily:"'DM Mono',monospace" }}>↗ Open</button>}
            <button onClick={() => onDetach(att)} title="Detach" style={{ background:"none", border:"none", color:"#6b7a8d", fontSize:13, cursor:"pointer" }}>✕</button>
          </div>
        );
      })}
    </div>
  );
}

// ── Post-visit capture: write helpers ────────────────────────────────────────
// Each returns an attachment entry ({ type, refId, title, date }) so the caller
// can tie the freshly-captured record to the appointment. Writes go straight to
// the same mi_* stores the dedicated tabs use, so nothing has to be re-entered.

function fmtDocDate(iso) {
  const d = iso ? new Date(iso + "T12:00:00") : new Date();
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Lightweight text extraction for PDFs (mirrors Tab09/Tab12; no AI round-trip).
async function extractPdfText(file) {
  try {
    const pdfjsLib = await loadPdfjs();
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pt = content.items.map(x => x.str).join(" ").trim();
      if (pt) text += `\n--- Page ${i} ---\n${pt}`;
    }
    return text.trim();
  } catch { return ""; }
}

// Upload → mi_documents. Images are compressed to a data URL; text-PDFs get their
// text pulled inline so the document is searchable without a trip to the AI.
async function captureDocument({ file, title, category, apptDate }) {
  const isImg = file?.type?.startsWith("image/");
  const isPdf = file?.type === "application/pdf";
  let image = "", extractedText = "";
  if (isImg)      image = await compressImage(file);
  else if (isPdf) extractedText = await extractPdfText(file);

  const doc = {
    id:                `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title:             (title || "").trim() || "Visit document",
    category,
    date:              fmtDocDate(apptDate),
    source:            "Appointment",
    sourceColor:       "#4f8ef7",
    provider:          "Appointment",
    type:              file?.type || "Document",
    pages:             "–",
    tags:              [],
    flagged:           false,
    isRef:             false,
    isScanned:         false,
    image,
    extractedText,
    extracted:         !!extractedText,
    findingsExtracted: false,
    preview:           image ? "[Image captured at visit]"
                     : extractedText ? extractedText.slice(0, 3000)
                     : `File: ${file?.name || "–"}`,
    fileSize:          file ? `${(file.size / 1024).toFixed(1)} KB` : "–",
    uploadedAt:        new Date().toISOString(),
  };
  const docs = (() => { try { return JSON.parse(localStorage.getItem("mi_documents") || "[]"); } catch { return []; } })();
  localStorage.setItem("mi_documents", JSON.stringify([doc, ...docs]));   // may throw QuotaExceededError
  return { type: "document", refId: doc.id, title: doc.title, date: doc.date };
}

// Imaging → mi_diagnostics (the Diagnostics tab's shape — observational studies
// live there now). An uploaded image is compressed onto the record; the
// metadata is what Profile and the Diagnostics tab list.
async function captureImaging({ imgType, bodyPart, facility, apptDate, file }) {
  let image = "";
  if (file?.type?.startsWith("image/")) image = await compressImage(file);
  const rec = {
    id: Date.now(),
    name: [imgType, (bodyPart || "").trim()].filter(Boolean).join(": ") || "Imaging study",
    date: apptDate || "", orderedBy: "", readingProvider: "", impression: "",
    relatedCondition: "", facility: facility || "", ...(image ? { image } : {}),
  };
  setDiagnostics([rec, ...getDiagnostics()]);   // may throw QuotaExceededError
  return { type: "imaging", refId: rec.id, title: rec.name, date: rec.date };
}

// Condition → mi_conditions (matches Tab15's BLANK). Also refreshes the
// mi_conditions_summary that the Dashboard + AI read.
function captureCondition({ name, status, diagnosedDate, provider }) {
  const rec = {
    id: genId(), name: (name || "").trim(), icd10: "", diagnosedDate: diagnosedDate || "",
    provider: provider || "", status: status || "active", severity: "moderate", notes: "",
  };
  const list = (() => { try { return JSON.parse(localStorage.getItem("mi_conditions") || "[]"); } catch { return []; } })();
  const next = [rec, ...list];
  localStorage.setItem("mi_conditions", JSON.stringify(next));
  localStorage.setItem("mi_conditions_summary", JSON.stringify(next.filter(c => c.status === "active").map(c => c.name)));
  return { type: "condition", refId: rec.id, title: rec.name, date: rec.diagnosedDate };
}

// Medication → mi_meds_full (matches the rich Tab04 med shape, minimal fields).
function captureMedication({ name, dose, frequency, prescriber, refillDate }) {
  const rec = {
    id: Date.now(), name: (name || "").trim(), brand: "", dose: dose || "", frequency: frequency || "",
    prescriber: prescriber || "", refillDate: refillDate || "", status: "active", category: "", color: "#a78bfa",
  };
  setMedsFull([rec, ...getMedsFull()]);
  return { type: "medication", refId: rec.id, title: [rec.name, rec.dose].filter(Boolean).join(" "), date: "" };
}

// ── Post-visit capture: inline forms ─────────────────────────────────────────
const pvField = { ...inp, marginBottom: 8 };
const pvSaveBtn = (enabled) => ({
  width: "100%", padding: "9px 0", borderRadius: 8, fontFamily: "'Sora',sans-serif", fontSize: 12, fontWeight: 600,
  cursor: enabled ? "pointer" : "not-allowed", opacity: enabled ? 1 : 0.5,
  background: "rgba(16,185,129,.12)", border: "1px solid rgba(16,185,129,.35)", color: "#2dd4a0",
});
const fileInp = {
  width: "100%", fontSize: 12, color: "#a8c4dc", fontFamily: "'DM Mono',monospace", marginBottom: 8,
  background: "#080c14", border: "1px solid #1a2f4a", borderRadius: 8, padding: "8px 10px",
};

function FileCaptureForm({ appt, category, accept, hint, onCapture, busy }) {
  const [file, setFile]   = useState(null);
  const [title, setTitle] = useState("");
  const canSave = !!file && title.trim() && !busy;
  return (
    <div>
      <input type="file" accept={accept} disabled={busy} style={fileInp}
        onChange={e => { const f = e.target.files?.[0]; if (!f) return; setFile(f); if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ")); }} />
      <input style={pvField} placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} disabled={busy} />
      {hint && <div style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono',monospace", marginBottom: 8 }}>{hint}</div>}
      <button disabled={!canSave} style={pvSaveBtn(canSave)}
        onClick={() => onCapture(() => captureDocument({ file, title, category, apptDate: appt.date }))}>
        {busy ? "Saving…" : "✓ Save & Attach"}
      </button>
    </div>
  );
}

function ImagingCaptureForm({ appt, onCapture, busy }) {
  const [imgType, setImgType]   = useState("MRI");
  const [bodyPart, setBodyPart] = useState("");
  const [file, setFile]         = useState(null);
  const canSave = bodyPart.trim() && !busy;
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <select style={inp} value={imgType} onChange={e => setImgType(e.target.value)} disabled={busy}>
          {["MRI", "CT", "X-ray", "Ultrasound", "PET", "Mammogram", "Other"].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input style={inp} placeholder="Body part (e.g. Right Knee)" value={bodyPart} onChange={e => setBodyPart(e.target.value)} disabled={busy} />
      </div>
      <input type="file" accept="image/*" disabled={busy} style={fileInp}
        onChange={e => setFile(e.target.files?.[0] || null)} />
      <div style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono',monospace", marginBottom: 8 }}>Optional image is compressed. Facility &amp; date auto-fill from this visit.</div>
      <button disabled={!canSave} style={pvSaveBtn(canSave)}
        onClick={() => onCapture(() => captureImaging({ imgType, bodyPart, facility: appt.facility, apptDate: appt.date, file }))}>
        {busy ? "Saving…" : "✓ Save & Attach"}
      </button>
    </div>
  );
}

function ConditionCaptureForm({ appt, onCapture, busy }) {
  const [name, setName]     = useState("");
  const [status, setStatus] = useState("active");
  const [date, setDate]     = useState(appt.date || "");
  const canSave = name.trim() && !busy;
  return (
    <div>
      <input style={pvField} placeholder="Condition / diagnosis" value={name} onChange={e => setName(e.target.value)} disabled={busy} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <select style={inp} value={status} onChange={e => setStatus(e.target.value)} disabled={busy}>
          <option value="active">Active</option>
          <option value="managed">Managed</option>
          <option value="resolved">Resolved</option>
        </select>
        <input style={inp} type="date" value={date} onChange={e => setDate(e.target.value)} disabled={busy} />
      </div>
      <button disabled={!canSave} style={pvSaveBtn(canSave)}
        onClick={() => onCapture(() => captureCondition({ name, status, diagnosedDate: date, provider: appt.provider }))}>
        {busy ? "Saving…" : "✓ Save & Attach"}
      </button>
    </div>
  );
}

function MedCaptureForm({ appt, onCapture, busy }) {
  const [name, setName]           = useState("");
  const [dose, setDose]           = useState("");
  const [frequency, setFrequency] = useState("");
  const canSave = name.trim() && !busy;
  return (
    <div>
      <input style={pvField} placeholder="Medication name" value={name} onChange={e => setName(e.target.value)} disabled={busy} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <input style={inp} placeholder="Dose (e.g. 3 mg)" value={dose} onChange={e => setDose(e.target.value)} disabled={busy} />
        <input style={inp} placeholder="Frequency (e.g. Twice daily)" value={frequency} onChange={e => setFrequency(e.target.value)} disabled={busy} />
      </div>
      <button disabled={!canSave} style={pvSaveBtn(canSave)}
        onClick={() => onCapture(() => captureMedication({ name, dose, frequency, prescriber: appt.provider }))}>
        {busy ? "Saving…" : "✓ Save & Attach"}
      </button>
    </div>
  );
}

// ── Post-visit capture prompt (shown once on Mark Complete) ──────────────────
// One prompt for the whole visit: expand a row, fill it in, and it writes to the
// right mi_* store and auto-attaches to this appointment — no tab-hopping.
function PostVisitModal({ appt, onCaptured, onClose }) {
  const [openRow, setOpenRow] = useState(null);
  const [captured, setCaptured] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState("");

  const runCapture = async (captureFn) => {
    setErr(""); setBusy(true);
    try {
      const attachment = await captureFn();
      onCaptured(attachment);                 // append to appt + dispatch mi-data-synced
      setCaptured(c => [...c, attachment]);
      setOpenRow(null);
      return true;
    } catch (e) {
      const quota = e?.name === "QuotaExceededError" || /quota|exceeded/i.test(String(e?.message || e));
      setErr(quota
        ? "Storage is full. Try a smaller image, or remove old documents first."
        : (e?.message || "Could not save. Please try again."));
      return false;
    } finally { setBusy(false); }
  };

  const capProps = { appt, onCapture: runCapture, busy };
  const rows = [
    { key: "documents", icon: "▣", label: "Clinical notes / documents", desc: "Visit summary, after-visit notes, letters.",
      form: <FileCaptureForm {...capProps} category="other" accept="image/*,application/pdf,.txt,.doc,.docx"
              hint="Photo or PDF: images are compressed, PDF text is pulled in automatically." /> },
    { key: "labs", icon: "◈", label: "Lab results", desc: "A lab report to keep with this visit.",
      form: <FileCaptureForm {...capProps} category="lab" accept="image/*,application/pdf"
              hint="Attach the lab PDF or a photo. Full value extraction stays in Import Records." /> },
    { key: "condition", icon: "◎", label: "New condition / diagnosis", desc: "Anything newly diagnosed at the visit.",
      form: <ConditionCaptureForm {...capProps} /> },
    { key: "medication", icon: "⬡", label: "New or changed medication", desc: "A new prescription or a dose change.",
      form: <MedCaptureForm {...capProps} /> },
    { key: "imaging", icon: "◍", label: "Imaging study", desc: "An MRI, CT, X-ray, or other scan.",
      form: <ImagingCaptureForm {...capProps} /> },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#0b1220", border: "1px solid #1a2f4a", borderRadius: 16, width: "100%", maxWidth: 540, maxHeight: "90vh", overflowY: "auto", padding: 26 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <h2 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 21, color: "#dde8f5", fontWeight: 400 }}>Visit complete ✓</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#7eb8d8", fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono',monospace", marginBottom: 16, lineHeight: 1.6 }}>
          Capture anything from &ldquo;{appt.title}&rdquo;? Add what applies below. Each item is saved and attached to this appointment automatically.
        </div>

        {err && <div style={{ fontSize: 12, color: "#f87171", fontFamily: "'DM Mono',monospace", marginBottom: 12 }}>⚠ {err}</div>}

        {rows.map(r => {
          const isOpen = openRow === r.key;
          return (
            <div key={r.key} style={{ background: "#080c14", border: `1px solid ${isOpen ? "rgba(79,142,247,.35)" : "#1c2a40"}`, borderRadius: 10, marginBottom: 8, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 12px", cursor: "pointer" }}
                   onClick={() => { setErr(""); setOpenRow(isOpen ? null : r.key); }}>
                <span style={{ color: "#7eb8d8", fontSize: 15 }}>{r.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "#c4d8ee", fontWeight: 600 }}>{r.label}</div>
                  <div style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono',monospace", marginTop: 2 }}>{r.desc}</div>
                </div>
                <button style={{ padding: "6px 14px", background: isOpen ? "transparent" : "rgba(79,142,247,.14)", border: `1px solid ${isOpen ? "#1a2f4a" : "rgba(79,142,247,.4)"}`, borderRadius: 8, color: "#7eb8d8", fontSize: 12, fontFamily: "'Sora',sans-serif", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                  {isOpen ? "Close" : "+ Add"}
                </button>
              </div>
              {isOpen && <div style={{ padding: "4px 12px 14px" }}>{r.form}</div>}
            </div>
          );
        })}

        {captured.length > 0 && (
          <div style={{ marginTop: 14, padding: "10px 12px", background: "rgba(16,185,129,.06)", border: "1px solid rgba(16,185,129,.2)", borderRadius: 10 }}>
            <div style={{ fontSize: 12, color: "#2dd4a0", fontFamily: "'DM Mono',monospace", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 8 }}>Attached to this visit</div>
            {captured.map((c, i) => {
              const m = ATT_META[c.type] || ATT_META.document;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12, color: "#c4d8ee", marginBottom: 4 }}>
                  <span style={{ color: m.color }}>{m.icon}</span>
                  <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.title || m.label}</span>
                  <span style={{ fontSize: 12, color: "#98afc4", fontFamily: "'DM Mono',monospace" }}>{m.label}</span>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button onClick={onClose} style={{ padding: "9px 22px", background: "rgba(16,185,129,.12)", border: "1px solid rgba(16,185,129,.35)", borderRadius: 9, color: "#2dd4a0", fontFamily: "'Sora',sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Done</button>
        </div>
      </div>
    </div>
  );
}

// ── AI Analysis Panel for an Appointment ────────────────────────────────────
function ApptAIPanel({ appt }) {
  const [additionalQ, setAdditionalQ] = useState("");
  const [analysis, setAnalysis]       = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [stale, setStale]             = useState(false);
  const sig = prepSig(appt);

  // DEC-046: reports the patient marked for this doctor — shown BEFORE
  // generating (the same transparency the AI tab's "Data used in this
  // analysis" panel gives), each with a one-tap exclude for this run.
  const [markedForVisit] = useState(() => {
    try { return markedReportsForAppointment(appt); } catch { return { reports: [], droppedCount: 0 }; }
  });
  const [excludedIds, setExcludedIds] = useState(() => new Set());
  const toggleExclude = (id) => setExcludedIds(prev => {
    const next = new Set(prev);
    const k = String(id);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });
  const includedReports = markedForVisit.reports.filter(r => !excludedIds.has(String(r.id)));

  // Load any prep already generated for this appointment (here or on the
  // companion, synced via Drive), so it shows without regenerating.
  useEffect(() => {
    const saved = loadVisitPrep(appt.id);
    if (saved?.text) { setAnalysis(saved.text); setStale(saved.sig !== sig); }
  }, [appt.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildPrompt = useCallback(() => {
    let ctx = "";
    try {
      const conditions = JSON.parse(localStorage.getItem("mi_conditions") || "[]");
      const meds = JSON.parse(localStorage.getItem("mi_meds_full") || "[]");
      if (conditions.length) ctx += `\nActive Conditions: ${conditions.map(c=>c.name).join(", ")}`;
      if (meds.length) ctx += `\nCurrent Medications: ${meds.filter(m=>m.status!=="inactive").map(m=>`${m.name} ${m.dose||""}`).join(", ")}`;
    } catch {}

    // Build search corpus from all appointment fields + user's additional questions
    const searchText = [
      appt.title, appt.specialty, appt.provider, appt.facility,
      appt.notes, appt.prepInstructions, additionalQ,
    ].filter(Boolean).join(" ");
    const docCtx = buildDocContext(searchText);

    const base = `Help me prepare for my upcoming ${appt.specialty || "medical"} appointment.
Appointment: ${appt.title}
Provider: ${appt.provider || "—"}${appt.specialty ? ` (${appt.specialty})` : ""}
Facility: ${appt.facility || "—"}
Date: ${fmtDate(appt.date)}${appt.prepInstructions ? `\nPrep Instructions: ${appt.prepInstructions}` : ""}${appt.notes ? `\nAppointment Notes: ${appt.notes}` : ""}${ctx}${docCtx}

Please provide:
1. What to discuss or ask during this appointment
2. What to bring or prepare
3. Any relevant concerns from my medical history to raise
4. Questions to ask about my current medications or conditions${additionalQ.trim() ? `\n\nAdditional questions: ${additionalQ}` : ""}`;
    // DEC-046: marked reports ride along as S-07 document blocks. Empty when
    // nothing is marked/included — the prompt is then byte-identical to the
    // pre-DEC-046 prompt.
    return base + buildMarkedReportsSection(includedReports);
  }, [appt, additionalQ, includedReports]);

  const runAnalysis = async () => {
    setLoading(true); setError(""); setAnalysis("");
    // DEC-048: demo visitors get the pre-generated sample for the seeded
    // appointments — a short generating pause, then the replay, savable and
    // printable like the real thing. Visitor-created appointments have no
    // sample and fall through to the standard demo AI-off path.
    const demoSample = isDemoMode() ? DEMO_PREP_REPORTS[String(appt.id)] : null;
    if (demoSample) {
      await new Promise(r => setTimeout(r, 1900));
      setAnalysis(demoSample);
      saveVisitPrep(appt.id, { text: demoSample, sig });
      setStale(false);
      setLoading(false);
      return;
    }
    try {
      const res = await callAI({
        surface: "appointments.prep",
        mode: "standard",
        // 2026-07-21 work order Part 1: Consultation Prep question output follows
        // the shared QUESTION GENERATION / WHY YOU'RE ASKING rules. This surface
        // still predates the A-09 builder architecture (no CSC — see surfaceH.js
        // scope note); migrating it fully is tracked in DECISIONS.md, not done here.
        system:[{ type:"text", text:"You are a personal health assistant helping prepare a patient for a medical appointment. Be direct, specific, and clinically relevant. No emojis. Bold section headers on their own line. Use bullet points for lists. Use ----- as section dividers. Only ask a clarifying question if the answer genuinely cannot be given without it. This should be rare; provide the best guidance possible with available information.\n\n" + QUESTION_RULES, cache_control:{ type:"ephemeral" } }],
        messages:[{ role:"user", content:buildPrompt() }],
      });
      if (!res.ok) {
        const e = await res.json().catch(()=>({}));
        const isServerSleep = res.status === 503 || String(e?.error||"").includes("503");
        const errMsg = typeof e?.error === "string" ? e.error : e?.error?.message || e?.message || `Server error ${res.status}`;
        throw new Error(isServerSleep ? "Server is waking up (takes ~30 sec). Wait and try again." : errMsg);
      }
      const data = await res.json();
      const text = data.content?.[0]?.text || "No response";
      setAnalysis(text);
      saveVisitPrep(appt.id, { text, sig });   // persist so the companion reads it
      setStale(false);
    } catch(e) {
      const isNetworkErr = e.message?.includes("Failed to fetch") || e.message?.includes("503") || e.message?.includes("waking up");
      setError(isNetworkErr ? "Server is waking up (Render free tier). Wait ~30 seconds then try again." : e.message);
    }
    finally { setLoading(false); }
  };

  return (
    <div style={{ marginTop:16, background:"rgba(79,142,247,.04)", border:"1px solid rgba(79,142,247,.15)", borderRadius:12, padding:18 }}>
      <div style={{ fontSize:12, fontWeight:600, color:"#6ea3ff", fontFamily:"'DM Mono',monospace", letterSpacing:"1px", marginBottom:12, display:"flex", alignItems:"center", gap:6 }}>
        <span>✦</span> AI Appointment Prep
        {stale && <span style={{ fontSize:12, color:"#f59e0b", fontFamily:"'DM Mono',monospace", letterSpacing:0 }}>· details changed: regenerate</span>}
        {analysis && <button onClick={() => requestReport("consultationPrep", () => printConsultationPrep(appt, analysis))} style={{ marginLeft:"auto", padding:"3px 10px", background:"rgba(79,142,247,.1)", border:"1px solid rgba(79,142,247,.3)", borderRadius:6, color:"#7eb8d8", fontSize:12, cursor:"pointer", fontFamily:"'DM Mono',monospace" }}><PrintLabel size={11} /></button>}
      </div>
      {/* DEC-046: what marked analyses will ride into this prep — visible and
          excludable BEFORE generating, never silently included. */}
      {markedForVisit.reports.length > 0 && (
        <div style={{ marginBottom:12, background:"rgba(16,185,129,.04)", border:"1px solid rgba(16,185,129,.18)", borderRadius:8, padding:"10px 13px" }}>
          <div style={{ fontSize:12, color:"#2dd4a0", fontFamily:"'DM Mono',monospace", letterSpacing:"0.8px", textTransform:"uppercase", marginBottom:7 }}>
            Marked analyses for this visit ({includedReports.length} of {markedForVisit.reports.length} included)
          </div>
          {markedForVisit.reports.map(r => {
            const included = !excludedIds.has(String(r.id));
            return (
              <div key={r.id} style={{ display:"flex", alignItems:"center", gap:9, marginBottom:5 }}>
                <div onClick={() => toggleExclude(r.id)} role="checkbox" aria-checked={included}
                  style={{ width:14, height:14, border:`1px solid ${included ? "#10b981" : "#1a2f4a"}`, borderRadius:3, background: included ? "rgba(16,185,129,.12)" : "transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  {included && <span style={{ fontSize:12, color:"#2dd4a0" }}>✓</span>}
                </div>
                <span style={{ fontSize:12, color: included ? "#c4d8ee" : "#4a5c6a", flex:1, lineHeight:1.4 }}>{r.title}</span>
                <span style={{ fontSize:12, color:"#4a5c6a", fontFamily:"'DM Mono',monospace", flexShrink:0 }}>{formatDateUS(r.date)}</span>
              </div>
            );
          })}
          {markedForVisit.droppedCount > 0 && (
            <div style={{ fontSize:12, color:"#f59e0b", fontFamily:"'DM Mono',monospace", marginTop:4 }}>
              +{markedForVisit.droppedCount} older marked {markedForVisit.droppedCount === 1 ? "report" : "reports"} not included (3 newest only)
            </div>
          )}
          <div style={{ fontSize:12, color:"#4a5c6a", fontFamily:"'DM Mono',monospace", marginTop:6 }}>
            Marked in My Notes · included in this prep · clears when the visit is completed
          </div>
        </div>
      )}
      <div style={{ marginBottom:10 }}>
        <label style={{ fontSize:12, color:"#a0b4c8", fontFamily:"'DM Mono',monospace", letterSpacing:"0.8px", textTransform:"uppercase", display:"block", marginBottom:5 }}>Additional Questions / Context</label>
        <textarea
          value={additionalQ}
          onChange={e => setAdditionalQ(e.target.value)}
          placeholder="e.g. Ask about adjusting my Tacrolimus dose, or discuss recent lab trends…"
          rows={2}
          style={{ width:"100%", background:"#080c14", border:"1px solid #1a2f4a", borderRadius:8, padding:"9px 12px", color:"#c4d8ee", fontFamily:"'Sora',sans-serif", fontSize:12, outline:"none", resize:"vertical" }}
        />
      </div>
      <button
        onClick={runAnalysis}
        disabled={loading}
        style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 16px", background:"rgba(79,142,247,.15)", border:"1px solid rgba(79,142,247,.35)", borderRadius:8, color:"#7eb8d8", fontSize:12, fontFamily:"'Sora',sans-serif", cursor:loading?"wait":"pointer", opacity:loading?0.7:1 }}
      >
        {loading ? "⏳ Analyzing…" : "✦ Generate Prep Analysis"}
      </button>
      {error && <div style={{ marginTop:10, fontSize:12, color:"#f87171", fontFamily:"'DM Mono',monospace" }}>⚠ {error}</div>}
      {analysis && (
        <div style={{ marginTop:14, background:"#080c14", border:"1px solid #1c2a40", borderRadius:10, padding:"14px 16px", fontSize:12, color:"#a8c4dc", lineHeight:1.75, whiteSpace:"pre-wrap" }}>
          {analysis}
        </div>
      )}
    </div>
  );
}

// ── Google Calendar picker modal ────────────────────────────────────────────
function CalendarPickerModal({ calendars, onPick, onClose }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:1100, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:"#0b1220", border:"1px solid #1a2f4a", borderRadius:16, width:"100%", maxWidth:460, maxHeight:"80vh", overflowY:"auto", padding:24 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
          <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:20, color:"#dde8f5", fontWeight:400 }}>Choose your medical calendar</h2>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#7eb8d8", fontSize:18, cursor:"pointer" }}>✕</button>
        </div>
        <p style={{ fontSize:12, color:"#98afc4", fontFamily:"'DM Mono',monospace", marginBottom:16 }}>
          Insina will pull appointments from the calendar you pick. You can change this later.
        </p>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {calendars.map(c => (
            <button key={c.id} onClick={() => onPick(c)}
              style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 13px", background:"#080c14", border:"1px solid #1c2a40", borderRadius:10, cursor:"pointer", textAlign:"left", transition:"border-color .15s" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "#1a2f4a"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "#0d1a28"}>
              <span style={{ width:10, height:10, borderRadius:"50%", background:c.color, flexShrink:0 }} />
              <span style={{ flex:1, fontSize:13, color:"#c4d8ee" }}>{c.summary}</span>
              {c.primary && <span style={{ fontSize:12, color:"#7eb8d8", fontFamily:"'DM Mono',monospace", border:"1px solid #1a2f4a", borderRadius:8, padding:"1px 7px" }}>primary</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AppointmentsTab({ onNavChange }) {
  const [appts, setAppts]     = useState(() => loadAppts());
  const [modal, setModal]     = useState(null);   // null | BLANK | appt object
  const [filter, setFilter]   = useState("upcoming");
  // Duplicate-resolution reveal: the id of the existing appointment to scroll
  // into view once the list has re-rendered under the new filter. Without this,
  // "Use existing" flips the filter to "all" (sorted oldest-first) and the
  // matched card expands OFF-SCREEN — the viewport lands on years-old history,
  // which reads as "it took me to the wrong appointment."
  const [revealId, setRevealId] = useState(null);
  useEffect(() => {
    if (!revealId) return;
    const t = setTimeout(() => {
      // behavior "auto" (instant), not "smooth": the reveal lands right after a
      // filter re-render whose row entrance animations cancel an in-flight
      // smooth scroll — verified live; the instant jump is immune.
      document.getElementById(`appt-${revealId}`)?.scrollIntoView({ behavior: "auto", block: "center" });
      setRevealId(null);
    }, 120); // after the filter/expand re-render paints
    return () => clearTimeout(t);
  }, [revealId]);
  const [expanded, setExpanded] = useState(null);
  const [showAI, setShowAI]   = useState(null);  // appt.id for which AI panel is open
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [dupPrompt, setDupPrompt] = useState(null);       // UI-7: { incoming, existing } | null
  const [attachTarget, setAttachTarget] = useState(null); // appt for which the Attach modal is open
  const [postVisit, setPostVisit] = useState(null);       // appt just marked complete → capture prompt

  // Google Calendar sync
  const [syncing, setSyncing]       = useState(false);
  const [syncMsg, setSyncMsg]       = useState(null);   // { kind:"ok"|"err", text }
  const [calPicker, setCalPicker]   = useState(null);   // array of calendars when picking
  const [syncNotice, setSyncNotice] = useState(null);   // { count, calName } — pop-up when a sync lands suggestions

  useEffect(() => { saveAppts(appts); }, [appts]);

  // UI-26: a search result targeting an appointment expands that row.
  // Switch to "all" so a past appointment isn't hidden by the default filter.
  // Runs on mount and on the event (already the visible tab).
  useEffect(() => {
    const apply = () => {
      const title = takePendingSelect("appointments");
      if (!title) return;
      const hit = loadAppts().find(a => a.title === title);
      if (hit) { setExpanded(hit.id); setFilter("all"); }
    };
    apply();
    window.addEventListener("insina-pending-select", apply);
    return () => window.removeEventListener("insina-pending-select", apply);
  }, []);

  useEffect(() => {
    if (!syncMsg) return;
    const t = setTimeout(() => setSyncMsg(null), 6000);
    return () => clearTimeout(t);
  }, [syncMsg]);

  // Pull events from a chosen calendar and add only the new ones.
  // `auto` mode runs quietly: only announces when it actually adds something,
  // and swallows errors (the manual button stays available for explicit syncs).
  const pullFromCalendar = useCallback(async (cal, { auto = false } = {}) => {
    setSyncing(true);
    if (!auto) setSyncMsg(null);
    try {
      const events = await listEvents(cal.id);
      const careTeam = (() => {
        try { return JSON.parse(localStorage.getItem("mi_care_team") || "[]"); } catch { return []; }
      })();
      let added = 0;
      setAppts(prev => {
        // Synced events come in as "suggested" so nothing hits the real schedule
        // until you review, edit, and Confirm (or Dismiss) each one.
        const fresh = diffNewAppointments(events, prev, careTeam).map(a => ({ ...BLANK, ...a, id: genId(), status: "suggested", suggestedFrom: "Google Calendar" }));
        added = fresh.length;
        return [...fresh, ...prev];
      });
      localStorage.setItem(GCAL_LAST_SYNC_KEY, todayISO());
      if (added > 0) {
        setFilter("suggested");
        setSyncMsg({ kind:"ok", text: `${auto ? "Auto-synced: " : ""}${added} new appointment${added !== 1 ? "s" : ""} from "${cal.summary}" to review below. Edit to fill gaps, then Confirm or Dismiss.` });
        // v1.56.1 (Greg): the inline banner is easy to miss — a pop-up says
        // where synced events landed (Suggested, not Upcoming) until dismissed.
        setSyncNotice({ count: added, calName: cal.summary });
      } else if (!auto) {
        setSyncMsg({ kind:"ok", text: `No new appointments in "${cal.summary}". You're up to date.` });
      }
    } catch (e) {
      if (!auto) setSyncMsg({ kind:"err", text: e.message || "Calendar sync failed." });
      else console.warn("[CalendarAutoSync]", e.message);
    } finally {
      setSyncing(false);
    }
  }, []);

  // Auto-sync once per day: the first time the tab mounts on a new calendar day,
  // if a calendar is already connected, sync quietly in the background.
  const autoSyncRanRef = useRef(false);
  useEffect(() => {
    if (autoSyncRanRef.current) return;
    const cal = getSelectedCalendar();
    if (!cal) return;                                   // not connected yet
    if (localStorage.getItem(GCAL_LAST_SYNC_KEY) === todayISO()) return; // already today
    // Flag set when the sync FIRES — StrictMode's dev double-mount cancels the
    // first timer, and arming early would block the second mount's attempt.
    const t = setTimeout(() => { autoSyncRanRef.current = true; pullFromCalendar(cal, { auto: true }); }, 1500); // let Google auth settle
    return () => clearTimeout(t);
  }, [pullFromCalendar]);

  const handleSyncCalendar = useCallback(async () => {
    if (syncing) return;
    const saved = getSelectedCalendar();
    if (saved) { pullFromCalendar(saved); return; }
    // First time: let the user choose which calendar
    setSyncing(true);
    setSyncMsg(null);
    try {
      const cals = await listCalendars();
      if (!cals.length) { setSyncMsg({ kind:"err", text:"No calendars found on your Google account." }); return; }
      setCalPicker(cals);
    } catch (e) {
      setSyncMsg({ kind:"err", text: e.message || "Could not reach Google Calendar." });
    } finally {
      setSyncing(false);
    }
  }, [syncing, pullFromCalendar]);

  const handlePickCalendar = (cal) => {
    setSelectedCalendar(cal);
    setCalPicker(null);
    pullFromCalendar(cal);
  };

  // UI-7: likely-duplicate detection for manually added appointments. Edits
  // (including Confirm on a synced suggestion and reschedules) keep their id
  // and skip this — only a brand-new entry can collide with an existing one.
  const normTxt = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const findLikelyDuplicate = (appt, list) => list.find(a => {
    if (a.status === "cancelled" || a.date !== appt.date) return false;
    const t1 = normTxt(a.title), t2 = normTxt(appt.title);
    if (t1 && t2 && (t1 === t2 || t1.includes(t2) || t2.includes(t1))) return true;
    const p1 = normTxt(a.provider), p2 = normTxt(appt.provider);
    return !!(p1 && p2 && p1 === p2);
  });

  const handleSave = (appt) => {
    const isNew = !appts.some(a => a.id === appt.id);
    if (isNew) {
      const dup = findLikelyDuplicate(appt, appts);
      // Nothing is saved or discarded here — the prompt holds the entered
      // appointment until the user picks use existing / update / keep both.
      if (dup) { setDupPrompt({ incoming: appt, existing: dup }); setModal(null); return; }
    }
    // DEC-046 lifecycle: completing a visit consumes its prep marks — a mark
    // means "for my next visit with this doctor." Covers BOTH completion
    // paths (the Mark Complete button and the edit form's status select),
    // since each routes through here. clearPrepMarksForAppointment never
    // throws; a mark-clear failure must not block saving the appointment.
    const prevStatus = appts.find(a => a.id === appt.id)?.status;
    if (appt.status === "completed" && prevStatus !== "completed") {
      clearPrepMarksForAppointment(appt);
    }
    setAppts(prev => {
      const exists = prev.find(a => a.id === appt.id);
      return exists ? prev.map(a => a.id === appt.id ? appt : a) : [appt, ...prev];
    });
    setModal(null);
    // UI-29: brief success confirmation (auto-clears via the syncMsg timer)
    setSyncMsg({ kind: "ok", text: "Appointment saved." });
  };

  const resolveDup = (choice) => {
    const { incoming, existing } = dupPrompt;
    if (choice === "update") {
      // Apply the newly entered non-empty fields onto the existing record;
      // its identity (id, gcalId, status, attachments) is preserved.
      const KEEP = new Set(["id", "gcalId", "status", "attachments"]);
      const updates = Object.fromEntries(Object.entries(incoming).filter(([k, v]) => !KEEP.has(k) && v !== "" && v != null));
      setAppts(prev => prev.map(a => a.id === existing.id ? { ...a, ...updates } : a));
    } else if (choice === "keepBoth") {
      setAppts(prev => [incoming, ...prev]);
    } else if (choice === "useExisting" && existing.status === "suggested") {
      // The match was an unconfirmed calendar suggestion. "Use existing" means
      // "yes, that IS my appointment" — so confirm it to a real upcoming
      // appointment; otherwise the user walks away with nothing booked and an
      // invisible suggestion (the original 8/17 Labs bug).
      setAppts(prev => prev.map(a => a.id === existing.id ? { ...a, status: "upcoming" } : a));
    }
    // Reveal the record on file: expand it, widen the filter, and scroll it
    // into view (the revealId effect) so the viewport lands on the match, not
    // on the oldest rows of the re-sorted "all" list.
    if (choice !== "keepBoth") { setExpanded(existing.id); setFilter("all"); setRevealId(existing.id); }
    setDupPrompt(null);
    if (choice === "update") setSyncMsg({ kind: "ok", text: "Existing appointment updated." });
    if (choice === "keepBoth") setSyncMsg({ kind: "ok", text: "Appointment saved." });
    if (choice === "useExisting") {
      setSyncMsg({ kind: "ok", text: existing.status === "suggested"
        ? "Calendar suggestion confirmed. It's now an upcoming appointment."
        : "Showing your existing appointment." });
    }
  };

  const handleDelete = (id) => {
    // EVERY deletion gets a tombstone (delete and the suggested-row Dismiss
    // both land here) — not just calendar-synced records. The Drive merge
    // unions local + Drive by record id with no concept of deletion, so a
    // manual record still living in the Drive file (kept alive by the other
    // device) resurrects after every delete — the Dr. Roy bug. The id-based
    // tombstone kills that copy at the merge layer and propagates the
    // deletion to the other device via the backed-up tombstone list.
    const target = appts.find(a => a.id === id);
    if (target) tombstoneAppt(target);
    setAppts(prev => prev.filter(a => a.id !== id));
    setDeleteConfirm(null);
    if (expanded === id) setExpanded(null);
  };

  // Mark an appointment complete, then prompt to capture anything from the visit.
  const handleMarkComplete = (appt) => {
    handleSave({ ...appt, status: "completed" });
    setPostVisit({ ...appt, status: "completed" });
  };

  // ── Attachments ───────────────────────────────────────────────────────────
  const setAttachments = (apptId, attachments) =>
    setAppts(prev => prev.map(a => a.id === apptId ? { ...a, attachments } : a));

  // A post-visit capture wrote a new record: tie it to the appointment and let
  // open tabs + the Record Integrity Engine re-read from storage.
  const handlePostVisitCapture = (attachment) => {
    if (!postVisit) return;
    const nextAtts = [...(postVisit.attachments || []), attachment];
    setAttachments(postVisit.id, nextAtts);
    setPostVisit(pv => (pv ? { ...pv, attachments: nextAtts } : pv));
    window.dispatchEvent(new Event("mi-data-synced"));
  };

  const handleSaveAttachments = (attachments) => {
    if (attachTarget) setAttachments(attachTarget.id, attachments);
    setAttachTarget(null);
  };

  const handleDetach = (apptId, att) =>
    setAttachments(apptId, (appts.find(a => a.id === apptId)?.attachments || []).filter(x => attKey(x) !== attKey(att)));

  const openAttachment = (att) => {
    const nav = ATT_META[att.type]?.nav;
    if (nav) onNavChange?.(nav);
  };

  const viewPrep = (appt) => {
    const p = loadVisitPrep(appt.id);
    if (p?.text) requestReport("consultationPrep", () => printConsultationPrep(appt, p.text));
  };

  // v1.56.0 (Greg): Completed and All read newest-first (what happened most
  // recently on top); Upcoming/Suggested keep soonest-first (what's next on top).
  const newestFirst = filter === "completed" || filter === "all";
  const filtered = appts
    .filter(a => filter === "all" || a.status === filter)
    .sort((a, b) => newestFirst
      ? new Date(b.date) - new Date(a.date)
      : new Date(a.date) - new Date(b.date));

  const upcomingCount   = appts.filter(a => a.status === "upcoming").length;
  const completedCount  = appts.filter(a => a.status === "completed").length;
  const suggestedCount  = appts.filter(a => a.status === "suggested").length;
  const nextAppt        = appts.filter(a => a.status === "upcoming").sort((a,b) => new Date(a.date)-new Date(b.date))[0];
  const nextDays        = nextAppt ? daysUntil(nextAppt.date) : null;

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", background:"#07090f" }}>
      <style>{`
        * { box-sizing:border-box; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
        .apt-card { background:#0b1220; border:1px solid #1c2a40; border-radius:14px; transition:border-color .2s; animation:fadeUp .35s ease both; }
        .apt-card:hover { border-color:#1a2f4a; }
        .apt-row { display:flex; align-items:center; gap:14px; padding:16px 18px; border-radius:10px; background:#080c14; border:1px solid #1c2a40; margin-bottom:8px; cursor:pointer; transition:border-color .15s; }
        .apt-row:hover { border-color:#1a2f4a; }
        .apt-btn { display:flex; align-items:center; gap:6px; padding:7px 14px; border-radius:8px; font-family:'Sora',sans-serif; font-size:12px; font-weight:500; cursor:pointer; border:1px solid; transition:all .15s; }
        .filter-pill { padding:5px 14px; border-radius:20px; font-size:12px; font-family:'DM Mono',monospace; cursor:pointer; border:1px solid #1a2f4a; background:transparent; color:#98afc4; transition:all .15s; }
        .filter-pill.active { background:rgba(79,142,247,.15); border-color:rgba(79,142,247,.4); color:#7eb8d8; }
        input:focus, select:focus, textarea:focus { border-color:#2a4a7a !important; }
      `}</style>

      {/* Top bar */}
      <div style={{ height:54, background:"#080c14", borderBottom:"1px solid #1c2a40", display:"flex", alignItems:"center", padding:"0 24px", gap:12, flexShrink:0 }} />

      <div style={{ padding:"28px", overflowY:"auto", flex:1 }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:24 }}>
          <div>
            <h1 style={{ fontFamily:"'DM Serif Display',serif", fontSize:28, color:"#dde8f5", fontWeight:400, letterSpacing:"-0.5px" }}>Appointments</h1>
            <p style={{ fontSize:12, color:"#98afc4", marginTop:5, fontFamily:"'DM Mono',monospace" }}>
              {upcomingCount} upcoming · {completedCount} completed{suggestedCount > 0 ? ` · ${suggestedCount} suggested` : ""}
            </p>
          </div>
          <div style={{ display:"flex", gap:10, marginTop:4, alignItems:"center" }}>
            <button
              className="apt-btn"
              style={{ background:"rgba(16,185,129,.10)", borderColor:"rgba(16,185,129,.30)", color:"#2dd4a0", opacity: syncing ? 0.6 : 1, cursor: syncing ? "wait" : "pointer" }}
              onClick={handleSyncCalendar}
              disabled={syncing}
              title="Pull medical appointments from your Google Calendar"
            >
              {syncing ? "⟳ Syncing…" : "⟳ Sync Google Calendar"}
            </button>
            <button
              className="apt-btn"
              style={{ background:"rgba(79,142,247,.15)", borderColor:"rgba(79,142,247,.35)", color:"#7eb8d8" }}
              onClick={() => setModal({ ...BLANK })}
            >
              + New Appointment
            </button>
          </div>
        </div>

        {/* Calendar sync result + change-calendar control */}
        {(syncMsg || getSelectedCalendar()) && (
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16, flexWrap:"wrap" }}>
            {syncMsg && (
              <div role="status" aria-live="polite" style={{ flex:"1 1 auto", padding:"8px 14px", borderRadius:9, fontSize:12, fontFamily:"'DM Mono',monospace",
                background: syncMsg.kind === "ok" ? "rgba(16,185,129,.08)" : "rgba(239,68,68,.08)",
                border: `1px solid ${syncMsg.kind === "ok" ? "rgba(16,185,129,.25)" : "rgba(239,68,68,.25)"}`,
                color: syncMsg.kind === "ok" ? "#2dd4a0" : "#f87171" }}>
                {syncMsg.kind === "ok" ? "✓ " : "⚠ "}{syncMsg.text}
              </div>
            )}
            {getSelectedCalendar() && (
              <span style={{ fontSize:12, color:"#98afc4", fontFamily:"'DM Mono',monospace" }}>
                Calendar: {getSelectedCalendar().summary} · auto-syncs daily
                <button onClick={() => { setSelectedCalendar(null); setSyncMsg(null); }}
                  style={{ marginLeft:8, background:"none", border:"none", color:"#7eb8d8", fontSize:12, cursor:"pointer", textDecoration:"underline", fontFamily:"'DM Mono',monospace" }}>
                  change
                </button>
              </span>
            )}
          </div>
        )}

        {/* Summary cards */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, marginBottom:24 }}>
          {/* Next appointment */}
          <div className="apt-card" style={{ padding:20 }}>
            <div style={{ fontSize:12, color:"#a0b4c8", fontFamily:"'DM Mono',monospace", letterSpacing:"1px", textTransform:"uppercase", marginBottom:10 }}>Next Appointment</div>
            {nextAppt ? (
              <>
                <div style={{ fontSize:18, fontWeight:700, color:"#dde8f5", marginBottom:4 }}>{nextAppt.title}</div>
                <div style={{ fontSize:12, color:"#7eb8d8", marginBottom:6 }}>{nextAppt.provider}</div>
                <div style={{ fontSize:12, color:"#98afc4", fontFamily:"'DM Mono',monospace" }}>{fmtDate(nextAppt.date)} · {nextAppt.time || "TBD"}</div>
                {nextDays !== null && (
                  <div style={{ marginTop:10, display:"inline-block", padding:"3px 10px", borderRadius:20, background: nextDays <= 3 ? "rgba(239,68,68,.12)" : "rgba(79,142,247,.12)", border:`1px solid ${nextDays<=3?"rgba(239,68,68,.3)":"rgba(79,142,247,.3)"}`, fontSize:12, color:nextDays<=3?"#f87171":"#6ea3ff", fontFamily:"'DM Mono',monospace" }}>
                    {nextDays === 0 ? "Today" : nextDays === 1 ? "Tomorrow" : `In ${nextDays} days`}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize:13, color:"#98afc4" }}>No upcoming appointments</div>
            )}
          </div>

          {/* This month */}
          <div className="apt-card" style={{ padding:20 }}>
            <div style={{ fontSize:12, color:"#a0b4c8", fontFamily:"'DM Mono',monospace", letterSpacing:"1px", textTransform:"uppercase", marginBottom:10 }}>This Month</div>
            {(() => {
              const now = new Date();
              const thisMonth = appts.filter(a => {
                const d = new Date(a.date + "T12:00:00");
                return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && a.status === "upcoming";
              }).sort((a, b) => new Date(a.date) - new Date(b.date));
              return thisMonth.length > 0 ? (
                <>
                  <div style={{ fontSize:32, fontWeight:700, color:"#6ea3ff", lineHeight:1, marginBottom:6 }}>{thisMonth.length}</div>
                  <div style={{ fontSize:12, color:"#7eb8d8" }}>appointment{thisMonth.length !== 1 ? "s" : ""} remaining</div>
                  {thisMonth.map((a,i) => (
                    <div key={i} style={{ marginTop:6, fontSize:12, color:"#98afc4", fontFamily:"'DM Mono',monospace" }}>
                      {new Date(a.date+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}: {a.title}
                    </div>
                  ))}
                </>
              ) : (
                <div style={{ fontSize:13, color:"#98afc4" }}>No appointments this month</div>
              );
            })()}
          </div>

          {/* Prep needed */}
          <div className="apt-card" style={{ padding:20 }}>
            <div style={{ fontSize:12, color:"#a0b4c8", fontFamily:"'DM Mono',monospace", letterSpacing:"1px", textTransform:"uppercase", marginBottom:10 }}>Prep Required</div>
            {(() => {
              const prepNeeded = appts.filter(a => a.status === "upcoming" && a.prepInstructions);
              return prepNeeded.length > 0 ? (
                <>
                  <div style={{ fontSize:32, fontWeight:700, color:"#f59e0b", lineHeight:1, marginBottom:6 }}>{prepNeeded.length}</div>
                  <div style={{ fontSize:12, color:"#7eb8d8", marginBottom:8 }}>upcoming with prep</div>
                  {prepNeeded.slice(0,2).map((a,i) => (
                    <div key={i} style={{ marginTop:6, padding:"6px 10px", background:"rgba(245,158,11,.06)", border:"1px solid rgba(245,158,11,.15)", borderRadius:7 }}>
                      <div style={{ fontSize:12, color:"#f59e0b", marginBottom:2 }}>{a.title}</div>
                      <div style={{ fontSize:12, color:"#98afc4", fontFamily:"'DM Mono',monospace" }}>{a.prepInstructions}</div>
                    </div>
                  ))}
                </>
              ) : (
                <div style={{ fontSize:13, color:"#98afc4" }}>No prep instructions set</div>
              );
            })()}
          </div>
        </div>

        {/* Filter pills */}
        <div style={{ display:"flex", gap:8, marginBottom:16 }}>
          {[["upcoming","Upcoming"],["suggested",`Suggested${suggestedCount > 0 ? ` (${suggestedCount})` : ""}`],["completed","Completed"],["cancelled","Cancelled"],["all","All"]].map(([val,lbl]) => (
            <button key={val} className={`filter-pill${filter===val?" active":""}`} onClick={() => setFilter(val)}>{lbl}</button>
          ))}
        </div>

        {/* Appointment list */}
        <div className="apt-card" style={{ padding:"20px" }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign:"center", padding:"40px 0", color:"#98afc4", fontSize:13 }}>
              No {filter !== "all" ? filter : ""} appointments
            </div>
          ) : filtered.map((appt, idx) => {
            const urgCfg  = URGENCY_CFG[appt.urgency] ?? URGENCY_CFG.med;
            const statCfg = STATUS_CFG[appt.status]  ?? STATUS_CFG.upcoming;
            const days    = daysUntil(appt.date);
            const isOpen  = expanded === appt.id;

            return (
              <div key={appt.id} id={`appt-${appt.id}`} style={{ animationDelay:`${idx*40}ms` }}>
                <div className="apt-row" onClick={() => setExpanded(isOpen ? null : appt.id)}>
                  {/* Urgency bar — amber for suggested */}
                  <div style={{ width:3, height:44, borderRadius:2, background: appt.status === "suggested" ? "#f59e0b" : urgCfg.color, flexShrink:0, boxShadow:`0 0 8px ${appt.status === "suggested" ? "#f59e0b" : urgCfg.color}60` }} />

                  {/* Date block */}
                  <div style={{ flexShrink:0, width:48, textAlign:"center" }}>
                    <div style={{ fontSize:18, fontWeight:700, color:"#dde8f5", lineHeight:1 }}>
                      {appt.date ? new Date(appt.date+"T12:00:00").getDate() : "–"}
                    </div>
                    <div style={{ fontSize:12, color:"#a0b4c8", fontFamily:"'DM Mono',monospace", textTransform:"uppercase" }}>
                      {appt.date ? new Date(appt.date+"T12:00:00").toLocaleDateString("en-US",{month:"short"}) : ""}
                    </div>
                  </div>

                  {/* Info */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:"#c4d8ee", marginBottom:2 }}>{appt.title}</div>
                    <div style={{ fontSize:12, color:"#7eb8d8" }}>{appt.provider}{appt.specialty ? ` · ${appt.specialty}` : ""}</div>
                    {appt.facility && <div style={{ fontSize:12, color:"#98afc4", fontFamily:"'DM Mono',monospace", marginTop:2 }}>{appt.facility}</div>}
                  </div>

                  {/* Time */}
                  <div style={{ textAlign:"right", flexShrink:0 }}>
                    <div style={{ fontSize:12, color:"#b0c4d8", fontFamily:"'DM Mono',monospace" }}>{appt.time || "–"}</div>
                    {days !== null && appt.status === "upcoming" && (
                      <div style={{ fontSize:12, color:days<=3?"#f87171":days<=7?"#f59e0b":"#98afc4", fontFamily:"'DM Mono',monospace", marginTop:2 }}>
                        {days === 0 ? "Today" : days === 1 ? "Tomorrow" : days < 0 ? "Past" : `${days}d`}
                      </div>
                    )}
                  </div>

                  {/* Status badge */}
                  <div style={{ padding:"3px 10px", borderRadius:20, background:`${statCfg.color}18`, border:`1px solid ${statCfg.color}40`, fontSize:12, color:statCfg.color, fontFamily:"'DM Mono',monospace", flexShrink:0 }}>
                    {statCfg.label}
                  </div>

                  {/* Chevron */}
                  <div style={{ fontSize:12, color:"#a0b4c8", transition:"transform .2s", transform:isOpen?"rotate(180deg)":"rotate(0deg)", flexShrink:0 }}>▾</div>
                </div>

                {/* Expanded detail */}
                {isOpen && (
                  <div style={{ margin:"-4px 0 8px 0", padding:"16px 18px", background:"#07090f", border:"1px solid #1c2a40", borderTop:"none", borderRadius:"0 0 10px 10px", animation:"fadeUp .2s ease both" }}>
                    {/* Suggested-from banner */}
                    {appt.status === "suggested" && appt.suggestedFrom && (
                      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", background:"rgba(245,158,11,.07)", border:"1px solid rgba(245,158,11,.2)", borderRadius:8, marginBottom:12 }}>
                        <span style={{ fontSize:12, color:"#f59e0b" }}>✦</span>
                        <span style={{ fontSize:12, color:"#c4a44a", fontFamily:"'DM Mono',monospace" }}>Auto-suggested from: <strong style={{ color:"#f59e0b" }}>{appt.suggestedFrom}</strong></span>
                      </div>
                    )}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
                      {appt.address && <Detail label="Address"  value={appt.address} />}
                      {appt.phone   && <Detail label="Phone"    value={displayPhone(appt.phone)} />}
                      {appt.prepInstructions && <Detail label="Prep Instructions" value={appt.prepInstructions} />}
                      {appt.notes   && <Detail label="Notes"    value={appt.notes}   full />}
                    </div>
                    {(appt.address || appt.facility) && (
                      <a href={mapsUrl(appt)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                        style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:12, color:"#7eb8d8", fontFamily:"'DM Mono',monospace", textDecoration:"none", padding:"6px 12px", background:"rgba(79,142,247,.08)", border:"1px solid rgba(79,142,247,.25)", borderRadius:8, marginBottom:14 }}>
                        🧭 Directions
                      </a>
                    )}
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      {appt.status === "suggested" ? (
                        <>
                          <button className="apt-btn" style={{ background:"rgba(16,185,129,.12)", borderColor:"rgba(16,185,129,.3)", color:"#2dd4a0" }}
                            onClick={e => { e.stopPropagation(); handleSave({ ...appt, status:"upcoming" }); }}>
                            ✓ Confirm Appointment
                          </button>
                          <button className="apt-btn" style={{ background:"rgba(79,142,247,.12)", borderColor:"rgba(79,142,247,.3)", color:"#7eb8d8" }}
                            onClick={e => { e.stopPropagation(); setModal(appt); }}>
                            ✎ Edit
                          </button>
                          <button className="apt-btn" style={{ background:"rgba(239,68,68,.08)", borderColor:"rgba(239,68,68,.2)", color:"#f87171", marginLeft:"auto" }}
                            onClick={e => { e.stopPropagation(); setDeleteConfirm(appt.id); }}>
                            ✕ Dismiss
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="apt-btn" style={{ background:"rgba(79,142,247,.12)", borderColor:"rgba(79,142,247,.3)", color:"#7eb8d8" }} onClick={e => { e.stopPropagation(); setModal(appt); }}>
                            ✎ Edit
                          </button>
                          <button className="apt-btn" style={{ background:"rgba(16,185,129,.10)", borderColor:"rgba(16,185,129,.25)", color:"#2dd4a0" }}
                            onClick={e => { e.stopPropagation(); handleMarkComplete(appt); }}>
                            ✓ Mark Complete
                          </button>
                          {/* DEC-P49: one launcher per upcoming appointment; none on past encounters. */}
                          {appt.status === "upcoming" && (
                            <AILauncher
                              label="Prepare for this visit"
                              scope={{ source: "appointment", items: [{ kind: "appointment", id: String(appt.id), label: `Visit: ${appt.provider || appt.title}, ${formatDateUS(appt.date)}`, date: appt.date }] }}
                              onNavigate={() => onNavChange?.("ai")}
                              style={{ padding: "6px 12px", fontSize: 12, borderRadius: 8 }}
                            />
                          )}
                          <button className="apt-btn"
                            style={{ background: showAI === appt.id ? "rgba(167,139,250,.15)" : "rgba(79,142,247,.08)", borderColor: showAI === appt.id ? "rgba(167,139,250,.4)" : "rgba(79,142,247,.2)", color: showAI === appt.id ? "#a78bfa" : "#7eb8d8" }}
                            onClick={e => { e.stopPropagation(); setShowAI(prev => prev === appt.id ? null : appt.id); }}>
                            ✦ {showAI === appt.id ? "Hide AI Prep" : "AI Prep Analysis"}
                          </button>
                          <button className="apt-btn" style={{ background:"rgba(239,68,68,.08)", borderColor:"rgba(239,68,68,.2)", color:"#f87171", marginLeft:"auto" }}
                            onClick={e => { e.stopPropagation(); setDeleteConfirm(appt.id); }}>
                            ✕ Delete
                          </button>
                        </>
                      )}
                    </div>
                    <ApptDocuments
                      appt={appt}
                      onAttach={() => setAttachTarget(appt)}
                      onDetach={(att) => handleDetach(appt.id, att)}
                      onOpen={openAttachment}
                      onViewPrep={() => viewPrep(appt)}
                    />
                    {showAI === appt.id && <ApptAIPanel appt={appt} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Add/Edit modal */}
      {modal && <ApptModal appt={modal} onSave={handleSave} onClose={() => setModal(null)} />}

      {/* Attach records modal */}
      {attachTarget && <AttachModal appt={attachTarget} onSave={handleSaveAttachments} onClose={() => setAttachTarget(null)} />}

      {/* Calendar-sync landing notice — synced events wait in Suggested, not Upcoming */}
      {syncNotice && (
        <div role="alertdialog" aria-modal="true" aria-label="Appointments imported from Google Calendar" style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ background:"#0b1220", border:"1px solid #1a2f4a", borderRadius:16, width:"100%", maxWidth:460, padding:28, textAlign:"center" }}>
            <div style={{ fontSize:30, marginBottom:10 }}>📅</div>
            <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:20, color:"#dde8f5", fontWeight:400, marginBottom:10 }}>
              {syncNotice.count} appointment{syncNotice.count !== 1 ? "s" : ""} imported from Google Calendar
            </h2>
            <div style={{ fontSize:13, color:"#b0c4d8", fontFamily:"'Sora',sans-serif", lineHeight:1.6, marginBottom:20 }}>
              They're waiting in the <b style={{ color:"#7eb8d8" }}>Suggested</b> tab. Nothing goes on your schedule until you review it.
              Open each one, then <b style={{ color:"#7eb8d8" }}>Confirm</b> to add it or <b style={{ color:"#7eb8d8" }}>Dismiss</b> it.
            </div>
            <button
              onClick={() => setSyncNotice(null)}
              style={{ padding:"10px 26px", background:"rgba(79,142,247,.18)", border:"1px solid rgba(79,142,247,.45)", borderRadius:9, color:"#7eb8d8", fontFamily:"'Sora',sans-serif", fontSize:13, fontWeight:600, cursor:"pointer" }}
            >Review them now</button>
          </div>
        </div>
      )}

      {/* Post-visit capture prompt */}
      {postVisit && <PostVisitModal appt={postVisit} onClose={() => setPostVisit(null)} onCaptured={handlePostVisitCapture} />}

      {/* Google Calendar picker */}
      {calPicker && <CalendarPickerModal calendars={calPicker} onPick={handlePickCalendar} onClose={() => setCalPicker(null)} />}

      {/* Delete confirm */}
      {/* UI-7: likely-duplicate prompt — never silently merges or deletes */}
      {dupPrompt && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div role="alertdialog" aria-modal="true" aria-label="Possible duplicate appointment" style={{ background:"#0b1220", border:"1px solid #1a2f4a", borderRadius:14, padding:28, maxWidth:440, textAlign:"center" }}>
            <div style={{ fontSize:18, color:"#dde8f5", marginBottom:10 }}>Possible duplicate</div>
            <div style={{ fontSize:12, color:"#98afc4", marginBottom:22, lineHeight:1.6 }}>
              "{dupPrompt.incoming.title}" looks like "{dupPrompt.existing.title}"
              {dupPrompt.existing.provider ? ` with ${dupPrompt.existing.provider}` : ""} already on {fmtDate(dupPrompt.existing.date)}
              {dupPrompt.existing.status === "suggested" ? ". A suggested appointment synced from your calendar, not yet confirmed"
                : dupPrompt.existing.status && dupPrompt.existing.status !== "upcoming" ? ` (${dupPrompt.existing.status})` : ""}.
              Nothing has been saved yet. Choose what to do.
              {dupPrompt.existing.status === "suggested" && " \"Use existing\" will confirm it as your upcoming appointment."}
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap" }}>
              <button className="apt-btn" style={{ background:"rgba(79,142,247,.12)", borderColor:"rgba(79,142,247,.3)", color:"#7eb8d8" }} onClick={() => resolveDup("useExisting")}>Use existing</button>
              <button className="apt-btn" style={{ background:"rgba(16,185,129,.12)", borderColor:"rgba(16,185,129,.3)", color:"#2dd4a0" }} onClick={() => resolveDup("update")}>Update existing</button>
              <button className="apt-btn" style={{ background:"transparent", borderColor:"#1a2f4a", color:"#b0c4d8" }} onClick={() => resolveDup("keepBoth")}>Keep both</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"#0b1220", border:"1px solid #2a1a1a", borderRadius:14, padding:28, maxWidth:360, textAlign:"center" }}>
            <div style={{ fontSize:18, color:"#dde8f5", marginBottom:10 }}>Delete appointment?</div>
            <div style={{ fontSize:12, color:"#98afc4", marginBottom:22 }}>
              This cannot be undone.
              {appts.find(a => a.id === deleteConfirm)?.gcalId
                ? " It also won't come back from calendar sync or Drive sync: deletions now stick everywhere."
                : " It also won't be restored by Drive sync: deletions now stick everywhere."}
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
              <button className="apt-btn" style={{ background:"rgba(239,68,68,.12)", borderColor:"rgba(239,68,68,.3)", color:"#f87171" }} onClick={() => handleDelete(deleteConfirm)}>Delete</button>
              <button className="apt-btn" style={{ background:"transparent", borderColor:"#1a2f4a", color:"#b0c4d8" }} onClick={() => setDeleteConfirm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value, full }) {
  return (
    <div style={full ? { gridColumn:"1/-1" } : {}}>
      <div style={{ fontSize:12, color:"#a0b4c8", fontFamily:"'DM Mono',monospace", letterSpacing:"1px", textTransform:"uppercase", marginBottom:3 }}>{label}</div>
      <div style={{ fontSize:12, color:"#b0c4d8" }}>{value}</div>
    </div>
  );
}
