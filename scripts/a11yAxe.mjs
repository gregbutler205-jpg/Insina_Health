// ── WO_ACCESSIBLE_TOKENS_01 4.7 / 4.8: axe-core AA check + screenshots ─────────
// Runs axe-core (WCAG 2.x A/AA tags) against the BUILT app's main routes in a
// real Chrome, at 1280px and 390px, and saves full-page screenshots of each.
// The record under test is the fictional demo dataset (public/demo/index.html
// seeds it and hands off to /app/), so no real record and no passphrase are
// ever involved. Nothing here touches the network beyond localhost and the
// Google Fonts stylesheet the app itself loads.
//
//   node scripts/a11yAxe.mjs                       # dist/ -> a11y-report/after/
//   node scripts/a11yAxe.mjs --dist ../Code-before/dist --label before
//   node scripts/a11yAxe.mjs --baseline a11y-report/before --fail-on-new
//
// Options: --dist <dir> (default dist)  --out <dir> (default a11y-report)
//          --label <name> (default after)  --port <n> (default 4180)
//          --baseline <dir> (compare; report violations not present there)
//          --fail-on-new (exit 1 when new violations vs baseline)
//          --fail-on-any (exit 1 when any AA violation)
// Chrome: CHROME_PATH env, else the usual Windows/macOS/Linux install paths.
//
// DEC-049 enforcement note: the work order asks for this check to block the
// build. It is wired as an opt-in npm script (test:a11y) until Greg decides
// whether the deploy pipeline installs a browser and which baseline blocks;
// see the session report.

import http from "node:http";
import { existsSync, readFileSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { join, extname, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i === -1 ? dflt : args[i + 1]; };
const flag = (name) => args.includes(name);
const DIST = resolve(ROOT, opt("--dist", "dist"));
const OUT = resolve(ROOT, opt("--out", "a11y-report"), opt("--label", "after"));
const PORT = Number(opt("--port", "4180"));
const BASELINE = opt("--baseline", null);

const FIXTURE = opt("--fixture", null); // WO_DASHBOARD_FEED_01 section 6: "feed-empty" | "feed-flag"
const ALL_ROUTES = [
  { id: "dashboard",   nav: null,              title: "Dashboard" },
  { id: "medications", nav: "Medications",     title: "Medications" },
  { id: "labs",        nav: "Labs and trends", title: "Labs and trends" },
  { id: "vitals",      nav: "Vitals",          title: "Vitals" },
  { id: "profile",     nav: "Health profile",  title: "Profile" },
];
// A fixture run screenshots and checks the dashboard only, under the fixture's name.
const ROUTES = FIXTURE ? [{ id: `dashboard-${FIXTURE}`, nav: null, title: `Dashboard (${FIXTURE})` }] : ALL_ROUTES;

/**
 * Dashboard fixtures (WO_DASHBOARD_FEED_01 section 6), applied on top of the fictional
 * demo record inside the page. "feed-empty": no flags, no pending reviews, no
 * out-of-range results, nothing dated. "feed-flag": one advisory (TODAY) flag, one
 * emergency flag, one pending review, one out-of-range result set, three
 * appointments, one refill. Demo persona only, never real data.
 */
function applyFixture(name) {
  const get = (k, d) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : d; } catch { return d; } };
  const set = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const plus = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
  set("mi_dashboard_dismissals", []);
  set("mi_flag_acknowledgments", []);
  if (name === "feed-empty") {
    set("mi_appointments", []);
    set("mi_meds_full", get("mi_meds_full", []).map(m => ({ ...m, refillDate: "" })));
    set("mi_labs", get("mi_labs", []).map(l => ({ ...l, flag: false })));
    set("mi_advisory_events", []);
    set("mi_lab_archive", []);
    set("mi_onboarding_staged", { documents: [], items: [] });
    return "feed-empty applied";
  }
  if (name === "feed-flag") {
    const now = new Date().toISOString();
    set("mi_advisory_events", [
      { id: "fx_today", ts: now, metric: "bp_s", value: 172, unit: "mmHg", tier: "TODAY", source: "manual", resultDate: null, readingId: null, verification: "patient-entered", tableVersion: "1.1.0-draft", templateVersion: "1.1.0", dismissedAt: null, verifiedAt: null, rejectedAt: null, careTeamContactedAt: null },
      { id: "fx_emergency", ts: now, metric: "potassium", value: 6.4, unit: "mmol/L", tier: "EMERGENCY", source: "manual", resultDate: null, readingId: null, verification: "patient-entered", tableVersion: "1.1.0-draft", templateVersion: "1.1.0", dismissedAt: null, verifiedAt: null, rejectedAt: null, careTeamContactedAt: null },
    ]);
    set("mi_lab_archive", [{ id: "fx-doc", title: "MyChart labs", fileName: "labs.pdf", importedAt: now, updatedAt: Date.now(), rows: [
      { id: "fx-r1", name: "Potassium", value: "6.1", unit: "mmol/L", refRange: "3.5-5.1", date: plus(-1), category: "Chemistry", state: "pending", flags: ["out_of_range"] },
      { id: "fx-r2", name: "Sodium", value: "139", unit: "mmol/L", refRange: "135-145", date: plus(-1), category: "Chemistry", state: "pending", flags: [] },
    ] }]);
    set("mi_onboarding_staged", { documents: [], items: [{ id: "fx-s1", category: "medication", status: "staged", name: "Amlodipine 10 mg" }] });
    const labs = get("mi_labs", []).filter(l => l.date !== plus(-5));
    labs.push({ id: "fx-l1", name: "Platelets", value: "142", unit: "K/uL", refRange: "150-450", flag: true, date: plus(-5), category: "CBC / Hematology" });
    labs.push({ id: "fx-l2", name: "Hemoglobin", value: "14.1", unit: "g/dL", refRange: "13.5-17.5", flag: false, date: plus(-5), category: "CBC / Hematology" });
    set("mi_labs", labs);
    set("mi_appointments", [
      { id: "fx-a1", title: "Transplant clinic", provider: "Dr. Alvarez", specialty: "Transplant hepatology", facility: "Transplant clinic", date: plus(8), time: "10:00 AM", status: "upcoming", urgency: "med" },
      { id: "fx-a2", title: "Bone density test", provider: "", specialty: "Imaging", facility: "Hancock imaging", date: plus(12), time: "2:00 PM", status: "upcoming", urgency: "low" },
      { id: "fx-a3", title: "Physical therapy", provider: "Valerie Sullivan", specialty: "Physical therapy", facility: "", date: plus(14), time: "9:00 AM", status: "upcoming", urgency: "low" },
    ]);
    const meds = get("mi_meds_full", []);
    let first = true;
    set("mi_meds_full", meds.map(m => {
      if (m.status === "inactive") return m;
      if (first) { first = false; return { ...m, refillDate: plus(3), daysSupply: 30, pharmacy: "Walgreens" }; }
      return { ...m, refillDate: plus(40) };
    }));
    return "feed-flag applied";
  }
  return `unknown fixture ${name}`;
}
// Tall viewports on purpose: the app scrolls inside a flex container, so a
// "full page" screenshot is the viewport; height here decides how much of the
// feed a screenshot shows. Width is what the work order specifies.
const VIEWPORTS = [{ width: 1280, height: 1500 }, { width: 390, height: 1400 }];
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain" };

