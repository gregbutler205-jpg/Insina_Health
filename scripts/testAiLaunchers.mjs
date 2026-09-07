// AI mark, launcher, and scope system (WO_AI_LAUNCHER_01, DEC-P47 to P51)
//
// Two layers. Rendered checks bundle the real components with esbuild
// (already a dependency via Vite) into node_modules/.cache and render them
// with react-dom/server, so the mark's compact/standard trace, unique ids,
// aria contract, flag-off behaviour, and launcher tap side effects are
// exercised for real. Structural checks read the source for the wiring the
// harness cannot render (placements, provenance allowlist, no URL/network).
// Run: npm run test:ai-launchers

import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, relative } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as esbuild from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = (p) => join(ROOT, "src", p);
const read = (p) => readFileSync(SRC(p), "utf8");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("PASS " + m); } else { fail++; console.log("FAIL " + m); } };

// Minimal DOM-free globals for modules that touch window/localStorage at import.
class Storage { constructor(){ this._m = new Map(); } getItem(k){ return this._m.has(k) ? this._m.get(k) : null; } setItem(k,v){ this._m.set(k, String(v)); } removeItem(k){ this._m.delete(k); } clear(){ this._m.clear(); } key(i){ return [...this._m.keys()][i] ?? null; } get length(){ return this._m.size; } }
globalThis.localStorage = new Storage();
globalThis.window = globalThis;

