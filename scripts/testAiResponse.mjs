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
  for (const f of ["lib/companionAI.js", "components/tabs/Tab11.jsx"]) {
    ok(readFileSync(SRC(f), "utf8").includes('p.delta?.type === "text_delta"') || readFileSync(SRC(f), "utf8").includes('parsed.delta?.type === "text_delta"'),
       `${f}: the streaming parser appends text deltas only (thinking deltas are ignored)`);
  }
}

console.log(`\n${pass} passed, ${fail} failed (ai-response)`);
assert.equal(fail, 0);