function serve(dir, port) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = join(dir, p);
    try {
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
      if (!existsSync(file)) { res.writeHead(404); res.end("not found"); return; }
      res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
      res.end(readFileSync(file));
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok(server)));
}

function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const candidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    `${process.env.LOCALAPPDATA || ""}/Google/Chrome/Application/chrome.exe`,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium-browser", "/usr/bin/chromium",
  ];
  return candidates.find(p => p && existsSync(p)) || null;
}

async function clickNav(page, label) {
  const tryClick = (target) => page.evaluate((label) => {
    const items = [...document.querySelectorAll(".nav-item")];
    // Match the label span (expanded sidebar or flyout) or the accessible name
    // (icon rail at narrow widths, where the label is title/aria-label only).
    const hit = items.find(el => [...el.querySelectorAll("span")].some(s => s.textContent.trim() === label)
      || el.getAttribute("aria-label") === label || el.getAttribute("title") === label);
    if (!hit) return false;
    hit.click();
    return true;
  }, target);
  let ok = await tryClick(label);
  if (!ok) {
    // DEC-058: on the rail, Records and Tools screens sit behind a group flyout.
    for (const group of ["Records", "Tools"]) {
      if (await tryClick(group)) {
        await new Promise(r => setTimeout(r, 250));
        if (await tryClick(label)) { ok = true; break; }
        await page.keyboard.press("Escape");
      }
    }
  }
  if (!ok) throw new Error(`nav item not found: ${label}`);
  await new Promise(r => setTimeout(r, 700));
}