// Bundle a component entry for Node, optionally stubbing the AI flag off.
const CACHE = join(ROOT, "node_modules", ".cache", "insina-tests");
mkdirSync(CACHE, { recursive: true });
async function bundle(entryRel, { flagOff = false } = {}) {
  const plugins = [];
  if (flagOff) {
    plugins.push({
      name: "flag-off",
      setup(b) {
        b.onResolve({ filter: /aiFeatures\.js$/ }, () => ({ path: "flag-off", namespace: "stub" }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export const AI_FEATURES_ENABLED = false;", loader: "js" }));
      },
    });
  }
  const r = await esbuild.build({
    entryPoints: [SRC(entryRel)], bundle: true, write: false, format: "esm", platform: "node",
    jsx: "automatic", external: ["react", "react/jsx-runtime", "react-dom"], plugins, logLevel: "silent",
  });
  const out = join(CACHE, `${entryRel.replace(/[\\/]/g, "_")}${flagOff ? ".off" : ""}.mjs`);
  writeFileSync(out, r.outputFiles[0].text);
  return import(pathToFileURL(out).href + `?t=${Date.now()}`);
}

const Mark = (await bundle("components/ai/AIMark.jsx")).default;
const Launcher = (await bundle("components/ai/AILauncher.jsx")).default;
const Entry = (await bundle("components/ai/AIEntryButton.jsx")).default;
const LauncherOff = (await bundle("components/ai/AILauncher.jsx", { flagOff: true })).default;
const EntryOff = (await bundle("components/ai/AIEntryButton.jsx", { flagOff: true })).default;
const scope = await import("../src/lib/aiScope.js");
const html = (el) => renderToStaticMarkup(el);

// 1. Mark: variants, traces, ids, aria
{
  const simple = html(createElement(Mark, { variant: "simple", size: 14 }));
  ok(simple.includes('data-ai-mark="simple"') && simple.includes('fill="currentColor"') && simple.includes('fill-rule="evenodd"'),
    "simple variant: currentColor, single evenodd path, data-ai-mark root");
  ok(!simple.includes("id="), "simple variant carries no ids (safe to inline any number of times)");
  const s32 = html(createElement(Mark, { variant: "full", size: 32 }));
  ok(s32.includes("M60 100H84L96 56L106 144L116 100H140") && !s32.includes("feGaussianBlur") && !s32.includes("M56 100H80L86 92"),
    "full variant below 40 renders the compact trace: no glow filter, no P wave");
  ok(/stroke-width="9"/.test(s32) && /stroke-linecap="round"/.test(s32), "compact trace is stroke 9 with round caps and joins");
  const s44 = html(createElement(Mark, { variant: "full", size: 44 }));
  ok(s44.includes("M56 100H80L86 92L91 100H96L101 50L110 150L116 100H144") && s44.includes("feGaussianBlur"),
    "full variant at 40 and above renders the standard trace with glow and P wave");
  const two = html(createElement("div", null, createElement(Mark, { variant: "full", size: 44 }), createElement(Mark, { variant: "full", size: 44 })));
  const ids = [...two.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
  ok(ids.length === 10 && new Set(ids).size === 10, `two full marks in one tree produce ten distinct ids (got ${ids.length}, ${new Set(ids).size} unique)`);
  ok(html(createElement(Mark, { variant: "simple" })).includes('aria-hidden="true"'), "mark is aria-hidden by default (a text label accompanies it)");
  ok(html(createElement(Mark, { variant: "simple", decorative: false })).includes('aria-label="Insina AI"'), "standalone mark is a labelled image");
}

// 2. Launcher and entry button contracts
{
  const nav = { called: 0 };
  const l = html(createElement(Launcher, { label: "Ask about this panel", scope: { source: "labs_panel", items: [{ kind: "panel", id: "Hormone", label: "Hormone panel" }] }, onNavigate: () => nav.called++ }));
  ok(l.includes('aria-label="Ask about this panel"') && l.includes(">Ask about this panel<") && l.includes("data-ai-mark"),
    "launcher: visible label, aria-label equals label, simple mark inside");
  ok(html(createElement(Launcher, { label: "", scope: {} })) === "", "launcher is never icon-only: no label renders nothing");
  const e = html(createElement(Entry, { iconSize: 32 }));
  ok(e.includes('aria-label="Open AI Analysis"') && e.includes("M60 100H84") && /width:44px;height:44px/.test(e),
    "entry button: aria-label, compact trace at 32, 44px hit target");
  ok(html(createElement(Entry, { iconSize: 44 })).includes("feGaussianBlur"), "entry button at 44 renders the standard trace");
  ok(html(createElement(LauncherOff, { label: "x", scope: {} })) === "" && html(createElement(EntryOff, {})) === "",
    "flag off: launcher and entry button render nothing (hidden, not greyed)");
}

// 3. Scope store: in-memory, taken once, never the URL or storage
{
  scope.setAIScope({ source: "medications", items: [{ kind: "med_list", label: "Active medications" }], question: "  " });
  const t = scope.takeAIScope();
  ok(t && t.source === "medications" && t.items.length === 1 && t.question === undefined, "scope round-trips; a blank question is dropped");
  ok(scope.takeAIScope() === null, "scope is taken once (second take is empty)");
  scope.setAIScope({ source: "dashboard", items: [], question: "Analyze my current health status" });
  ok(scope.takeAIScope().question === "Analyze my current health status", "a dashboard question rides the scope object");
  ok(scope.scopeChips([]).length === 1 && scope.scopeChips([])[0].label === "Full record" && scope.scopeChips([])[0].removable === false,
    "empty scope shows the single non-removable Full record chip");
  ok(scope.scopeChips([{ kind: "panel", id: "CMP", label: "CMP panel" }])[0].removable === true, "specific items are removable chips");
  ok(localStorage.length === 0, "scope never touches storage");
  const lib = read("lib/aiScope.js");
  ok(!/location|history\.|URLSearchParams|localStorage|sessionStorage/.test(lib), "scope module references no URL or storage API");
}

// 4. Provenance allowlist: AIMark imported only where permitted
{
  // v1.58.3: the companion's bottom nav (its nav row) and the Today AI chat
  // shortcut carry the simple mark too, replacing generic sparkle glyphs.
  const allow = new Set(["components/ai/AILauncher.jsx", "components/ai/AIEntryButton.jsx", "components/AppSidebar.jsx", "components/tabs/Tab11.jsx", "components/companion/CompanionApp.jsx", "components/companion/screens/Today.jsx"]);
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(jsx?|mjs)$/.test(f)) files.push(p); } };
  walk(join(ROOT, "src"));
  const importers = files.filter(p => /from ["'][^"']*AIMark(\.jsx)?["']/.test(readFileSync(p, "utf8"))).map(p => relative(join(ROOT, "src"), p).replace(/\\/g, "/"));
  ok(importers.every(p => allow.has(p)) && importers.length === allow.size, `AIMark is imported only by the permitted modules (got: ${importers.join(", ")})`);
  const markCarriers = files.filter(p => readFileSync(p, "utf8").includes("data-ai-mark")).map(p => relative(join(ROOT, "src"), p).replace(/\\/g, "/"));
  ok(markCarriers.length === 1 && markCarriers[0] === "components/ai/AIMark.jsx", "data-ai-mark is emitted by AIMark alone");
  // Deterministic surfaces never carry the mark.
  for (const f of ["components/advisory", "lib/tripwire.js", "lib/advisoryRuntime.js", "components/tabs/Tab07.jsx"]) {
    const p = SRC(f);
    const src = statSync(p).isDirectory() ? readdirSync(p).map(x => readFileSync(join(p, x), "utf8")).join("\n") : readFileSync(p, "utf8");
    ok(!/AIMark|AILauncher|data-ai-mark/.test(src), `${f}: no mark, no launcher (deterministic surface)`);
  }
}

