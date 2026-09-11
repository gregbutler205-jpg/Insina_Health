// ── v1.63.1: reading a Messages reply from a Claude 5 model ───────────────────
// Sonnet 5 and Opus 5 return a "thinking" block before the text block
// (adaptive thinking is on by default), so `data.content[0].text` is
// undefined and every import and analysis failed with "Cannot read properties
// of undefined (reading 'trim')" the day the app moved to the Claude 5 ids.
// This suite pins the one extractor and that no reader bypasses it.
// Run: npm run test:ai-response

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = (p) => join(__dirname, "..", "src", p);

class Storage {
  constructor() { this._m = new Map(); }
  getItem(k) { return this._m.has(k) ? this._m.get(k) : null; }
  setItem(k, v) { this._m.set(k, String(v)); }
  removeItem(k) { this._m.delete(k); }
  clear() { this._m.clear(); }
  key(i) { return [...this._m.keys()][i] ?? null; }
  get length() { return this._m.size; }
}
globalThis.Storage = Storage;
globalThis.localStorage = new Storage();
globalThis.sessionStorage = new Storage();
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("PASS — " + m); } else { fail++; console.log("FAIL — " + m); } };

const { responseText } = await import("../src/lib/aiClient.js");

// ── 1. The extractor ─────────────────────────────────────────────────────────
ok(responseText({ content: [{ type: "thinking", thinking: "..." }, { type: "text", text: "  {\"a\":1} " }] }) === '{"a":1}',
   "a thinking block before the text block is skipped and the text is trimmed (the live Sonnet 5 shape)");
ok(responseText({ content: [{ type: "text", text: "OK" }] }) === "OK", "a plain text reply reads as before");
ok(responseText({ content: [{ type: "text", text: "part one " }, { type: "text", text: "part two" }] }) === "part one part two", "several text blocks are joined in order");
ok(responseText({ error: "The AI service returned an error." }) === "" && responseText(null) === "" && responseText({ content: "x" }) === "",
   "an error body, a missing body, or a malformed content field read as an empty string, never a throw");
ok(responseText({ content: [{ type: "tool_use", name: "x" }, { type: "text" }] }) === "", "non-text blocks and text blocks without a string are ignored");

// ── 2. No reader bypasses it ─────────────────────────────────────────────────
{
  const walk = (d, out = []) => { for (const f of readdirSync(d, { withFileTypes: true })) { const p = join(d, f.name); if (f.isDirectory()) walk(p, out); else if (/\.(jsx?|mjs)$/.test(f.name)) out.push(p); } return out; };
  const offenders = walk(SRC("")).filter(p => /content\??\.?\[0\]\??\.text/.test(readFileSync(p, "utf8")) && !p.endsWith("aiClient.js"));
  ok(offenders.length === 0, `no module reads content[0].text directly (offenders: ${offenders.map(p => p.replace(SRC(""), "")).join(", ") || "none"})`);
  const users = ["components/tabs/Tab05.jsx", "components/tabs/Tab09.jsx", "components/tabs/Tab10.jsx", "components/tabs/Tab12.jsx", "components/tabs/Tab14.jsx"]
    .filter(f => !readFileSync(SRC(f), "utf8").includes("responseText("));
  ok(users.length === 0, `every non-streaming call site uses responseText (missing: ${users.join(", ") || "none"})`);
  const proxy = readFileSync(join(__dirname, "..", "proxy", "server.js"), "utf8");
  ok(!/content\?\.\[0\]\?\.text/.test(proxy) && proxy.includes('filter(b => b && b.type === "text")'), "the proxy's OCR route takes every text block, not the first block");
  ok(readFileSync(SRC("lib/companionAI.js"), "utf8").includes('p.delta?.type === "text_delta"'),
     "lib/companionAI.js: the streaming parser appends text deltas only (thinking deltas are ignored)");
  const tab11 = readFileSync(SRC("components/tabs/Tab11.jsx"), "utf8");
  ok(tab11.includes("parseSseLine(line)") && tab11.includes("emptyReplyMessage(stopReason)"),
     "components/tabs/Tab11.jsx: the chat stream goes through parseSseLine and refuses an empty reply");
}

// ── 3. v1.64.1: a stream with thinking but no text is not an empty bubble ──
// Captured 2026-09-11 from the live proxy: Opus 5 in Advanced Mode spent its
// whole budget thinking on a full-record question and streamed no text. The
// old loop appended an empty assistant turn and said nothing.
{
  const { parseSseLine, emptyReplyMessage, SURFACE_MAX_TOKENS, TRUNCATED_REPLY_NOTE } = await import("../src/lib/aiClient.js");
  const thinkingOnly = [
    'event: message_start',
    'data: {"type":"message_start","message":{"id":"msg_x","type":"message","role":"assistant","content":[],"model":"claude-opus-5"}}',
    'data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}',
    'data: {"type":"ping"}',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":""}}',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"abc"}}',
    'data: {"type":"content_block_stop","index":0}',
    'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens","stop_sequence":null},"usage":{"output_tokens":120,"output_tokens_details":{"thinking_tokens":120}}}',
    'data: {"type":"message_stop"}',
    '',
  ];
  const events = thinkingOnly.map(parseSseLine).filter(Boolean);
  ok(events.length === 1 && events[0].kind === "stop" && events[0].reason === "max_tokens",
     "thinking-only stream: the only event that matters is the max_tokens stop (no text, no noise)");
  ok(/thinking/.test(emptyReplyMessage("max_tokens")) && emptyReplyMessage("max_tokens") !== emptyReplyMessage(null),
     "an empty reply that stopped on max_tokens gets the 'budget spent thinking' copy; a cut stream gets the generic copy");
  const normal = [
    'data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"hidden"}}',
    'data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}',
    'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Your EGD "}}',
    'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"note says..."}}',
    'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1228}}',
  ].map(parseSseLine).filter(Boolean);
  ok(normal.filter(e => e.kind === "text").map(e => e.text).join("") === "Your EGD note says..." && normal.at(-1).reason === "end_turn",
     "normal stream: text deltas concatenate in order, thinking text never leaks into the transcript, stop reason is end_turn");
  ok(parseSseLine('data: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}')?.kind === "error",
     "an error frame mid-stream surfaces as an error instead of being swallowed");
  ok(parseSseLine("data: [DONE]") === null && parseSseLine("event: ping") === null && parseSseLine("data: not json") === null && parseSseLine(undefined) === null,
     "[DONE], event lines, malformed JSON and non-strings are ignored without throwing");
  ok(SURFACE_MAX_TOKENS["chat.advanced"] === 4096 && SURFACE_MAX_TOKENS["chat.standard"] === 2048,
     "chat budgets doubled so thinking has room: standard 2048, advanced 4096 (the proxy cap)");
  ok(typeof TRUNCATED_REPLY_NOTE === "string" && TRUNCATED_REPLY_NOTE.length > 0, "a truncated (max_tokens with text) reply carries a visible cut-off note");
}

console.log(`\n${pass} passed, ${fail} failed (ai-response)`);
assert.equal(fail, 0);
