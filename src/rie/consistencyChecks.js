// ── RIE · Data Consistency Checks ────────────────────────────────────────────
// Cross-field, cross-module rules. Each check is a named function returning a
// findings array. Run on full scan (manual / pre-report), not per keystroke.
//
// Severity note: a few severities are tuned down from the spec because imported
// labs commonly lack optional fields and Phase 1 surfaces everything in one
// queue. A missing lab unit is not flagged at all (Greg 2026-08-30) — many
// results legitimately have none. Easy to retune later.

import { mkFinding } from "./findings.js";
import { genericOf, similarity, ALLERGY_CONFLICTS } from "./medDictionary.js";
import { checkVitalReading, checkVitalCrossFields, checkLabReading } from "../lib/plausibility.js";
import { canonicalLabId, displayLabName } from "../lib/labCanonical.js";

const safe = (k) => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };
const obj  = (k) => { try { return JSON.parse(localStorage.getItem(k) || "{}"); } catch { return {}; } };
const normPhone = (p) => String(p || "").replace(/\D/g, "");
const parseDate = (d) => { if (!d) return null; const t = new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? d + "T12:00:00" : d); return isNaN(t) ? null : t; };

// ── Medications ───────────────────────────────────────────────────────────────
export function checkMedications() {
  const meds = safe("mi_meds_full").filter(m => m.status !== "inactive");
  const out = [];
  meds.forEach((m, i) => {
    const name = m.name || `Medication ${i + 1}`;
    if (!m.dose)      out.push(mkFinding({ severity: "critical", checkType: "consistency", module: "medications", fieldPath: `medications[${m.id ?? i}].dose`, original: name, message: `${name}. No dose recorded`, fix: null }));
    if (!m.frequency) out.push(mkFinding({ severity: "critical", checkType: "consistency", module: "medications", fieldPath: `medications[${m.id ?? i}].frequency`, original: name, message: `${name}: frequency not set` }));
    if (!m.prescriber) out.push(mkFinding({ severity: "warning", checkType: "consistency", module: "medications", fieldPath: `medications[${m.id ?? i}].prescriber`, original: name, message: `${name}. No prescribing provider recorded` }));
    if (!m.refillDate) out.push(mkFinding({ severity: "info", checkType: "consistency", module: "medications", fieldPath: `medications[${m.id ?? i}].refillDate`, original: name, message: `${name}. No refill date on file` }));
  });
  // duplicate active medication by generic
  const groups = {};
  meds.forEach(m => { const g = genericOf(m.name); (groups[g] = groups[g] || []).push(m); });
  Object.entries(groups).forEach(([g, list]) => {
    if (list.length < 2) return;
    const names = new Set(list.map(m => (m.name || "").toLowerCase().trim()));
    const doses = new Set(list.map(m => (m.dose || "").toLowerCase().trim()));
    const label = list.map(m => m.name).join('" and "');
    if (names.size > 1) {
      out.push(mkFinding({ severity: "critical", checkType: "consistency", module: "medications", fieldPath: `medications.duplicate.${g}`, original: label, message: `"${label}" appear to be the same medication (${g}) both listed as active` }));
    } else if (doses.size > 1) {
      out.push(mkFinding({ severity: "warning", checkType: "consistency", module: "medications", fieldPath: `medications.dupdose.${g}`, original: label, message: `"${list[0].name}" is listed multiple times at different doses` }));
    } else {
      out.push(mkFinding({ severity: "critical", checkType: "consistency", module: "medications", fieldPath: `medications.exactdup.${g}`, original: label, message: `"${list[0].name}" is listed more than once as active` }));
    }
  });
  return out;
}

