// ── Insina Health localStorage data store ────────────────────────────────────
// All health data lives here. Keys are prefixed with "mi_".

const DEFAULTS = {
  readings:           [],
  meds:               [],
  alerts:             [],
  upcoming:           [],
  labs:               [],
  records:            [],
  lastImport:         null,
  importLog:          [],
  meds_full:          [],
  meds_pending:       [],
  watch_daily:        [],
  care_team:          [],
  allergies:          [],
  emergency_contacts: [],
  profile_personal:   {},
  profile_insurance:  {},
};

export function getStore(key) {
  try {
    const raw = localStorage.getItem(`mi_${key}`);
    return raw ? JSON.parse(raw) : DEFAULTS[key];
  } catch {
    return DEFAULTS[key];
  }
}

export function setStore(key, value) {
  localStorage.setItem(`mi_${key}`, JSON.stringify(value));
}

// Merge new readings with existing ones, deduplicating by date (ts), newest first
export function mergeReadings(newReadings) {
  const existing = getStore('readings');
  const map = new Map();
  [...existing, ...newReadings].forEach(r => map.set(r.ts, r));
  const merged = Array.from(map.values()).sort(
    (a, b) => new Date(b.ts) - new Date(a.ts)
  );
  setStore('readings', merged);
  return merged;
}

// Merge new meds with existing, deduplicating by name
export function mergeMeds(newMeds) {
  const existing = getStore('meds');
  const map = new Map();
  existing.forEach(m => map.set(m.name.toLowerCase(), m));
  newMeds.forEach(m => map.set(m.name.toLowerCase(), { ...map.get(m.name.toLowerCase()), ...m }));
  const merged = Array.from(map.values());
  setStore('meds', merged);
  return merged;
}

// Merge new labs with existing
export function mergeLabs(newLabs) {
  const existing = getStore('labs');
  const merged = [...newLabs, ...existing];
  setStore('labs', merged);
  return merged;
}

// Records (Tab03)
export function getRecords() { return getStore('records') ?? []; }
export function setRecords(records) { setStore('records', records); }
export function mergeRecords(newRecords) {
  const existing = getStore('records');
  const map = new Map();
  existing.forEach(r => map.set(r.epicId ?? r.title + r.date, r));
  newRecords.forEach(r => map.set(r.epicId ?? r.title + r.date, r));
  const merged = Array.from(map.values()).sort((a,b) => new Date(b.date) - new Date(a.date));
  setStore('records', merged);
  return merged;
}

// For Tab04: get/set the rich medication list
export function getMedsFull() {
  return getStore('meds_full') ?? [];
}
export function setMedsFull(meds) { setStore('meds_full', meds); }

export function getPendingMeds() { return getStore('meds_pending'); }
export function setPendingMeds(meds) { setStore('meds_pending', meds); }

// ── Profile helpers ────────────────────────────────────────────────────────────
// DEC-047: the two profile OBJECT stores stamp every save with updatedAt so
// the Drive merge's newer-object-wins rule carries edits and field deletions
// across syncs. Stamping here (the setter) covers every caller at once.
export function getProfilePersonal() { return getStore('profile_personal') ?? {}; }
export function setProfilePersonal(v) { setStore('profile_personal', { ...v, updatedAt: Date.now() }); }

export function getProfileInsurance() { return getStore('profile_insurance') ?? {}; }
export function setProfileInsurance(v) { setStore('profile_insurance', { ...v, updatedAt: Date.now() }); }

export function getCareTeam() { return getStore('care_team') ?? []; }
export function setCareTeam(v) { setStore('care_team', v); }

export function getAllergies() { return getStore('allergies') ?? []; }
export function setAllergies(v) { setStore('allergies', v); }

export function getEmergencyContacts() { return getStore('emergency_contacts') ?? []; }
export function setEmergencyContacts(v) { setStore('emergency_contacts', v); }
// Pharmacies (mi_pharmacies): the patient's own pharmacy contacts — retail,
// mail-order, and specialty. Separate from the free-text `pharmacy` label on
// each medication, which names WHERE a fill came from but carries no phone or
// address. Managed mi_* key: encrypted at rest, synced, tombstone-aware.
export function getPharmacies() { return getStore('pharmacies') ?? []; }
export function setPharmacies(v) { setStore('pharmacies', v); }

// Diagnostics (observational studies: imaging, EKG, EMG, …). Supersedes the
// old 'imaging' store — migration v3 moves mi_imaging entries here. The
// dividing line is intent: Procedures (mi_surgeries) is anything done to
// intervene, biopsy, or treat; Diagnostics is anything recorded to observe.
export function getDiagnostics() { return getStore('diagnostics') ?? []; }
export function setDiagnostics(v) { setStore('diagnostics', v); }

// Cross-section reads used by Profile
export function getConditions() {
  try { const r = localStorage.getItem('mi_conditions'); return r ? JSON.parse(r) : []; }
  catch { return []; }
}
export function getSurgeries() {
  try { const r = localStorage.getItem('mi_surgeries'); return r ? JSON.parse(r) : []; }
  catch { return []; }
}
export function getLatestReading() {
  const readings = getStore('readings') ?? [];
  return readings.length > 0 ? readings[0] : null;
}

// v1.49.3: age is CALCULATED from DOB wherever it displays — the stored
// profile "age" field goes stale every birthday. Same algorithm P-01's AI
// identity payload has always used (identity.js getAge). The T12:00:00
// anchor keeps an ISO date from sliding a day in western timezones.
// Returns whole years, or null when DOB is missing/unparseable (callers
// fall back to the stored field for legacy records without a DOB).
export function ageFromDob(dobStr) {
  if (!dobStr) return null;
  const dob = new Date(String(dobStr).length === 10 ? dobStr + "T12:00:00" : dobStr);
  if (isNaN(dob)) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age >= 0 && age < 150 ? age : null;
}

// v1.49.0: the patient's CURRENT weight lives in Vitals — the Health Profile
// and the emergency packet auto-fill from the newest reading that actually
// carries one (the newest reading overall may be BP-only). Returns the
// reading, or null when no weight has ever been logged (callers fall back to
// the manually entered profile field).
export function latestWeightReading() {
  const readings = getStore('readings') ?? [];
  const ts = r => {
    const t = new Date(r.date || r.ts || r.enteredAt || 0).getTime();
    return Number.isFinite(t) ? t : 0;
  };
  let best = null;
  for (const r of readings) {
    if (r == null || r.weight == null || r.weight === "" || isNaN(parseFloat(r.weight))) continue;
    if (!best || ts(r) > ts(best)) best = r;
  }
  return best;
}

// Add an import log entry
export function addImportLog(entry) {
  const log = getStore('importLog');
  const updated = [entry, ...log].slice(0, 50); // keep last 50
  setStore('importLog', updated);
  setStore('lastImport', new Date().toISOString());
}

// UI-16: one truthful "Last import" label for every topbar that shows it.
// Entries are PREPENDED above, so the newest is [0] — Tab05 formerly read the
// oldest ([length-1]) and Tab04 hardcoded a date.
export function getLastImportLabel() {
  try {
    const log = getStore('importLog');
    if (log.length && log[0].ts) {
      return new Date(log[0].ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
  } catch { /* fall through */ }
  return "–";
}
