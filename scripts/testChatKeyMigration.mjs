// ── OPEN-17(b): legacy AI chat keys move into the vault (migration v5) ───────
// Pins: the rename, idempotency, the merge when a target already exists, the
// no-op on a fresh install, the "source stays put when the target does not
// land" guard, and that no reader/writer still uses the old content keys.
// Run: npm run test:chat-key-migration

import { readFileSync } from "node:fs";

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
globalThis.dispatchEvent = () => {};
globalThis.document = { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } };

const { runMigrations, currentSchemaVersion } = await import("../src/lib/migrations.js");
const { isManagedKey } = await import("../src/lib/secureStorage.js");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("PASS — " + m); } else { fail++; console.log("FAIL — " + m); } };
const reset = (seed = {}) => {
  localStorage.clear();
  localStorage.setItem("mi_schema_version", "4");
  for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
};
const THREADS = JSON.stringify([{ role: "user", text: "old question", conv: 1 }, { role: "assistant", text: "old answer", conv: 1 }]);
const LOG = JSON.stringify([{ event: "message_sent", mode: "standard", ts: "2026-07-01T00:00:00Z" }]);

// ── The new keys are vault-managed ───────────────────────────────────────────
ok(isManagedKey("mi_ai_chat_legacy") && isManagedKey("mi_ai_log"), "mi_ai_chat_legacy and mi_ai_log are managed (encrypted, backed up, erased) keys");
ok(!isManagedKey("insina_ai_mode") && !isManagedKey("insina_ai_daily"), "insina_ai_mode and insina_ai_daily stay outside the vault by design");

// ── Rename ───────────────────────────────────────────────────────────────────
reset({ insina_ai_messages: THREADS, insina_ai_log: LOG, insina_ai_session: '{"conv":1}' });
runMigrations();
ok(currentSchemaVersion() === 5, "schema version reaches 5");
ok(localStorage.getItem("mi_ai_chat_legacy") === THREADS, "threads land under mi_ai_chat_legacy byte-for-byte");
ok(localStorage.getItem("mi_ai_log") === LOG, "audit log lands under mi_ai_log");
ok(localStorage.getItem("insina_ai_messages") === null && localStorage.getItem("insina_ai_log") === null, "old content keys are removed");
ok(localStorage.getItem("insina_ai_session") === null, "the old feed cursor is removed");

// ── Idempotent ───────────────────────────────────────────────────────────────
const before = JSON.stringify([...localStorage._m.entries()].sort());
runMigrations();
ok(JSON.stringify([...localStorage._m.entries()].sort()) === before, "a second run changes nothing");

// ── Fresh install: nothing to move, nothing created ─────────────────────────
reset({ insina_ai_mode: '{"mode":"standard"}', insina_ai_daily: '{"date":"2026-09-11","count":2}' });
runMigrations();
ok(localStorage.getItem("mi_ai_chat_legacy") === null && localStorage.getItem("mi_ai_log") === null, "fresh install: no legacy keys created");
ok(localStorage.getItem("insina_ai_mode") !== null && localStorage.getItem("insina_ai_daily") !== null, "fresh install: mode and daily counter untouched");

// ── Target already present (e.g. restored from Drive): absorb, never drop ────
reset({ insina_ai_messages: JSON.stringify([{ role: "user", text: "phone thread" }]), mi_ai_chat_legacy: JSON.stringify([{ role: "user", text: "laptop thread" }]) });
runMigrations();
{
  const merged = JSON.parse(localStorage.getItem("mi_ai_chat_legacy"));
  ok(merged.length === 2 && merged[0].text === "laptop thread" && merged[1].text === "phone thread", "existing target absorbs the source threads (existing first)");
  ok(localStorage.getItem("insina_ai_messages") === null, "source removed after the merge");
}
reset({ insina_ai_log: JSON.stringify(Array.from({ length: 150 }, (_, i) => ({ i }))), mi_ai_log: JSON.stringify(Array.from({ length: 100 }, (_, i) => ({ j: i }))) });
runMigrations();
ok(JSON.parse(localStorage.getItem("mi_ai_log")).length === 200, "merged audit log keeps Tab11's 200-entry cap");

// ── Corrupt source: moved as-is when nothing to merge into ──────────────────
reset({ insina_ai_messages: "{not json" });
runMigrations();
ok(localStorage.getItem("mi_ai_chat_legacy") === "{not json" && localStorage.getItem("insina_ai_messages") === null, "unparseable source still moves (nothing is silently discarded)");

// ── Target does not land (locked vault ignores managed writes) ──────────────
reset({ insina_ai_messages: THREADS });
const realSet = localStorage.setItem.bind(localStorage);
localStorage.setItem = (k, v) => { if (k.startsWith("mi_") && k !== "mi_schema_version" && k !== "mi_rie_audit") return; realSet(k, v); };
const origError = console.error; console.error = () => {};
runMigrations();
console.error = origError;
localStorage.setItem = realSet;
ok(localStorage.getItem("insina_ai_messages") === THREADS, "source left in place when the target does not persist");
ok(currentSchemaVersion() === 4, "version not bumped, so the next boot retries");

// ── Static pins: no reader or writer uses the old content keys ──────────────
const src = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf-8");
ok(!src("src/components/tabs/Tab11.jsx").includes('"insina_ai_log"') && src("src/components/tabs/Tab11.jsx").includes('AI_LOG_KEY     = "mi_ai_log"'), "Tab11 writes its audit log to mi_ai_log");
ok(src("src/components/SearchPopup.jsx").includes('safeRead("mi_ai_chat_legacy"') && !src("src/components/SearchPopup.jsx").includes("insina_ai_messages"), "Search reads legacy threads from mi_ai_chat_legacy");
ok(src("public/demo/index.html").includes('k.startsWith("insina_")'), "demo seeder still purges leftover insina_* keys on a stale-version reset");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
