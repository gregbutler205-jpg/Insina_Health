// ── Deterministic record query: answer questions FROM the record, no AI ──────
// Search is a search of what is already in Insina ("which doctor did my EGD",
// "when was my last cervical MRI", "what's my dosage of tacrolimus"). Those are
// lookups, not analysis: the answer is sitting in the record, so the app reads
// it out directly — no tokens, no network, works offline and while the proxy is
// asleep. AI stays available as an explicit, secondary choice for questions
// that genuinely need reasoning across the record.
//
// Two problems this module fixes, both of which made question-shaped searches
// useless before:
//   1. Questions were routed to AI without the local record ever being searched.
//   2. Matching required the ENTIRE query as one contiguous substring, so
//      "cervical MRI" could not match a study named "MRI Cervical Spine" and
//      "which doctor did my EGD" matched nothing at all.
// Term-based AND matching (below) fixes both: strip the question scaffolding,
// then require every remaining content term to appear somewhere in the record.
//
// Safety posture: this only RETRIEVES and displays the patient's own stored
// values. It never interprets, never infers, and never states anything the
// record does not contain (DEC-001; the same "display, don't interpret" line
// the rest of the app holds).

// Question scaffolding + filler. Intent is detected BEFORE stripping, so words
// that carry intent ("last", "dose") can be removed from the match terms here.
const STOPWORDS = new Set([
  "what", "whats", "what's", "when", "where", "who", "whom", "which", "why", "how",
  "is", "are", "was", "were", "be", "been", "am", "do", "does", "did", "done",
  "has", "have", "had", "can", "could", "should", "would", "will", "shall",
  "my", "mine", "me", "i", "im", "i'm", "we", "our", "you", "your",
  "the", "a", "an", "of", "for", "on", "in", "at", "to", "from", "by", "with",
  "and", "or", "any", "all", "some", "it", "its", "that", "this", "there",
  "last", "latest", "most", "recent", "recently", "current", "currently", "now",
  "first", "earliest", "initial", "ever", "again",
  "dose", "dosage", "doses", "dosing", "much", "many", "take", "taking", "taken",
  "get", "got", "go", "went", "see", "saw", "tell", "show", "give", "about",
  "doctor", "dr", "physician", "provider", "surgeon", "performed", "perform",
  "ordered", "read", "date", "level", "levels", "value", "result", "results",
  "phone", "number", "numbers", "call", "contact", "fax", "address", "hours",
  "please", "s",
]);

// Category words name a SECTION rather than a record's contents: nothing inside
// a pharmacy entry literally says "pharmacy", so "what's my pharmacy phone
// number" has no usable content terms at all. Treat the section word as a hint
// — it selects the store to answer from instead of being matched against text.
const CATEGORY_HINTS = {
  pharmacy: "pharmacies", pharmacies: "pharmacies", pharmacist: "pharmacies", drugstore: "pharmacies",
};

/** The section a query names outright, or null. */
export function detectCategoryHint(query) {
  for (const w of String(query ?? "").toLowerCase().split(/[^a-z]+/)) {
    if (CATEGORY_HINTS[w]) return CATEGORY_HINTS[w];
  }
  return null;
}