async function runAxe(page) {
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  return page.evaluate(async (tags) => {
    const r = await window.axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations", "incomplete"] });
    const pick = (n) => {
      const d = (n.any && n.any[0] && n.any[0].data) || {};
      return { target: n.target.join(" "), text: (n.html || "").replace(/<[^>]+>/g, "").trim().slice(0, 40),
        fg: d.fgColor, bg: d.bgColor, ratio: d.contrastRatio, fontSize: d.fontSize, expected: d.expectedContrastRatio };
    };
    return {
      violations: r.violations.map(v => ({
        id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl, nodes: v.nodes.length,
        targets: v.nodes.slice(0, 3).map(n => n.target.join(" ")),
        detail: v.nodes.map(pick),
      })),
      // "incomplete" = axe could not decide (for color-contrast usually an
      // undeterminable background). Counted so the report shows what was NOT checked.
      incomplete: r.incomplete.map(v => ({ id: v.id, nodes: v.nodes.length })),
    };
  }, AXE_TAGS);
}

function keyOf(route, vp, v) { return `${route}@${vp}:${v.id}`; }

async function main() {
  if (!existsSync(join(DIST, "app", "index.html"))) { console.error(`No built app at ${DIST}/app/index.html. Run npm run build first.`); process.exit(2); }
  const chrome = findChrome();
  if (!chrome) { console.error("No Chrome/Edge found. Set CHROME_PATH."); process.exit(2); }
  mkdirSync(OUT, { recursive: true });
  const server = await serve(DIST, PORT);
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox", "--disable-gpu"] });
  const results = [];
  const pageErrors = [], consoleErrors = [];
  try {
    const page = await browser.newPage();
    // Runtime errors in the app are a failure of the run, not something to screenshot around.
    page.on("pageerror", (e) => { pageErrors.push(String(e && e.message || e)); });
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    page.on("response", (r) => { if (r.status() >= 400) consoleErrors.push(`${r.status()} ${r.url()}`); });
    // The app ships a strict CSP meta tag (script-src 'self'); the injected axe
    // script would be blocked without this. The bypass applies to this
    // automation tab only, never to the shipped page.
    await page.setBypassCSP(true);
    // Seed the fictional record through the demo page, which hands off to /app/.
    await page.goto(`http://127.0.0.1:${PORT}/app/demo/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => location.pathname === "/app/" && document.querySelector(".nav-item"), { timeout: 30000 });
    if (FIXTURE) {
      const msg = await page.evaluate(applyFixture, FIXTURE);
      console.log(msg);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.querySelector(".nav-item"), { timeout: 30000 });
    }
    await new Promise(r => setTimeout(r, 1200)); // fonts + dashboard data
    for (const vp of VIEWPORTS) {
      await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1, isMobile: vp.width < 768, hasTouch: vp.width < 768 });
      await new Promise(r => setTimeout(r, 400)); // let the sidebar's narrow-width query settle
      for (const route of ROUTES) {
        await clickNav(page, "Dashboard");
        if (route.nav) await clickNav(page, route.nav);
        const shot = join(OUT, `${route.id}-${vp.width}.png`);
        await page.screenshot({ path: shot, fullPage: true });
        const { violations, incomplete } = await runAxe(page);
        results.push({ route: route.id, title: route.title, viewport: vp.width, violations, incomplete, screenshot: shot });
        const n = violations.reduce((a, v) => a + v.nodes, 0);
        const inc = incomplete.reduce((a, v) => a + v.nodes, 0);
        console.log(`${route.title.padEnd(16)} @${String(vp.width).padEnd(4)} ${violations.length} rule(s), ${n} node(s); ${inc} undecided`);
      }
    }
    // WO_DASHBOARD_FEED_01 5: with the flag fixture, press Acknowledge on the first
    // flag card and inspect the stored record event (DEC-053), then confirm the
    // card left the feed. Printed for the session report.
    if (FIXTURE === "feed-flag") {
      const countFlags = () => page.evaluate(() => [...document.querySelectorAll("article")].filter(a => [...a.querySelectorAll("button")].some(b => b.textContent.trim() === "Acknowledge")).length);
      const before = await countFlags();
      const clicked = await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find(x => x.textContent.trim() === "Acknowledge");
        if (!b) return false; b.click(); return true;
      });
      await new Promise(r => setTimeout(r, 400));
      const stored = await page.evaluate(() => localStorage.getItem("mi_flag_acknowledgments"));
      const after = await countFlags();
      const events = await page.evaluate(() => localStorage.getItem("mi_advisory_events"));
      const engineUntouched = /"dismissedAt":null/.test(events || "");
      console.log(`Acknowledge pressed: ${clicked}; flag cards ${before} -> ${after}; mi_flag_acknowledgments = ${stored}; engine event untouched: ${engineUntouched}`);
      writeFileSync(join(OUT, "acknowledgment.json"), JSON.stringify({ clicked, flagCardsBefore: before, flagCardsAfter: after, stored: JSON.parse(stored || "null"), engineUntouched }, null, 1));
    }
  } finally {
    await browser.close();
    server.close();
  }

  // Compare against a baseline run if given.
  let newViolations = [];
  if (BASELINE) {
    const basePath = resolve(ROOT, BASELINE, "axe-results.json");
    if (!existsSync(basePath)) { console.error(`baseline not found: ${basePath}`); process.exit(2); }
    const base = JSON.parse(readFileSync(basePath, "utf8"));
    const baseNodes = new Map();
    for (const r of base.results) for (const v of r.violations) baseNodes.set(keyOf(r.route, r.viewport, v), v.nodes);
    for (const r of results) for (const v of r.violations) {
      const k = keyOf(r.route, r.viewport, v);
      const before = baseNodes.get(k) ?? 0;
      if (v.nodes > before) newViolations.push({ route: r.route, viewport: r.viewport, id: v.id, impact: v.impact, help: v.help, nodesBefore: before, nodesAfter: v.nodes, targets: v.targets });
    }
  }

  const total = results.reduce((a, r) => a + r.violations.reduce((b, v) => b + v.nodes, 0), 0);
  const byRule = {};
  for (const r of results) for (const v of r.violations) byRule[v.id] = (byRule[v.id] || 0) + v.nodes;
  writeFileSync(join(OUT, "axe-results.json"), JSON.stringify({ generated: new Date().toISOString(), dist: DIST, tags: AXE_TAGS, results, newViolations }, null, 1));

  const md = [];
  md.push(`# axe-core AA results (${opt("--label", "after")})`, "", `Generated ${new Date().toISOString()} against \`${DIST}\`. Tags: ${AXE_TAGS.join(", ")}.`, "");
  md.push("| Route | Width | Rules failing | Nodes |", "|---|---|---|---|");
  for (const r of results) md.push(`| ${r.title} | ${r.viewport} | ${r.violations.length} | ${r.violations.reduce((a, v) => a + v.nodes, 0)} |`);
  md.push("", `Total failing nodes: ${total}`, "", "## By rule", "", "| Rule | Nodes (all routes and widths) |", "|---|---|");
  for (const [id, n] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) md.push(`| ${id} | ${n} |`);
  md.push("", "## Details", "");
  for (const r of results) {
    md.push(`### ${r.title} at ${r.viewport}px`, "");
    if (!r.violations.length) { md.push("No AA violations.", ""); }
    for (const v of r.violations) {
      md.push(`- **${v.id}** (${v.impact}, ${v.nodes} node${v.nodes === 1 ? "" : "s"}): ${v.help}`);
      for (const d of v.detail) md.push(`    - \`${d.target}\` "${d.text}"${d.fg ? ` fg ${d.fg} on ${d.bg}, ${d.ratio}:1 (needs ${d.expected}), ${d.fontSize}` : ""}`);
    }
    const inc = r.incomplete.filter(i => i.nodes).map(i => `${i.id} (${i.nodes})`).join(", ");
    if (inc) md.push(`- undecided by axe, not counted: ${inc}`);
    md.push("");
  }
  if (BASELINE) {
    md.push("## New or grown violations versus baseline", "");
    if (!newViolations.length) md.push("None.", "");
    for (const v of newViolations) md.push(`- ${v.route}@${v.viewport} **${v.id}** (${v.impact}): ${v.nodesBefore} -> ${v.nodesAfter} nodes. e.g. \`${v.targets[0] || ""}\``);
  }
  writeFileSync(join(OUT, "summary.md"), md.join("\n"));
  console.log(`\nTotal failing nodes: ${total}. Report: ${join(OUT, "summary.md")}`);
  if (BASELINE) console.log(`New or grown violations vs baseline: ${newViolations.length}`);
  if (consoleErrors.length) console.log(`Console errors (${consoleErrors.length}): ${consoleErrors.slice(0, 5).join(" | ")}`);
  if (pageErrors.length) { console.error(`Page errors (${pageErrors.length}): ${pageErrors.slice(0, 5).join(" | ")}`); process.exit(3); }
  if (flag("--fail-on-new") && newViolations.length) process.exit(1);
  if (flag("--fail-on-any") && total) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(2); });
