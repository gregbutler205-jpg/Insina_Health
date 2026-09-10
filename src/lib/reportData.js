// Reports-read-reconciled-only accessor (HISTORY_BUILDER_SPEC section 7,
// DEC-P53). The single data source for report generators.
// It exposes the reconciled stores and, deliberately, NO document content:
// archive-tier documents surface as metadata only (id, title, date, tier),
// never text. A document whose tier field is absent counts as 'archive';
// that default IS the tier semantics, so no writer needs patching for new
// documents to be archive-tier.
//
// Known boundary, reported in the WO session log: Consultation Prep's AI
// context path (Tab14 buildDocContext) reads document text today and is an
// existing read path protected by WO Phase 1.3 ("must not alter any current
// read path"). It stays untouched; the print generators consume this
// accessor and are covered by the isolation test.

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw);
    return v == null ? fallback : v;
  } catch { return fallback; }
}

export function docTier(doc) {
  return doc && doc.tier === "linked" ? "linked" : "archive";
}

/** Everything a report generator may read. No document text fields exist on
 *  the returned object, so archive content cannot reach report output through
 *  this accessor by construction. */
export function getReportSources() {
  const docsMeta = [...readJson("mi_documents", []), ...readJson("mi_ref_docs", [])]
    .map(d => ({ id: d?.id, title: d?.title || d?.name || "", date: d?.date || d?.addedDate || "", tier: docTier(d) }));
  return {
    profile: readJson("mi_profile_personal", {}),
    insurance: readJson("mi_profile_insurance", {}),
    meds: readJson("mi_meds_full", []),
    conditions: readJson("mi_conditions", []),
    allergies: readJson("mi_allergies", []),
    careTeam: readJson("mi_care_team", []),
    labs: readJson("mi_labs", []),
    readings: readJson("mi_readings", []),
    appointments: readJson("mi_appointments", []),
    surgeries: readJson("mi_surgeries", []),
    diagnostics: readJson("mi_diagnostics", []),
    pharmacies: readJson("mi_pharmacies", []),
    emergencyContacts: readJson("mi_emergency_contacts", []),
    cards: readJson("mi_cards", []),
    labCategoryOrder: readJson("mi_lab_category_order", null),
    attestations: { medsCompleteAt: null, allergiesResolvedAt: null, conditionsReviewedAt: null, ...readJson("mi_attestations", {}) },
    documentsMeta: docsMeta,
  };
}

/** The three list attestations (nulls when never confirmed). */
export function readAttestations() {
  return { medsCompleteAt: null, allergiesResolvedAt: null, conditionsReviewedAt: null, ...readJson("mi_attestations", {}) };
}

/** C-24 provenance line, verbatim template from spec section 11. Returns an
 *  empty string when the list was never confirmed, so generators can append
 *  unconditionally. */
export function provenanceLine(listName, confirmedAtIso) {
  if (!confirmedAtIso) return "";
  const d = new Date(confirmedAtIso);
  const date = isNaN(d) ? confirmedAtIso : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  return `${listName} confirmed by patient on ${date}`;
}