/** Content terms: the query with question scaffolding and punctuation removed. */
export function extractTerms(query) {
  return String(query ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.'-]/gu, " ")   // keep decimals, apostrophes, hyphens
    .split(/\s+/)
    .map(t => t.replace(/^[.'-]+|[.'-]+$/g, ""))
    .filter(t => t && !STOPWORDS.has(t) && !CATEGORY_HINTS[t]);
}

/**
 * What KIND of answer the phrasing asks for. Purely lexical — no model.
 * kind: "who" | "when" | "dose" | "value" | "generic"
 */
export function detectIntent(query) {
  const q = String(query ?? "").toLowerCase();
  const wantsFirst = /\b(first|earliest|initial)\b/.test(q);
  const wantsLatest = !wantsFirst && /\b(last|latest|most recent|current|currently|now|newest)\b/.test(q);

  let kind = "generic";
  if (/\b(who|which)\b[\s\S]*\b(doctor|physician|provider|surgeon|performed|did|read|ordered|prescrib)/.test(q)
      || /^who\b/.test(q)) {
    kind = "who";
  } else if (/\bwhen\b/.test(q) || /\b(what|which)\s+date\b/.test(q)) {
    kind = "when";
  } else if (/\b(dose|dosage|dosing|how much|how many)\b/.test(q)) {
    kind = "dose";
  } else if (detectCategoryHint(q) === "pharmacies"
             || (/\b(phone|number|call|contact|fax|address)\b/.test(q) && /\b(pharmacy|pharmacies|drugstore)\b/.test(q))) {
    // Contact lookup for a place, not a clinical value. Checked BEFORE the
    // value branch, which would otherwise claim "…phone number" via "number".
    kind = "contact";
  } else if (/\b(level|value|result|count|reading|number)s?\b/.test(q)) {
    kind = "value";
  }
  return { kind, wantsLatest, wantsFirst, isQuestionShaped: kind !== "generic" || /\?$/.test(q.trim()) };
}

/** True when EVERY term appears somewhere in the record's searchable text. */
export function matchesTerms(haystackFields, terms) {
  if (!terms.length) return false;
  const hay = haystackFields.map(v => String(v ?? "").toLowerCase()).join("  ");
  return terms.every(t => hay.includes(t));
}

/** Short excerpt of `text` around the first hit of `query`, for result
 * subtitles. Lived inside SearchPopup until the v1.45.0 rewrite deleted the
 * definition but kept its caller — typing any letter that matched a source
 * document or AI message threw ReferenceError and blanked the app. */
export function snippet(text, query, radius = 100) {
  const t = String(text ?? "");
  if (!t) return "";
  const idx = t.toLowerCase().indexOf(String(query ?? "").toLowerCase());
  if (idx === -1) return t.slice(0, radius * 2) + (t.length > radius * 2 ? "…" : "");
  const s = Math.max(0, idx - radius);
  const e = Math.min(t.length, idx + String(query ?? "").length + radius);
  return (s > 0 ? "…" : "") + t.slice(s, e) + (e < t.length ? "…" : "");
}

const DATE_OF = r => String(r?.date || r?.record?.date || "");

/** Sort matches by date; newest first unless `oldestFirst`. Undated sink. */
export function sortByDate(results, oldestFirst = false) {
  return [...results].sort((a, b) => {
    const da = DATE_OF(a), db = DATE_OF(b);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return oldestFirst ? da.localeCompare(db) : db.localeCompare(da);
  });
}

const PROVIDER_FIELDS = ["surgeon", "readingProvider", "orderedBy", "provider", "prescriber", "physician", "doctor"];

function fmtDate(iso) {
  const s = String(iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || "";
  try {
    return new Date(s + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  } catch { return s; }
}

/**
 * Build a plain retrieval answer, or null when the record can't answer it.
 * Returns { text, sourceLabel, result } — `result` is the record the answer
 * came from, so the UI can link straight to it (never an answer without its
 * source). Only ever restates stored values.
 */
export function buildDirectAnswer(query, results) {
  const intent = detectIntent(query);
  if (!results?.length) return null;

  const ordered = sortByDate(results, intent.wantsFirst);
  const pick = (cats) => ordered.find(r => cats.includes(r.category));

  if (intent.kind === "who") {
    // Prefer records that actually name a person for this kind of question.
    const cand = ordered.find(r => PROVIDER_FIELDS.some(f => r.record?.[f])) || ordered[0];
    const field = PROVIDER_FIELDS.find(f => cand?.record?.[f]);
    if (!field) return null;
    const when = DATE_OF(cand);
    return {
      text: `${cand.record[field]}${when ? `: ${cand.title}, ${fmtDate(when)}` : `: ${cand.title}`}`,
      sourceLabel: "From your record",
      result: cand,
    };
  }

  if (intent.kind === "when") {
    const cand = ordered.find(r => DATE_OF(r));
    if (!cand) return null;
    const who = PROVIDER_FIELDS.map(f => cand.record?.[f]).find(Boolean);
    return {
      text: `${fmtDate(DATE_OF(cand))}: ${cand.title}${who ? ` (${who})` : ""}`,
      sourceLabel: intent.wantsFirst ? "Earliest in your record" : "Most recent in your record",
      result: cand,
    };
  }

  if (intent.kind === "dose") {
    const cand = pick(["medications"]);
    const dose = cand?.record?.dose || cand?.record?.strength;
    if (!cand || !dose) return null;
    const freq = cand.record.frequency ? `, ${cand.record.frequency}` : "";
    const inactive = cand.record.status && cand.record.status !== "active" ? `: marked ${cand.record.status}` : "";
    return { text: `${cand.title}: ${dose}${freq}${inactive}`, sourceLabel: "From your medication list", result: cand };
  }

  if (intent.kind === "contact") {
    // Pharmacy contact lookups ("what's my pharmacy's phone number") — the
    // primary pharmacy wins, then whatever matched first.
    const cands = ordered.filter(r => r.category === "pharmacies");
    const cand = cands.find(r => r.record?.primary) || cands[0];
    if (!cand) return null;
    const bits = [cand.record.phone, cand.record.address].filter(Boolean);
    if (!bits.length) return null;
    return {
      text: `${cand.title}: ${bits.join(" · ")}`,
      sourceLabel: cand.record.primary ? "Your primary pharmacy" : "From your record",
      result: cand,
    };
  }

  if (intent.kind === "value") {
    const cand = pick(["labs"]);
    if (!cand || cand.record?.value == null || cand.record.value === "") return null;
    const unit = cand.record.unit ? ` ${cand.record.unit}` : "";
    const when = DATE_OF(cand) ? ` on ${fmtDate(DATE_OF(cand))}` : "";
    const flag = cand.record.flag ? " · flagged" : "";
    return { text: `${cand.title}: ${cand.record.value}${unit}${when}${flag}`, sourceLabel: "Most recent in your record", result: cand };
  }

  return null;
}