// ── Labs ──────────────────────────────────────────────────────────────────────
export function checkLabs() {
  const labs = safe("mi_labs");
  const dob = parseDate(obj("mi_profile_personal").dob);
  const today = new Date();
  const out = [];
  const seen = {};         // name|date|value → count
  const nameByKey = {};    // labKey → set of display names
  labs.forEach((l, i) => {
    const nm = l.name || `Lab ${i + 1}`;
    // A missing unit is NOT flagged: imported labs routinely omit units
    // (ratios, counts, qualitative results) and that is fine (Greg 2026-08-30).
    if (!l.refRange) out.push(mkFinding({ severity: "info", checkType: "consistency", module: "labs", fieldPath: `labs[${i}].refRange`, original: nm, message: `${nm}. No reference range on file` }));
    const d = parseDate(l.date);
    if (d && d > today) out.push(mkFinding({ severity: "critical", checkType: "consistency", module: "labs", fieldPath: `labs[${i}].date`, original: `${nm} ${l.date}`, message: `${nm} has a draw date in the future (${l.date})` }));
    if (d && dob && d < dob) out.push(mkFinding({ severity: "critical", checkType: "consistency", module: "labs", fieldPath: `labs[${i}].date`, original: `${nm} ${l.date}`, message: `${nm} has a draw date before your date of birth (${l.date})` }));
    const dk = `${(nm || "").toLowerCase()}|${l.date}|${l.value}`;
    seen[dk] = (seen[dk] || 0) + 1;
    // A-04: group by the unified canonical id (seed synonyms + the patient's
    // confirmed mi_lab_name_map) instead of medDictionary's standalone
    // labKeyOf — so a grouping the patient has already confirmed no longer
    // re-nags here.
    const lk = canonicalLabId(nm);
    (nameByKey[lk] = nameByKey[lk] || new Set()).add(nm);
  });
  Object.entries(seen).forEach(([dk, n]) => {
    if (n > 1) { const [nm, date] = dk.split("|"); out.push(mkFinding({ severity: "warning", checkType: "consistency", module: "labs", fieldPath: `labs.dup.${dk}`, original: nm, message: `${nm} on ${date} appears entered more than once with the same value` })); }
  });
  Object.entries(nameByKey).forEach(([lk, names]) => {
    // Only nag when the differing source names don't already resolve to one
    // confirmed display name (i.e. still ungrouped). flag, don't fix.
    if (names.size > 1) {
      const arr = [...names];
      const displays = new Set(arr.map(n => displayLabName(n)));
      if (displays.size > 1) out.push(mkFinding({ severity: "warning", checkType: "consistency", module: "labs", fieldPath: `labs.synonym.${lk}`, original: arr.join(" / "), message: `"${arr.join('" and "')}" may be the same test under different names` }));
    }
  });
  return out;
}

// ── Providers & contacts ──────────────────────────────────────────────────────
export function checkProviders() {
  const team = safe("mi_care_team");
  const teamNames = team.map(p => p.name).filter(Boolean);
  const appts = safe("mi_appointments");
  const out = [];

  const matchTeam = (name) => {
    let best = null, bestSim = 0;
    teamNames.forEach(tn => { const s = similarity(name, tn); if (s > bestSim) { bestSim = s; best = tn; } });
    return { best, bestSim };
  };

  appts.forEach((a, i) => {
    if (!a.provider) out.push(mkFinding({ severity: "warning", checkType: "consistency", module: "appointments", fieldPath: `appointments[${a.id ?? i}].provider`, original: a.title || a.date || `Appointment ${i + 1}`, message: `Appointment "${a.title || a.date}" has no provider recorded` }));
    else if (teamNames.length) {
      const { best, bestSim } = matchTeam(a.provider);
      if (best && bestSim >= 0.85 && best.toLowerCase().trim() !== a.provider.toLowerCase().trim()) {
        out.push(mkFinding({ severity: "warning", checkType: "consistency", module: "appointments", fieldPath: `appointments[${a.id ?? i}].provider`, original: a.provider, suggestion: best, message: `"${a.provider}" in Appointments may be "${best}" from your Care Team: same provider?` }));
      }
    }
    if (!a.facility) out.push(mkFinding({ severity: "info", checkType: "consistency", module: "appointments", fieldPath: `appointments[${a.id ?? i}].facility`, original: a.title || a.date, message: `Appointment "${a.title || a.date}" has no location/facility` }));
  });

  team.forEach((p, i) => { if (!normPhone(p.phone)) out.push(mkFinding({ severity: "info", checkType: "consistency", module: "careplan", fieldPath: `careTeam[${p.id ?? i}].phone`, original: p.name, message: `${p.name} has no phone number on file` })); });

  // duplicate emergency contacts (same phone or same name)
  const ecs = safe("mi_emergency_contacts");
  const byPhone = {}, byName = {};
  ecs.forEach(c => { const ph = normPhone(c.phone); if (ph) (byPhone[ph] = byPhone[ph] || []).push(c); const nm = (c.name || "").toLowerCase().trim(); if (nm) (byName[nm] = byName[nm] || []).push(c); });
  Object.entries(byPhone).forEach(([ph, list]) => { if (list.length > 1) out.push(mkFinding({ severity: "warning", checkType: "consistency", module: "profile", fieldPath: `emergencyContacts.dupphone.${ph}`, original: list[0].name, message: `${list.map(c => c.name).join(" and ")} share the same phone number: duplicate contact?` })); });
  Object.entries(byName).forEach(([nm, list]) => { if (list.length > 1) out.push(mkFinding({ severity: "warning", checkType: "consistency", module: "profile", fieldPath: `emergencyContacts.dupname.${nm}`, original: list[0].name, message: `"${list[0].name}" is listed as an emergency contact more than once` })); });
  return out;
}

