// ── Unified AI client (A-02 / PG-08) ─────────────────────────────────────────
// One module for every AI call in the app. Before this, each surface rolled
// its own fetch — which is how Tab10 drifted to a direct-to-Anthropic call
// with a missing required header, a stale model string, and the patient's
// name in the prompt; and how Tab12 grew a 429 fallback straight to
// api.anthropic.com. Both are eliminated here. Every surface now targets the
// proxy only; the BYO-key path (if kept — A-10) is dormant until S-08
// hardens it to go through the proxy per-request, never called directly from
// the page again.
//
// Design note: callAI() returns the raw fetch Response, exactly like the
// fetch() calls it replaces. Each surface keeps its own response-status
// handling (503 cold-start copy, 413 payload-too-large copy, etc.) — those
// messages are deliberately tailored per surface. This function centralizes
// what actually drifted: the model string, the token ceiling, the target
// URL, and the bearer token (S-05 item 3) — not the per-surface error copy,
// which is not what broke.

import { getPilotToken } from "./pilotAuth.js";
import { isDemoMode } from "./secureStorage.js";

// The public demo runs on its own origin, which is deliberately kept off the
// proxy's CORS allowlist so a public demo can never spend the AI budget
// (AUDIT_SEC_02 F-12 — security-positive, accepted). The side effect was ugly:
// the browser reports a blocked cross-origin request as "Failed to fetch",
// which every surface's error handling reads as a Render cold start. The demo
// therefore told visitors "Server is waking up… click Retry" — advice that can
// never come true. Short-circuiting here, at the one place every AI call goes
// through, replaces a misleading transient-sounding error with the truth.
export const DEMO_AI_MESSAGE =
  "AI features are turned off in this public demo, so it can't run up an API bill. " +
  "Everything else is fully interactive. To see what the AI produces, open My Notes: " +
  "a saved example analysis is waiting there.";

