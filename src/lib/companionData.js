// ─────────────────────────────────────────────────────────────────────────────
// companionData.js — Typed reads / writes / derivations over the mi_* record.
// One record, two front doors: these keys are the SAME ones the web app uses and
// are synced to Google Drive by driveSync.js. Companion-only state (med mode,
// confirmations, exceptions, visits, notif prefs) also uses mi_* so it syncs too.
// ─────────────────────────────────────────────────────────────────────────────

import { tombstoneRecord } from "./recordTombstones.js";

// ── Low-level storage helpers ───────────────────────────────────────────────
export const rls = (k, fb) => { try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : fb; } catch { return fb; } };
export const wls = (k, v)  => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
export const uid = () => Math.random().toString(36).slice(2, 9);
// LOCAL calendar date, not UTC — toISOString() rolls to tomorrow after ~7 PM
// in US timezones, which mis-dated evening vitals/symptoms entries.
export const toISO = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

// ── Date helpers (tolerant — appts may be ISO "2026-06-10" OR "Apr 22, 2026") ──
export function parseDate(s) {
  if (!s) return null;
  if (s instanceof Date) return isNaN(s) ? null : s;
  if (typeof s === "number") { const d = new Date(s); return isNaN(d) ? null : d; }
  const str = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return new Date(str.slice(0, 10) + "T12:00:00");
  let d = new Date(str);
  if (!isNaN(d)) return d;
  // "Apr 22" with no year → assume current year, roll to next if already past
  const yr = new Date().getFullYear();
  d = new Date(`${str}, ${yr}`);
  if (!isNaN(d)) { if (d < new Date().setHours(0, 0, 0, 0)) d = new Date(`${str}, ${yr + 1}`); return isNaN(d) ? null : d; }
  return null;
}
export function daysUntil(dateLike) {
  const d = parseDate(dateLike);
  if (!d) return null;
  return Math.ceil((d.setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
}
export function relDate(dateLike) {
  const d = daysUntil(dateLike);
  if (d == null) return "–";
  if (d < 0)   return "Past";
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d <= 6)  return `In ${d} days`;
  const dt = parseDate(dateLike);
  return dt ? dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "–";
}
export function fmtShort(dateLike) {
  const d = parseDate(dateLike);
  return d ? d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "–";
}

// ── Profile ─────────────────────────────────────────────────────────────────
export function profile() { return rls("mi_profile_personal", {}); }
export function firstName() { return (profile().name || "").split(" ")[0] || ""; }

// ── Appointments (normalized: provider/doctor, facility, address) ─────────────
export function appointments() {
  return rls("mi_appointments", []).map(a => ({
    ...a,
    provider: a.provider || a.doctor || "",
    facility: a.facility || "",
  }));
}
export function upcomingAppointments() {
  return appointments()
    .filter(a => a.status !== "completed" && a.status !== "suggested" && (daysUntil(a.date) ?? -1) >= 0)
    .sort((a, b) => (parseDate(a.date) || 0) - (parseDate(b.date) || 0));
}
export function nextAppointment() { return upcomingAppointments()[0] || null; }

// ── Vitals / readings (normalize o2 ↔ spo2) ───────────────────────────────────
export function readings() {
  return rls("mi_readings", [])
    .map(r => ({ ...r, spo2: r.spo2 ?? r.o2 }))
    .sort((a, b) => new Date(b.ts || b.date || 0) - new Date(a.ts || a.date || 0));
}
export function latestReading() { return readings()[0] || null; }
/** Latest reading that actually carries the given metric. */
export function latestWith(key) { return readings().find(r => r[key] != null) || null; }
/** Simple average of a metric over the most recent n readings that have it. */
export function recentAverage(key, n = 5) {
  const vals = readings().filter(r => r[key] != null).slice(0, n).map(r => +r[key]);
  if (!vals.length) return null;
  return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
}

// ── Medications ───────────────────────────────────────────────────────────────
export function meds() { return rls("mi_meds_full", []); }
export function activeMeds() { return meds().filter(m => m.status !== "inactive"); }
export function medId(m) { return m.id || m.name; }
export function isPRN(m) { return /\bas[\s-]?needed\b|\bprn\b/i.test(m.frequency || ""); }

/**
 * Bucket an active medication into time-of-day group key(s) by parsing its
 * schedule text. A twice-daily med lands in both morning and evening.
 */
export function medGroupKeys(m) {
  if (isPRN(m)) return ["prn"];
  const sched = (m.schedule || "").toLowerCase();
  const keys = new Set();
  const re = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/g;
  let match, found = false;
  while ((match = re.exec(sched))) {
    found = true;
    let h = (+match[1]) % 12;
    if (match[3] === "pm") h += 12;
    if (h < 11) keys.add("morning");
    else if (h < 17) keys.add("midday");
    else keys.add("evening");
  }
  if (!found) {
    if (/bed|night|evening|dinner|\bhs\b/.test(sched)) keys.add("evening");
    else if (/lunch|noon|midday/.test(sched)) keys.add("midday");
    else keys.add("morning"); // breakfast / with food / with meals / unspecified
  }
  return [...keys];
}

const GROUP_META = [
  { key: "morning", label: "Morning", icon: "🌅" },
  { key: "midday",  label: "Midday",  icon: "☀️" },
  { key: "evening", label: "Evening", icon: "🌙" },
];

/** Returns scheduled groups (morning/midday/evening) each with their meds, plus the PRN list. */
export function medGroups() {
  const active = activeMeds();
  const groups = GROUP_META
    .map(g => ({ ...g, meds: active.filter(m => !isPRN(m) && medGroupKeys(m).includes(g.key)) }))
    .filter(g => g.meds.length);
  const prn = active.filter(isPRN);
  return { groups, prn };
}

export function refillsDue(within = 7) {
  return activeMeds()
    .filter(m => { const d = daysUntil(m.refillDate); return d != null && d >= 0 && d <= within; })
    .sort((a, b) => daysUntil(a.refillDate) - daysUntil(b.refillDate));
}

// ── Medication tracking mode ──────────────────────────────────────────────────
export const MED_MODES = [
  { key: "reminders", label: "Reminders only", blurb: "Nudge at dose times. Nothing to log." },
  { key: "quick",     label: "Quick confirm",  blurb: "One tap confirms a whole group." },
  { key: "full",      label: "Full logging",   blurb: "Per-group confirm + flag any exception." },
  { key: "off",       label: "Off",            blurb: "List stays viewable; no daily interaction." },
];
export function getMedMode() { return rls("mi_med_mode", "quick"); }       // default per spec
export function isMedModeChosen() { return rls("mi_med_mode_set", false); } // has the patient picked yet?
export function setMedMode(m) { wls("mi_med_mode", m); wls("mi_med_mode_set", true); }

// ── Whole-group confirmations (coarse, self-reported, by design) ──────────────
export function todayConfirms() {
  const today = toISO();
  return rls("mi_med_confirms", []).filter(c => c.date === today).map(c => c.group);
}
export function confirmGroup(group, ts = new Date().toISOString()) {
  const today = toISO();
  const all = rls("mi_med_confirms", []);
  if (all.some(c => c.date === today && c.group === group)) return;
  wls("mi_med_confirms", [{ id: uid(), date: today, group, ts }, ...all].slice(0, 365));
}
export function unconfirmGroup(group) {
  const today = toISO();
  wls("mi_med_confirms", rls("mi_med_confirms", []).filter(c => !(c.date === today && c.group === group)));
}

// ── Exceptions (the clinically meaningful events — the only forced-friction path) ─
export const EXCEPTION_TYPES = [
  { key: "skipped",  label: "Skipped a dose" },
  { key: "late",     label: "Took one late" },
  { key: "reaction", label: "Had a reaction" },
  { key: "prn",      label: "Took an as-needed dose" },
];
export function todayExceptions() {
  const today = toISO();
  return rls("mi_med_exceptions", []).filter(e => e.date === today);
}
export function logException({ group, medId: mid, medName, type, note }) {
  const all = rls("mi_med_exceptions", []);
  const entry = { id: uid(), date: toISO(), ts: new Date().toISOString(), group, medId: mid, medName, type, note };
  wls("mi_med_exceptions", [entry, ...all].slice(0, 500));
  return entry;
}
export function removeException(id) {
  tombstoneRecord("mi_med_exceptions", rls("mi_med_exceptions", []).find(e => e.id === id));
  wls("mi_med_exceptions", rls("mi_med_exceptions", []).filter(e => e.id !== id));
}

// ── Conditions / allergies / labs / care team ─────────────────────────────────
// ── Per-appointment consultation prep (shared with the web app, synced via Drive)
// Stored as a single object keyed by appointment id so Drive's object-merge keeps
// per-appointment entries; either app generates it, both read it. `sig` lets us
// detect when the appointment changed and offer to regenerate.
export function prepSig(appt) {
  return [appt?.title, appt?.specialty, appt?.provider, appt?.facility, appt?.date, appt?.notes, appt?.prepInstructions]
    .map(x => (x == null ? "" : String(x).trim())).join("|");
}
export function getVisitPrep(key) {
  const all = rls("mi_visit_prep", {});
  return all[String(key)] || null;
}
export function saveVisitPrep(key, entry) {
  const all = rls("mi_visit_prep", {});
  all[String(key)] = { ...entry, generatedAt: new Date().toISOString() };
  wls("mi_visit_prep", all);
}

export function conditions() { return rls("mi_conditions", []); }
export function surgeries() {
  return rls("mi_surgeries", []).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}
export function activeConditions() { return conditions().filter(c => c.status === "active"); }
export function allergies() { return rls("mi_allergies", []); }
export function careTeam() { return rls("mi_care_team", []); }

/** Most-recent value per lab name. */
export function latestLabs() {
  const latest = {};
  rls("mi_labs", []).forEach(l => {
    const k = (l.name || "").toLowerCase().trim();
    if (k && (!latest[k] || new Date(l.date || 0) > new Date(latest[k].date || 0))) latest[k] = l;
  });
  return Object.values(latest);
}
export function flaggedLabs() { return latestLabs().filter(l => l.flag); }

// ── Safety flags — color-coded, conservative; used by Pre-Visit Brief & Today ──
export function safetyFlags() {
  const out = [];
  const isImmunosuppressed = activeMeds().some(m => /immunosuppress/i.test(m.category || ""));
  if (isImmunosuppressed) out.push({ level: "critical", text: "On immunosuppression: infection risk; coordinate any new meds with transplant team." });
  activeConditions().forEach(c => {
    const major = /major/i.test(c.severity || "") || /transplant/i.test(c.name || "");
    out.push({ level: major ? "critical" : "info", text: c.severity ? `${c.name}: ${c.severity}` : c.name });
  });
  allergies().forEach(a => out.push({ level: "caution", text: `Allergy: ${a.name}${a.reaction ? ` (${a.reaction})` : ""}` }));
  flaggedLabs().forEach(l => out.push({ level: "caution", text: `${l.name} flagged: ${l.value}${l.unit ? " " + l.unit : ""}${l.refRange ? ` (ref ${l.refRange})` : ""}` }));
  activeMeds().filter(m => m.flag && m.flagNote).forEach(m => out.push({ level: "caution", text: `${m.name}: ${m.flagNote}` }));
  // critical first, then caution, then info
  const order = { critical: 0, caution: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

// Deterministic relevance filter (offline fallback for the Pre-Visit Brief):
// keep all critical flags, plus those whose text matches the visit's specialty.
const SPECIALTY_KEYWORDS = [
  { match: /hepatolog|liver|transplant|gastro/i, keys: ["liver", "transplant", "immunosupp", "tacrolimus", "mycophenolate", "prednisone", "alt", "ast", "alp", "ggt", "bilirubin", "albumin", "platelet", "rejection", "valgan", "cmv", "wbc"] },
  { match: /nephro|kidney|renal/i,                keys: ["kidney", "creatinine", "egfr", "bun", "potassium", "ckd", "magnesium", "sodium", "tacrolimus"] },
  { match: /cardio|heart|hypertens/i,             keys: ["bp", "blood pressure", "hypertension", "heart", "cholesterol", "ldl", "hdl", "triglyceride", "metoprolol", "amlodipine"] },
  { match: /endocrin|diabet/i,                    keys: ["glucose", "hba1c", "diabet", "ptdm", "insulin"] },
  { match: /primary|internal|family|pcp/i,        keys: ["bp", "blood pressure", "glucose", "hba1c", "cholesterol", "diabet", "weight", "vaccin", "allerg"] },
];
export function flagsForSpecialty(specialtyOrTitle, flags) {
  const ctx = (specialtyOrTitle || "").toLowerCase();
  const entry = SPECIALTY_KEYWORDS.find(e => e.match.test(ctx));
  if (!entry) return flags; // unknown specialty → show all
  return flags.filter(f =>
    f.level === "critical" || entry.keys.some(k => f.text.toLowerCase().includes(k))
  );
}

// ── Emergency Info bundle (works offline — derived entirely from local record) ─
export function primaryContact() {
  const fromList = rls("mi_emergency_contacts", []).find(c => c.primary) || rls("mi_emergency_contacts", [])[0];
  if (fromList) return fromList;
  // Fall back to the free-text profile field, e.g. "Maria Rivera — (555) 847-3042 (Spouse)"
  const raw = profile().emergency;
  if (!raw) return null;
  const phone = (raw.match(/[\d().+\- ]{7,}/) || [])[0]?.trim();
  const rel = (raw.match(/\(([^)]+)\)\s*$/) || [])[1];
  const name = raw.split("–")[0].split("-")[0].trim();
  return { name: name || raw, phone, relationship: rel };
}
export function emergencyData() {
  return {
    status: activeConditions().map(c => ({ name: c.name, detail: c.severity || "" }))
      .concat(activeMeds().some(m => /immunosuppress/i.test(m.category || "")) ? [{ name: "Immunosuppressed", detail: "Anti-rejection therapy" }] : []),
    meds: activeMeds().map(m => ({ name: m.name, detail: [m.dose, m.frequency].filter(Boolean).join(" · ") })),
    allergies: allergies(),
    keyLabs: flaggedLabs(),
    careTeam: careTeam(),
    primary: primaryContact(),
    profile: profile(),
  };
}