// ── Conditions & allergies ────────────────────────────────────────────────────
export function checkConditionsAllergies() {
  const conditions = safe("mi_conditions");
  const allergies = safe("mi_allergies");
  const meds = safe("mi_meds_full").filter(m => m.status !== "inactive");
  const out = [];

  conditions.forEach((c, i) => {
    if (!c.status) out.push(mkFinding({ severity: "warning", checkType: "consistency", module: "conditions", fieldPath: `conditions[${c.id ?? i}].status`, original: c.name, message: `"${c.name}" has no status (active / resolved / historical)` }));
    if (!c.diagnosedDate) out.push(mkFinding({ severity: "info", checkType: "consistency", module: "conditions", fieldPath: `conditions[${c.id ?? i}].diagnosedDate`, original: c.name, message: `"${c.name}" has no onset/diagnosis date` }));
  });

  // duplicate allergies
  const byName = {};
  allergies.forEach(a => { const nm = (a.name || "").toLowerCase().trim(); if (nm) (byName[nm] = byName[nm] || []).push(a); });
  Object.entries(byName).forEach(([nm, list]) => { if (list.length > 1) out.push(mkFinding({ severity: "critical", checkType: "consistency", module: "profile", fieldPath: `allergies.dup.${nm}`, original: list[0].name, message: `"${list[0].name}" is listed as two separate allergy entries` })); });

  // allergy ↔ active medication conflict
  allergies.forEach((a, i) => {
    const key = (a.name || "").toLowerCase().trim();
    const conflicts = ALLERGY_CONFLICTS[key];
    if (!conflicts) return;
    meds.forEach(m => {
      const mn = (m.name || "").toLowerCase(), bn = (m.brand || "").toLowerCase(), g = genericOf(m.name);
      if (conflicts.some(c => mn.includes(c) || bn.includes(c) || g.includes(c))) {
        out.push(mkFinding({ severity: "critical", checkType: "consistency", module: "profile", fieldPath: `allergyConflict.${key}.${m.id}`, original: `${a.name} / ${m.name}`, message: `Allergy to ${a.name} but active medication ${m.name} may contain it. Confirm with your care team` }));
      }
    });
  });
  return out;
}

// ── Documents & records ───────────────────────────────────────────────────────
const GARBLE_RE = /[ÃÂ]{2,}|�|[�]|â€[œ™“”]/;
export function checkDocumentsRecords() {
  const surgeries = safe("mi_surgeries");
  const docs = safe("mi_documents");
  const out = [];
  surgeries.forEach((s, i) => {
    const nm = s.procedure || `Procedure ${i + 1}`;
    if (!s.date || !s.facility) out.push(mkFinding({ severity: "warning", checkType: "consistency", module: "surgeries", fieldPath: `surgeries[${s.id ?? i}]`, original: nm, message: `"${nm}" is missing ${!s.date ? "a date" : ""}${!s.date && !s.facility ? " and " : ""}${!s.facility ? "a facility" : ""}` }));
  });
  docs.forEach((d, i) => {
    const text = `${d.title || ""} ${d.text || d.extractedText || ""}`;
    if (GARBLE_RE.test(text)) out.push(mkFinding({ severity: "warning", checkType: "consistency", module: "documents", fieldPath: `documents[${d.id ?? i}].text`, original: d.title || `Document ${i + 1}`, message: `"${d.title || "Document"}" contains garbled/encoding artifacts in its text` }));
  });
  return out;
}