function demoBlockedResponse() {
  // A real Response object so callers keep their normal res.ok / res.json()
  // handling. 403 (not 503) on purpose: 503 is the cold-start code several
  // surfaces map to "server waking up", which is exactly the wrong message.
  return new Response(JSON.stringify({ error: DEMO_AI_MESSAGE, demo: true }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}

// Optional-chained so this module also loads under plain Node (test harnesses);
// Vite always defines import.meta.env in the browser build.
// VITE_PROXY_URL comes from the tracked, PUBLIC-only .env.production at build
// time (see .gitignore's intentional !.env.production negation, AUDIT_SEC_02
// F-10); the localhost default is the dev fallback.
const PROXY_URL = import.meta.env?.VITE_PROXY_URL || "http://localhost:3001";

// Resolved once, in one place. "extraction" and "lite" are not literally
// standard/advanced modes but are real, already-shipped tiers: extraction
// covers Tab09/Tab12's document-parsing calls (spec: "extraction: sonnet"),
// and "lite" is the companion's pre-existing cheap tier (claude-haiku-4-5 —
// already on the proxy's ALLOWED_MODELS list, used for AI Lite / Quick Log /
// short visit summaries). Promoting it into MODEL_MAP here doesn't add a new
// capability, it just stops the companion from hardcoding its own copy of
// the model string.
// v1.52.1 rollback: the Render proxy does NOT auto-deploy from this repo, so
// its live allowlist still rejects the Claude 5 ids — the v1.52.0 bundle made
// every AI question error. Client stays on 4.6 until the proxy is manually
// redeployed (Render dashboard → insina-health → Deploy latest commit); the
// proxy's allowlist in this repo already accepts BOTH generations, so the
// re-upgrade is a strings-only change here once that click happens.
export const MODEL_MAP = {
  standard:   "claude-sonnet-4-6",
  advanced:   "claude-opus-4-6",
  extraction: "claude-sonnet-4-6",
  lite:       "claude-haiku-4-5",
};

// Per-surface max_tokens, promoted from the literal each call site already
// used — not new values. The proxy clamps to 4096 server-side regardless;
// callAI clamps client-side too so a caller never has to guess.
export const SURFACE_MAX_TOKENS = {
  "labs.fullAnalysis":         1800, // Tab05
  "labs.qa":                   1024, // Tab05
  "documents.summarize":       1500, // Tab09
  "documents.findings":        2048, // Tab09
  "notes.summary":              700, // Tab10
  "chat.standard":              1024, // Tab11 main chat, standard mode
  "chat.advanced":              2048, // Tab11 main chat, advanced mode
  "chat.summary":               1400, // Tab11 conversation summary
  "extraction.docMeta":        1024, // Tab12 non-lab document metadata
  "extraction.labs":           4096, // Tab12 lab-report chunk extraction
  "appointments.prep":         1024, // Tab14 consultation prep
  "companion.visitPrep":       1024,
  "companion.chat":              512, // askInsinaStream default
  "companion.symptomPrep":      1024, // Surface G: symptom prep + context gathering (A-13)
  "companion.oneShot":         1024, // askInsina default
  "companion.flagSelect":       200, // selectRelevantFlags
  "companion.jsonStructured":  1024, // askInsinaJSON default
};

const PROXY_HARD_CEILING = 4096;

/**
 * Bearer token attachment point (S-05 item 3). Returns {} when no pilot
 * token is stored — the normal state for founder-only use, and harmless
 * against the proxy either way since enforcement defaults off there until
 * real tokens exist.
 */
function getAuthHeaders() {
  const token = getPilotToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * The single entry point for a chat-completion call to the proxy.
 *
 * @param {object} opts
 * @param {string} [opts.surface]   - key into SURFACE_MAX_TOKENS, e.g. "chat.standard"
 * @param {string} [opts.mode]      - "standard" | "advanced" | "extraction" | "lite" — resolves the model via MODEL_MAP
 * @param {string} [opts.model]     - explicit model string; overrides `mode` resolution if both are given (escape hatch, should be rare)
 * @param {number} [opts.maxTokens] - explicit max_tokens; overrides the SURFACE_MAX_TOKENS lookup if given
 * @param {Array|string} [opts.system] - system prompt (string or content-block array with cache_control)
 * @param {Array} opts.messages     - Anthropic-shaped messages array
 * @param {boolean} [opts.stream]   - SSE streaming
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<Response>} the raw fetch Response — callers keep their existing res.ok / res.json() / res.body.getReader() handling
 */
export async function callAI({ surface, mode, model, maxTokens, system, messages, stream = false, signal }) {
  if (isDemoMode()) return demoBlockedResponse();
  const resolvedModel = model || MODEL_MAP[mode] || MODEL_MAP.standard;
  const resolvedMaxTokens = Math.min(maxTokens ?? SURFACE_MAX_TOKENS[surface] ?? 1024, PROXY_HARD_CEILING);

  return fetch(`${PROXY_URL}/api/chat`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({
      model: resolvedModel,
      max_tokens: resolvedMaxTokens,
      stream,
      system,
      messages,
    }),
  });
}

/**
 * Vision OCR batch extraction — the proxy's other route. Folded into this
 * module (not a separate ad-hoc fetch) so there is genuinely one place that
 * attaches auth once S-05 item 3 requires a bearer token on this route too
 * (per S-05: "the proxy rejects missing or unknown tokens on /api/chat AND
 * /api/extract-pdf"). Model is fixed server-side for this route (proxy
 * hardcodes claude-sonnet-5 for Vision OCR), so there is no model param.
 *
 * @param {Array<{pageNum:number, imageBase64:string}>} pages
 * @returns {Promise<{text:string, pageCount:number}>}
 */
export async function extractPdfVision(pages) {
  if (isDemoMode()) throw new Error(DEMO_AI_MESSAGE);
  const r = await fetch(`${PROXY_URL}/api/extract-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ pages }),
  });
  if (!r.ok) throw new Error(`Extract PDF ${r.status}`);
  return r.json();
}
