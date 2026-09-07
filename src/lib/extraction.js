// ── Extraction interface (ONBOARDING_SPEC v1.1 §4.1–§4.3, work order) ────────
// SINGLE entry point for every onboarding extraction. Two implementations
// behind one interface: `fixture` (the spec's demo dataset — the shipped
// default) and `live` (a Render proxy extraction route). Selected by
// VITE_EXTRACTION_MODE. The §3.0 consent gate is enforced HERE, at the
// choke point: no extraction of any kind runs while consents.ai_processing
// is not true — fixture mode included, so the gate is testable end-to-end.
//
// AUDIT_SEC_02 F-09: the proxy does not yet expose an onboarding-extraction
// route, so `live` mode is NOT wired end-to-end — fixture is the only
// functional path today. The old `live` code POSTed to a nonexistent
// `/extract` with its own copy of the bearer-auth header, the exact
// "each surface rolls its own fetch" drift the unified aiClient (A-02) exists
// to prevent. Until the route decision lands (route name + response shape),
// live mode fails loudly rather than silently 404-ing; when it ships it must
// go THROUGH aiClient so auth is attached in exactly one place.

import { extractionAllowed } from "./onboardingState.js";
import { buildFixtureResult } from "./fixtureExtraction.js";

export const EXTRACTION_MODE = import.meta.env?.VITE_EXTRACTION_MODE === "live" ? "live" : "fixture";

export const PAGES_PER_CALL = 15; // §4.2: batch ≤15 pages per model call, merge client-side

export class ExtractionConsentError extends Error {
  constructor() { super("AI processing consent has not been granted: extraction is blocked."); this.name = "ExtractionConsentError"; }
}

/** Thrown when live extraction is requested but the proxy route isn't wired yet (F-09). */
export class ExtractionNotWiredError extends Error {
  constructor() { super("Live extraction is not available yet. The proxy extraction route is not implemented. Use fixture mode."); this.name = "ExtractionNotWiredError"; }
}

function assertConsent() {
  if (!extractionAllowed()) throw new ExtractionConsentError();
}

/** Merge multiple §4.1 results for one logical document (page batching). */
export function mergeExtractionResults(results, sourceName) {
  const docs = results.flatMap(r => r?.documents || []);
  if (docs.length === 0) return { documents: [] };
  return {
    documents: [{
      source_name: sourceName || docs[0].source_name || "Document",
      doc_date: docs.map(d => d.doc_date).find(Boolean) || null,
      doc_date_confidence: docs.map(d => d.doc_date_confidence).find(c => c != null) ?? null,
      items: docs.flatMap(d => d.items || []),
    }],
  };
}

// The single network primitive for live extraction. Deliberately unimplemented
// (F-09): there is no proxy extraction route yet, and when there is, this must
// be built through aiClient (single auth attachment point) — not a private
// fetch + a duplicated bearer header. Fails loudly so `live` mode can never
// silently POST document text to a nonexistent endpoint.
async function proxyExtract(_body) {
  throw new ExtractionNotWiredError();
}

/**
 * Text-path extraction (§4.2): pdf.js page texts or portal paste.
 * @param {object} opts
 * @param {string} opts.sourceName - e.g. the file name, or "Pasted from portal"
 * @param {string[]} opts.pageTexts - one string per page (paste = single "page")
 * @returns {Promise<object>} §4.1 result
 */
export async function extractText({ sourceName, pageTexts }) {
  assertConsent();
  if (EXTRACTION_MODE === "fixture") return buildFixtureResult();
  const batches = [];
  for (let i = 0; i < pageTexts.length; i += PAGES_PER_CALL) {
    batches.push(pageTexts.slice(i, i + PAGES_PER_CALL));
  }
  const results = [];
  for (const [bi, batch] of batches.entries()) {
    results.push(await proxyExtract({
      mode: "text",
      source_name: sourceName,
      pages: batch,
      page_offset: bi * PAGES_PER_CALL,
    }));
  }
  return mergeExtractionResults(results, sourceName);
}

/**
 * Vision-path extraction (§4.3): photos or scanned-PDF page renders.
 * @param {object} opts
 * @param {string} opts.sourceName
 * @param {string[]} opts.images - data URLs, already downscaled (≤6 per doc)
 * @param {string} [opts.docTypeHint]
 * @returns {Promise<object>} §4.1 result
 */
export async function extractVision({ sourceName, images, docTypeHint }) {
  assertConsent();
  if (EXTRACTION_MODE === "fixture") return buildFixtureResult();
  return proxyExtract({
    mode: "vision",
    source_name: sourceName,
    doc_type_hint: docTypeHint || null,
    images: images.map(dataUrl => {
      const [meta, data] = dataUrl.split(",");
      return { media_type: /data:([^;]+)/.exec(meta)?.[1] || "image/jpeg", data };
    }),
  });
}
