// ── Dashboard / Vitals / companion must show the same vitals ─────────────────
// Greg's rule: "These three areas should always be the same."
//
// They were not. Tab06 (Vitals) re-reads on every "mi-data-synced" event; the
// dashboard only re-read when you navigated TO it. A reading logged on the
// companion and merged in by a Drive sync therefore appeared under Vitals while
// the dashboard kept showing the previous figure.
//
// These are STRUCTURAL checks against the source, not behavioural ones: the
// dashboard is React + DOM and this harness is plain Node with no renderer, so
// the live behaviour was verified in-browser instead (a reading injected +
// event dispatched while sitting on the dashboard: stale before, live after).
// What this suite protects is the wiring that makes that behaviour possible —
// enough to fail loudly if the listener or a store re-read is ever dropped.
// Run: npm run test:dashboard-sync

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const APP   = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf-8");
const TAB06 = readFileSync(new URL("../src/components/tabs/Tab06.jsx", import.meta.url), "utf-8");
const VITALS = readFileSync(new URL("../src/lib/vitals.js", import.meta.url), "utf-8");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("PASS — " + m); } else { fail++; console.log("FAIL — " + m); } };

// ── The event contract ───────────────────────────────────────────────────────
ok(/window\.dispatchEvent\(new Event\("mi-data-synced"\)\)/.test(VITALS),
   "saveReading still announces itself with mi-data-synced");

// ── Both surfaces must listen ────────────────────────────────────────────────
ok(/addEventListener\("mi-data-synced"/.test(TAB06),
   "Vitals tab listens for mi-data-synced");
ok(/addEventListener\("mi-data-synced"/.test(APP),
   "dashboard listens for mi-data-synced — the gap that caused the bug");

// The listener must be registered unconditionally, not nested inside a
// dashboard-only branch: returning to the dashboard must never show a figure
// that went stale while another tab was open.
{
  const i = APP.indexOf('addEventListener("mi-data-synced"');
  // Scope to the listener's OWN useEffect — the effect immediately above it is
  // the nav-triggered refresh, which legitimately does guard on activeNav.
  const effectStart = APP.lastIndexOf("useEffect(", i);
  const ownEffect = APP.slice(effectStart, i);
  ok(!/activeNav/.test(ownEffect),
     "the dashboard's listener is not gated behind an activeNav check");
}

// ── One refresh path, covering everything the dashboard renders ──────────────
{
  const m = APP.match(/const refreshDashboardData = useCallback\(\(\) => \{[\s\S]*?\n  \}, \[\]\);/);
  ok(!!m, "refreshDashboardData exists as a single named refresh path");
  const body = m ? m[0] : "";
  // WO_DASHBOARD_FEED_01: appointments, alerts, and conditions no longer live in
  // App state; the feed dashboard re-reads them from storage when this counter moves.
  for (const [setter, what] of [
    ["setReadings",   "vitals — the reported bug"],
    ["setMeds",       "medications"],
    ["setDashRefresh", "the feed (appointments, flags, reviews, results, refills)"],
  ]) {
    ok(body.includes(setter), `refreshDashboardData re-reads ${what}`);
  }
}

// ── Red is reserved for urgent ───────────────────────────────────────────────
// A flagged reading must still render red; the resting colour must not.
// (The vitals cards moved to src/components/dashboard/Dashboard.jsx with
// WO_DASHBOARD_FEED_01; the rule is unchanged.)
{
  const DASH = readFileSync(new URL("../src/components/dashboard/Dashboard.jsx", import.meta.url), "utf-8");
  ok(/bp: "#ea580c"/.test(DASH),
     "resting Blood Pressure is dark orange (#ea580c)");
  ok(/danger: "#f87171"/.test(DASH) && /v\.flagged \? T\.danger : VITAL_COLOR\[v\.id\]/.test(DASH),
     "a FLAGGED vital still renders red — red still means urgent");
}

// ── v1.57.2: merged-in readings must not hide behind storage order ───────────
// A Drive merge APPENDS the other device's readings at the array tail;
// readings[0] and every .find() on the dashboard assume newest-first. Greg's
// phone vitals showed on the Vitals tab (it sorts) but not the dashboard.
// Every dashboard read of the store now goes through sortReadingsByRecency.
{
  ok(!APP.includes("useState(() => getStore('readings'))"),
     "mount state does not trust raw storage order");
  ok(!APP.match(/setReadings\(getStore\('readings'\)\)/),
     "no refresh path re-reads without sorting");
  ok((APP.match(/sortReadingsByRecency\(getStore\('readings'\)\)/g) || []).length === 3,
     "all three dashboard read sites (mount, dashboard refresh, Drive refresh) sort");
}
{
  // Behavioural: the sorter itself puts a tail-appended newer reading first.
  globalThis.Storage = class { getItem(){return null;} setItem(){} removeItem(){} clear(){} key(){return null;} get length(){return 0;} };
  globalThis.localStorage = new globalThis.Storage();
  globalThis.window = globalThis;
  globalThis.dispatchEvent = () => {};
  const { sortReadingsByRecency } = await import("../src/lib/vitals.js");
  const mergedOrder = [
    { id: "web1",   date: "2026-08-28", bp_s: 120, bp_d: 70 },  // web's latest, stored first
    { id: "web0",   date: "2026-08-20", bp_s: 118, bp_d: 68 },
    { id: "phone1", date: "2026-08-31", bp_s: 143, bp_d: 78 },  // phone's, merge-appended at tail
  ];
  const sorted = sortReadingsByRecency(mergedOrder);
  ok(sorted[0].id === "phone1",
     "a phone reading appended by the merge becomes readings[0] — the dashboard shows it");
  ok(sorted.map(r => r.id).join(",") === "phone1,web1,web0", "full recency order holds");
}

console.log(`\n${pass} passed, ${fail} failed (dashboard-sync)`);
assert.equal(fail, 0);