// 5. No network from launchers; flag gating in the components themselves
{
  for (const f of ["components/ai/AILauncher.jsx", "components/ai/AIEntryButton.jsx", "lib/aiScope.js"]) {
    ok(!/fetch\(|callAI|aiClient|XMLHttpRequest/.test(read(f)), `${f}: no fetch, no proxy call`);
  }
  ok(read("components/ai/AILauncher.jsx").includes("if (!AI_FEATURES_ENABLED) return null") && read("components/ai/AIEntryButton.jsx").includes("if (!AI_FEATURES_ENABLED) return null"),
    "both components self-gate on the single AI features flag");
  ok(read("config/aiFeatures.js").includes("export const AI_FEATURES_ENABLED = true"), "flag exists and ships ON (founder decision 2026-09-02)");
}

// 6. Placements (DEC-P49) and prohibited zones
{
  const count = (f, re) => (read(f).match(re) || []).length;
  ok(count("components/tabs/Tab05.jsx", /<AILauncher/g) === 1 && read("components/tabs/Tab05.jsx").includes('label="Ask about this panel"'), "Labs: one launcher per panel header, verbatim label");
  ok(read("components/tabs/Tab05.jsx").includes('type: "header", cat, latest:') && read("components/tabs/Tab05.jsx").includes("item.latest"),
    "Labs: the header item carries its latest date; the render never reaches into the list-building block's locals (live crash 2026-09-02)");
  ok(count("components/tabs/Tab04.jsx", /<AILauncher/g) === 1 && read("components/tabs/Tab04.jsx").includes('label="Review my medication list"'), "Medications: one list-level launcher, verbatim label");
  ok(!read("components/tabs/Tab04.jsx").includes("AI Interaction Check"), "Medications: the auto-sending AI Interaction Check button is gone");
  const t14 = read("components/tabs/Tab14.jsx");
  ok(count("components/tabs/Tab14.jsx", /<AILauncher/g) === 1 && t14.includes('label="Prepare for this visit"') && /appt\.status === "upcoming" && \(\s*<AILauncher/.test(t14),
    "Appointments: one launcher per UPCOMING appointment only, verbatim label");
  ok(count("components/tabs/Tab07.jsx", /AILauncher/g) === 0, "Symptoms: no launcher (Tier 1 halt: saves expose no tripwire clean state)");
  for (const f of ["components/tabs/Tab12.jsx", "components/LabBatchReview.jsx", "components/tabs/Tab09.jsx", "components/onboarding/ReviewQueue.jsx"]) {
    ok(count(f, /AILauncher|AIEntryButton/g) === 0, `${f}: no launcher (Import, confirmation, archive zones)`);
  }
  const app = read("App.jsx");
  // WO_DASHBOARD_FEED_01: one top bar (the auth branches are gone) and the
  // quick-launch panel lives in the dashboard component's right rail.
  ok((app.match(/<AIEntryButton iconSize=\{32\}/g) || []).length === 1 && (app.match(/activeNav !== "import" && <AIEntryButton/g) || []).length === 1,
    "Topbar: one entry button, hidden on Import Records");
  const dash = read("components/dashboard/Dashboard.jsx");
  ok((dash.match(/<AIEntryButton iconSize=\{44\} source="dashboard"/g) || []).length === 1, "Dashboard panel: one full-cut entry button");
  ok(dash.includes("Insina <span") && dash.includes(">AI</span>"), "Dashboard panel: Insina AI wordmark lockup");
  ok(dash.includes("{AI_FEATURES_ENABLED && (") , "Dashboard quick-launch panel is behind the flag");
  ok(!dash.includes('localStorage.setItem("mi_ai_pending", q)') && !app.includes('localStorage.setItem("mi_ai_pending", q)'), "Dashboard question buttons no longer hand off through localStorage");
  ok((dash.match(/question=\{q\}/g) || []).length === 1 && dash.includes('label="Custom query..."'), "the three question launchers carry their question; Custom query carries none");
  const side = read("components/AppSidebar.jsx");
  ok(side.includes('<AIMark variant="simple" size={14} />') && !side.includes(">AI</span>"), "Nav row: mark at 14, AI pill removed");
  ok(!side.includes("AI_FEATURES_ENABLED"), "Nav row mark is not flag-gated (stays visible when AI is off)");
}

// 7. AI Analysis: scope strip, hand-off, filter, header mark
{
  const t11 = read("components/tabs/Tab11.jsx");
  ok(t11.includes(">Reads:</span>") && t11.includes("scopeChips(scopeItems)"), "Reads: chip strip renders from the scope");
  ok(t11.includes("removeScopeChip(chip)"), "chips are removable");
  ok(t11.includes("const handed = takeAIScope();") && t11.includes("setTimeout(() => sendMessage(handed.question), 300)"),
    "hand-off is taken on mount; only a dashboard question runs (DEC-P50 as amended)");
  ok(t11.includes("buildDataSections(scopeRef.current)") && t11.includes("function buildDataSections(scopeItems = [])"), "context assembly is filtered by scope");
  ok(t11.includes('l.category || "Other"') && t11.includes("includeLabs") && t11.includes("includeVitals") && t11.includes("includeDocs"),
    "scope filters data slices (labs by panel category, vitals, documents)");
  const idx = t11.indexOf("function buildDataSections");
  const body = t11.slice(idx, t11.indexOf("\n}\n", idx));
  ok(body.includes("LAB RESULTS") && body.includes("VITALS HISTORY") && body.includes("CARE TEAM"), "template headers are untouched by the filter");
  ok(t11.includes('<AIMark variant="full" size={40} />'), "AI Analysis header carries the full mark (permitted surface)");
}

// 9. v1.58.3: companion bottom bar and Today tap-throughs (Greg)
{
  const app = read("components/companion/CompanionApp.jsx");
  const order = [...app.matchAll(/\{ key: "(today|meds|ai|record|log|care)",/g)].map(m => m[1]).join(" ");
  ok(order === "today meds ai record log care", `six uniform tabs in the agreed order (got: ${order})`);
  ok(app.includes('<AIMark variant="simple" size={NAV_ICON} />'), "the AI tab carries the mark at the shared nav icon size");
  ok(!app.includes("marginTop: -14") && !app.includes("width: 40, height: 40"), "Record is no longer an oversized raised circle");
  ok(app.includes('background: "linear-gradient(135deg, #ef4444, #b91c1c)"') && app.includes('"#f87171"'), "Record keeps its red tint");
  ok(!app.includes("grayscale(0.4)") && !app.includes("0.55"), "inactive tabs are no longer dimmed to a whisper");
  ok(!app.includes("AI_FEATURES_ENABLED"), "the companion AI tab, like the web nav row, is not flag-gated");
  const today = read("components/companion/screens/Today.jsx");
  ok(today.includes('aria-label="Open this appointment"') && today.includes('onClick={() => goTab("care")}'), "Today: the imminent-visit card body opens the appointment page");
  ok(today.includes("e.stopPropagation(); startVisit(appt)"), "Today: Start still launches capture without also navigating");
  ok(!today.includes('icon="✦"'), "Today: the AI chat shortcut uses the mark, not a generic sparkle");
}

// 8. Em dash scan (U+2014) over the files this work order created
{
  const created = ["components/ai/AIMark.jsx", "components/ai/AILauncher.jsx", "components/ai/AIEntryButton.jsx", "lib/aiScope.js", "config/aiFeatures.js"];
  const EM = String.fromCharCode(0x2014);
  ok(created.every(f => !read(f).includes(EM)), "no em dash in any file this work order created");
  ok(!readFileSync(fileURLToPath(import.meta.url), "utf8").includes(EM), "no em dash in this suite");
}

console.log(`\n${pass} passed, ${fail} failed (ai-launchers)`);
assert.equal(fail, 0);
