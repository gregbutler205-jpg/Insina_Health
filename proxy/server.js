// ─────────────────────────────────────────────────────────────────────────────
// Insina Health — Anthropic API Proxy
// Node.js / Express — deploy to Render (free tier)
//
// Responsibilities:
//  • Accepts POST /api/chat from the browser (streaming or JSON)
//  • Accepts POST /api/extract-pdf for Claude Vision OCR of scanned documents
//  • Forwards requests to Anthropic's messages API
//  • Pipes SSE streams or JSON back to the browser unchanged
//  • Zero-logging: no request body, no health data, no API key fragments stored
//  • Rate limiting (S-05/PG-04): 60 req/IP/hour on /api/chat, 20 req/IP/hour on
//    /api/extract-pdf — enforced.
//  • Pilot auth (S-05 item 3): Authorization: Bearer <token> checked against
//    PILOT_TOKENS, gated behind PILOT_AUTH_ENFORCED (default off — see below).
//  • CORS: restricted to approved origins
//
// Body limits are route-specific (not global) so large image batches can reach
// /api/extract-pdf without blocking the smaller /api/chat endpoint.
// ─────────────────────────────────────────────────────────────────────────────

import express           from "express";
import cors              from "cors";
import rateLimit         from "express-rate-limit";
import fetch             from "node-fetch";
import { createServer }  from "http";

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Trust exactly one reverse-proxy hop (AUDIT_SEC_02 F-02) ──────────────────
// Render terminates TLS at its own load balancer and forwards to this
// container over HTTP, so every request arrives with Render's LB as
// req.socket.remoteAddress — without this, express-rate-limit keys its 60/hr
// and 20/hr caps on that single shared LB address (one bucket for every user
// combined) rather than the real client IP in X-Forwarded-For.
// `1` (not `true`): trust exactly the outermost hop. Express then reads the
// real client IP as the entry ONE STEP IN from the right of X-Forwarded-For —
// a value a client tries to prepend itself is still ignored, only what
// Render's own LB appended is trusted. `true` would trust the entire header
// as supplied, letting any client spoof its rate-limit identity outright.
app.set("trust proxy", 1);

// ── Health check — before CORS so monitoring tools always reach it ─────────────
app.get("/health", (_req, res) => res.json({ status: "ok", ts: new Date().toISOString() }));