// ── Transplant-organ terminology (A-05 / PG-07) ──────────────────────────────
// The prompt-build path used to silently rewrite "kidney transplant" to
// "liver transplant" (and LDKT to LDLT) wherever it appeared, invisible to
// the patient and liable to corrupt any record whose history genuinely
// differs — the RIE flag-don't-fix principle it violated. This replaces it:
// a surgical entry mentioning a transplant of one organ, inconsistent with a
// transplant condition on file for a different organ, is flagged with a
// suggested correction; nothing changes until the patient confirms via
// Review Queue "Fix Now."
const ORGAN_TERMS = [
  { organ: "liver",    abbr: "LDLT", re: /\bliver\b|\bLDLT\b/i },
  { organ: "kidney",   abbr: "LDKT", re: /\bkidney\b|\brenal\b|\bLDKT\b/i },
  { organ: "heart",    abbr: null,   re: /\bheart\b|\bcardiac\b/i },
  { organ: "lung",     abbr: null,   re: /\blung\b|\bpulmonary\b/i },
  { organ: "pancreas", abbr: null,   re: /\bpancrea(?:s|tic)\b/i },
];
function matchOrgan(text) {
  return ORGAN_TERMS.find(o => o.re.test(text || "")) || null;
}
function correctedProcedureText(text, fromTerm, toTerm) {
  const g = new RegExp(fromTerm.re.source, "gi");
  return text.replace(g, (match) => {
    if (toTerm.abbr && match === match.toUpperCase() && match.length <= 5) return toTerm.abbr;
    const capitalized = match[0] === match[0].toUpperCase();
    return capitalized ? toTerm.organ[0].toUpperCase() + toTerm.organ.slice(1) : toTerm.organ;
  });
}
export function checkTransplantTerminology() {
  const surgeries = safe("mi_surgeries");
  const conditions = safe("mi_conditions");
  const out = [];

  const conditionTerm = (() => {
    for (const c of conditions) {
      if (!/transplant/i.test(c.name || "")) continue;
      const m = matchOrgan(c.name);
      if (m) return m;
    }
    return null;
  })();
  if (!conditionTerm) return out;

  surgeries.forEach((s, i) => {
    const text = s.procedure || "";
    if (!/transplant/i.test(text)) return;
    const surgTerm = matchOrgan(text);
    if (!surgTerm || surgTerm.organ === conditionTerm.organ) return;
    const suggestion = correctedProcedureText(text, surgTerm, conditionTerm);
    out.push(mkFinding({
      severity: "warning",
      checkType: "consistency",
      module: "surgeries",
      fieldPath: `surgeries[${s.id ?? i}].procedure`,
      original: text,
      suggestion,
      message: `"${text}" mentions a ${surgTerm.organ} transplant, but your condition list shows a ${conditionTerm.organ} transplant: same procedure, different terminology?`,
      fix: { store: "mi_surgeries", id: s.id, field: "procedure", value: suggestion, safeBatch: false },
    }));
  });
  return out;
}

// ── Vitals & labs plausibility (A-12) ────────────────────────────────────────
// Background audit pass reusing the same deterministic checks as the entry-time
// guard (src/lib/plausibility.js) — surfaces anything that reached storage
// implausible (synced from another device, a soft-band value the patient
// confirmed, or an extraction path with no gate of its own yet) into the same
// Review Queue as every other RIE finding. Distinct from the tripwire (A-01):
// this flags input-shape problems, not genuine clinical extremes. DEC-019.
export function checkVitalPlausibility() {
  const readings = safe("mi_readings");
  const out = [];
  readings.forEach((r, i) => {
    const fieldIssues = checkVitalReading(r);
    Object.entries(fieldIssues).forEach(([field, issue]) => {
      out.push(mkFinding({
        severity: issue.band === "hard" ? "warning" : "info",
        checkType: "consistency",
        module: "vitals",
        fieldPath: `readings[${r.id ?? i}].${field}`,
        original: `${issue.label}: ${r[field]} ${issue.unit}`,
        message: `${issue.label} of ${r[field]} ${issue.unit} on ${r.date || "an unknown date"} is ${issue.band === "hard" ? "outside a plausible range" : "far from a typical range"}. Check for a data-entry error.`,
      }));
    });
    checkVitalCrossFields(r).forEach(issue => {
      out.push(mkFinding({
        severity: "info",
        checkType: "consistency",
        module: "vitals",
        fieldPath: `readings[${r.id ?? i}].${issue.fields.join("+")}`,
        original: issue.fields.map(f => `${f}: ${r[f]}`).join(", "),
        message: `${issue.message} (reading on ${r.date || "an unknown date"})`,
      }));
    });
  });
  return out;
}

export function checkLabPlausibility() {
  const labs = safe("mi_labs");
  const out = [];
  labs.forEach((l, i) => {
    const issue = checkLabReading(l);
    if (!issue.band) return;
    out.push(mkFinding({
      severity: issue.band === "hard" ? "warning" : "info",
      checkType: "consistency",
      module: "labs",
      fieldPath: `labs[${i}].value`,
      original: `${l.name}: ${l.value} ${issue.unit}`,
      message: `${l.name} of ${l.value} ${issue.unit}${l.date ? ` on ${l.date}` : ""} is ${issue.band === "hard" ? "outside a plausible range" : "far from a typical range"}. Check for a data-entry error.`,
    }));
  });
  return out;
}

export function runConsistency() {
  return [
    ...checkMedications(),
    ...checkLabs(),
    ...checkProviders(),
    ...checkConditionsAllergies(),
    ...checkDocumentsRecords(),
    ...checkTransplantTerminology(),
    ...checkVitalPlausibility(),
    ...checkLabPlausibility(),
  ];
}