// ── CORS ──────────────────────────────────────────────────────────────────────
// Allow approved origins. Add localhost entries for local dev.
const ALLOWED_ORIGINS = [
  "https://insinahealth.com",            // custom domain (apex)
  "https://www.insinahealth.com",        // custom domain (www)
  "https://gregbutler205-jpg.github.io", // GitHub Pages fallback
  "http://localhost:5173",               // Vite dev server
  "http://localhost:4173",               // Vite preview
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, health checks) in any env
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin not allowed — ${origin}`));
  },
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
}));

// NOTE: No global body parser. Each route applies its own limit so that
// /api/extract-pdf can accept large image batches (up to 30 MB) while
// /api/chat stays capped at 256 KB.

// ── Rate limiting (S-05 / PG-04 — enforced) ───────────────────────────────────
// CORS is not authentication; these caps bound what any single IP can spend.
// The Anthropic-console monthly spend cap is the backstop (HUMAN-managed).
// Per-pilot-user bearer tokens (S-05 item 3) land in Phase 1.
const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60, // /api/chat: 60 requests per IP per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Rate limit exceeded. Please try again later." },
});

// /api/extract-pdf is the expensive route (Vision OCR, up to 15 page images per
// call) — a full import session is a handful of batches, so 20/hour is ample
// for real use while capping abuse at a fraction of the chat budget.
const extractLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20, // /api/extract-pdf: 20 requests per IP per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Rate limit exceeded for document extraction. Please try again later." },
});

// ── Pilot bearer-token auth (S-05 item 3 / PG-04) ─────────────────────────────
// PILOT_TOKENS: comma-separated random tokens, one issued out-of-band per
// invited pilot user (see proxy/DEPLOY.md for the issuance/rotation
// procedure). Enforcement is gated behind PILOT_AUTH_ENFORCED so the client
// (which now always sends the header, once it has one) can deploy first
// without locking anyone out — enforcement is switched on separately, after
// tokens exist. Unset or any value other than "true" = enforcement OFF
// (today's open-during-founder-testing behavior; matches "default off").
function pilotAuth(req, res, next) {
  const enforced = process.env.PILOT_AUTH_ENFORCED === "true";
  if (!enforced) return next();

  const validTokens = (process.env.PILOT_TOKENS || "")
    .split(",")
    .map(t => t.trim())
    .filter(Boolean);

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  // Zero-logging: never log the header or token value, valid or not.
  if (!token || !validTokens.includes(token)) {
    return res.status(401).json({ error: "Missing or invalid access token." });
  }
  next();
}

// ── /api/chat — SSE streaming or JSON passthrough (1 MB body limit) ───────────
// 256 KB was too tight: a rich record (all labs/vitals/meds + reference
// documents) exceeds it and the proxy returns 413 before reaching Claude, whose
// context window is far larger. 1 MB comfortably fits a full record; the client
// also caps reference-document text so payloads stay well within model limits.
app.post("/api/chat", express.json({ limit: "1mb" }), limiter, pilotAuth, async (req, res) => {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "Server configuration error: missing API key." });
  }

  // Validate request shape — must have model + messages
  const { model, max_tokens, system, messages, stream } = req.body;

  if (!model || !messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Invalid request: model and messages are required." });
  }

  // Only allow approved models. The prior generation stays allowed so a
  // stale cached app bundle keeps working through the upgrade window.
  const ALLOWED_MODELS = [
    "claude-haiku-4-5",   // companion: cheap/short work (AI Lite, Quick Log, short visit summaries)
    "claude-sonnet-5",
    "claude-opus-5",
    "claude-sonnet-4-6",  // previous generation — remove after the 5-family bundle is everywhere
    "claude-opus-4-6",
  ];
  if (!ALLOWED_MODELS.includes(model)) {
    return res.status(400).json({ error: "Requested model is not permitted." });
  }

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        // Prompt caching beta header — required for cache_control blocks
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
      body: JSON.stringify({
        model,
        max_tokens: Math.min(max_tokens || 1024, 4096), // cap at 4096
        stream: stream === true,  // respect client preference; default false
        system,
        messages,
      }),
    });

    if (!anthropicRes.ok) {
      // F-13: preserve the status (clients key their 429/503/413 copy on it) but
      // do NOT echo the upstream error body — an Anthropic invalid_request_error
      // can carry a fragment of the request back to the client. Send a generic body.
      return res.status(anthropicRes.status).json({ error: "The AI service returned an error." });
    }

    if (stream === true) {
      // ── SSE stream passthrough (Tab11 AI chat) ────────────────────────────
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("X-Accel-Buffering", "no"); // disable Nginx buffering on Render
      anthropicRes.body.pipe(res);
      req.on("close", () => { anthropicRes.body.destroy(); });
    } else {
      // ── Non-streaming JSON passthrough (Tab05 labs, Tab09 extraction, Tab14 consult) ─
      res.setHeader("Content-Type", "application/json");
      anthropicRes.body.pipe(res);
    }

  } catch (err) {
    // Zero-logging: do NOT log err.message as it may contain request data
    if (!res.headersSent) {
      res.status(502).json({ error: "Upstream connection error." });
    }
  }
});

// ── /api/extract-pdf — Claude Vision OCR for scanned documents (30 MB body) ───
//
// Accepts batches of up to 15 rendered PDF pages (JPEG, base64-encoded).
// Each page is rendered client-side via PDF.js, exported as a JPEG canvas
// snapshot, and sent here for Vision-based OCR.
//
// Request body:  { pages: [{ pageNum: number, imageBase64: string }] }
// Response body: { text: string, pageCount: number }
//
// The caller is responsible for splitting large PDFs into ≤15 page batches
// and assembling the full text from multiple responses.
// ─────────────────────────────────────────────────────────────────────────────
app.post("/api/extract-pdf", express.json({ limit: "30mb" }), extractLimiter, pilotAuth, async (req, res) => {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "Server configuration error: missing API key." });
  }

  const { pages } = req.body;

  if (!pages || !Array.isArray(pages) || pages.length === 0) {
    return res.status(400).json({ error: "Invalid request: pages array is required." });
  }
  if (pages.length > 15) {
    return res.status(400).json({ error: "Maximum 15 pages per batch." });
  }
  // Basic shape validation — each page needs pageNum and imageBase64
  for (const p of pages) {
    if (typeof p.pageNum !== "number" || typeof p.imageBase64 !== "string" || !p.imageBase64) {
      return res.status(400).json({ error: "Each page must have pageNum (number) and imageBase64 (string)." });
    }
  }

  // Build content array: system instruction + interleaved page labels and images
  const content = [
    {
      type: "text",
      text: "You are a medical document OCR assistant. Extract all text from the following document pages exactly as written. Preserve medical terminology, lab values, numbers, dates, medication names, dosages, and document structure. Do not summarize or interpret — transcribe only.",
    },
  ];

  for (const page of pages) {
    content.push({
      type: "text",
      text: `--- Page ${page.pageNum} ---`,
    });
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/jpeg",
        data: page.imageBase64,
      },
    });
  }

  content.push({
    type: "text",
    text: "Return the extracted text from each page with --- Page N --- headers separating them. Return extracted text only — no commentary, no summaries, no explanations.",
  });

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        // No prompt-caching header here — image content is unique per upload
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 4096,
        messages: [{ role: "user", content }],
      }),
    });

    if (!anthropicRes.ok) {
      // F-13: status preserved, upstream body not echoed (see /api/chat above).
      return res.status(anthropicRes.status).json({ error: "The AI service returned an error." });
    }

    const result = await anthropicRes.json();
    // Claude 5 replies can lead with a "thinking" block; take every text block, not the first block.
    const text = (Array.isArray(result.content) ? result.content : []).filter(b => b && b.type === "text").map(b => b.text || "").join("");
    res.json({ text, pageCount: pages.length });

  } catch (err) {
    if (!res.headersSent) {
      res.status(502).json({ error: "Upstream connection error." });
    }
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
createServer(app).listen(PORT, () => {
  console.log(`Insina proxy running on port ${PORT}`);
});
