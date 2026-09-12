// ── Dashboard feed: data assembly for "Your updates" (WO_DASHBOARD_FEED_01) ──
// DEC-051 structure, DEC-052 eligibility and ordering, DEC-053 acknowledge
// versus dismiss, DEC-054 emergency strip, DEC-055 roster. Pure reads of the
// record plus two record keys of its own: dashboard dismissals (a display
// preference) and flag acknowledgments (a record event). Nothing here changes
// a tripwire flag, a staged import, a lab, an appointment, or a medication.
//
// Two deterministic engines feed the flag kind (DEC-052 implementation note):
//   advisory events (advisoryLog.js): tier EMERGENCY or TODAY, point-in-time
//   tripwire envelope (tripwire.js):  level "urgent" flags on the current labs
// "Advisory tier" is TODAY plus tripwire urgent; "emergency tier" is EMERGENCY.
// Flag text is the engine's own text, never authored here.

import { getTripwireEnvelope } from "../../lib/tripwire.js";
import { getCoordinator } from "../../lib/advisoryRuntime.js";
import { buildAdvisory, buildStagedVerify } from "../../data/advisoryTemplates.js";
import { TRIPWIRE_METRICS, EMERGENCY, TODAY } from "../../data/tripwireTable.js";
import { reviewableArchiveDocs } from "../../lib/labBatchConfirm.js";
import { getItems as stagedItems } from "../../lib/onboardingStaging.js";
import { getStore } from "../../store.js";
import { formatDateUS, displayPhone } from "../../lib/displaySafe.js";

export const DISMISSALS_KEY = "mi_dashboard_dismissals";   // [{ id, fingerprint, dismissedAt }]
export const ACKS_KEY       = "mi_flag_acknowledgments";   // [{ flagId, acknowledgedAt, recordedBy }]
export const BELL_SEEN_KEY  = "insina_bell_seen";          // plain UI preference, not health data

export const APPT_WINDOW_DAYS   = 14;
export const REFILL_WINDOW_DAYS = 7;
export const RESULT_WINDOW_DAYS = 90;  // Tier 2: DEC-052 sets no window; unbounded history would flood the feed
export const FLAG_WINDOW_DAYS   = 14;  // Tier 2: an advisory event is "current" for the engine's own 14-day window
export const FEED_PREVIEW       = 5;
export const NEEDS_ATTENTION    = new Set(["flag", "review", "result"]);
const RANK = { flag: 0, review: 1, result: 2, appt: 3, refill: 3 };

// ── small helpers ────────────────────────────────────────────────────────────
function read(key, fallback) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* locked or quota: non-fatal */ }
}
const DAY = 86400000;
export function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
/** ISO "YYYY-MM-DD" -> local noon Date; other strings via Date; invalid -> null. */
export function toDate(str) {
  if (!str) return null;
  if (str instanceof Date) return isNaN(str) ? null : str;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date(str + "T12:00:00");
  const d = new Date(str);
  return isNaN(d) ? null : d;
}
export function daysFrom(now, date) {
  const d = toDate(date); if (!d) return null;
  return Math.round((startOfDay(d) - startOfDay(now)) / DAY);
}
/** Medication refill dates are stored as ISO or as "Mar 28" (legacy); same parse the dashboard used before. */
export function parseRefillDate(str, now = new Date()) {
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date(str + "T12:00:00");
  const yr = now.getFullYear();
  const d = new Date(`${str}, ${yr}`);
  if (isNaN(d.getTime())) return null;
  if (d < new Date(now.getTime() - 180 * DAY)) d.setFullYear(yr + 1);
  return d;
}
function isoOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function longDate(d) {
  const x = toDate(d); if (!x) return "";
  return x.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}
function shortDate(d) {
  const x = toDate(d); if (!x) return "";
  return x.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function firstSentence(text) {
  const m = String(text || "").match(/^(.*?[.!?])(\s+|$)([\s\S]*)$/);
  return m ? { title: m[1], body: m[3].trim() } : { title: String(text || ""), body: "" };
}

// ── flags ────────────────────────────────────────────────────────────────────
/** Advisory-engine events that are current: within the engine's window and not rejected. */
export function advisoryFlags(now = new Date()) {
  const events = read("mi_advisory_events", []);
  if (!Array.isArray(events)) return [];
  const cutoff = now.getTime() - FLAG_WINDOW_DAYS * DAY;
  const coordinator = safeCoordinator();
  const out = [];
  for (const e of events) {
    if (!e || !e.id || e.rejectedAt) continue;
    if (e.tier !== EMERGENCY && e.tier !== TODAY) continue;
    const ts = new Date(e.ts || 0).getTime();
    if (!Number.isFinite(ts) || ts < cutoff) continue;
    const metric = TRIPWIRE_METRICS[e.metric] || {};
    const displayName = metric.displayName || e.metric;
    const unverified = e.source === "staged" && e.verification === "unverified-import";
    let text;
    if (unverified) {
      text = buildStagedVerify({ metric: displayName, value: e.value, unit: e.unit || "", date: e.resultDate || "" });
    } else {
      const adv = buildAdvisory({
        tier: e.tier, metricId: e.metric, metric: displayName, value: e.value, unit: e.unit || "",
        coordinator, staged: e.source === "staged" && e.resultDate ? { date: e.resultDate } : null,
        source: e.source, verification: e.verification,
      });
      text = adv.paragraphs.join(" ");
    }
    const { title, body } = firstSentence(text);
    out.push({
      kind: "flag", engine: "advisory", id: `adv:${e.id}`, flagId: e.id, tier: e.tier,
      // an unverified staged value has not earned the emergency workflow yet (DEC-043 verify-first)
      emergency: e.tier === EMERGENCY && !unverified,
      title, body, text, date: e.resultDate || (e.ts || "").slice(0, 10), when: e.ts,
      action: "View", event: e,
    });
  }
  return out;
}
function safeCoordinator() { try { return getCoordinator(); } catch { return null; } }

/** Tripwire urgent flags on the current labs (abnormal-level flags are out-of-range results, not flags). */
export function tripwireFlags() {
  let env;
  try { env = getTripwireEnvelope(); } catch { return []; }
  if (!env || !Array.isArray(env.flags)) return [];
  return env.flags.filter(f => f.level === "urgent").map(f => {
    const flagId = `tw:${f.canonicalId}|${f.date || ""}|${f.value}|${f.bound}`;
    const title = `${f.analyte}: ${f.value}${f.unit ? " " + f.unit : ""}, ${String(f.level).toUpperCase()} (${f.bound})`;
    return { kind: "flag", engine: "tripwire", id: flagId, flagId, tier: TODAY, emergency: false,
      title, body: f.guidance || "", text: `${title}. ${f.guidance || ""}`, date: f.date || "", when: env.evaluatedAt,
      action: "View", nav: "labs", select: { category: "labs", title: f.analyte } };
  });
}

export function readAcknowledgments() { const a = read(ACKS_KEY, []); return Array.isArray(a) ? a : []; }
export function isAcknowledged(flagId) { return readAcknowledgments().some(a => a.flagId === flagId); }
/** DEC-053: the record event. Writes { flagId, acknowledgedAt, recordedBy }; the engine's own state is untouched. */
export function acknowledgeFlag(flagId, recordedBy = "patient") {
  if (!flagId) return null;
  const entry = { flagId, acknowledgedAt: new Date().toISOString(), recordedBy };
  const acks = readAcknowledgments().filter(a => a.flagId !== flagId);
  acks.push(entry);
  write(ACKS_KEY, acks);
  try { window.dispatchEvent(new Event("mi-dashboard-changed")); } catch { /* not in a browser */ }
  return entry;
}

// ── dismissals (display preference) ──────────────────────────────────────────
export function readDismissals() { const d = read(DISMISSALS_KEY, []); return Array.isArray(d) ? d : []; }
export function isDismissed(item) {
  return readDismissals().some(d => d.id === item.id && d.fingerprint === item.fingerprint);
}
/** Hides a card for this record until the underlying item changes (its fingerprint moves). Never for flags. */
export function dismissFeedItem(item) {
  if (!item || item.kind === "flag") return false;
  const list = readDismissals().filter(d => !(d.id === item.id && d.fingerprint === item.fingerprint));
  list.push({ id: item.id, fingerprint: item.fingerprint, dismissedAt: new Date().toISOString() });
  write(DISMISSALS_KEY, list.slice(-200));
  try { window.dispatchEvent(new Event("mi-dashboard-changed")); } catch { /* not in a browser */ }
  return true;
}

// ── review, results, appointments, refills ───────────────────────────────────
export function pendingReview() {
  let archiveRows = 0;
  try { archiveRows = reviewableArchiveDocs().reduce((a, d) => a + d.rows.filter(r => r.state === "pending").length, 0); } catch { /* none */ }
  let staged = [];
  try { staged = [...stagedItems({ status: "staged" }), ...stagedItems({ status: "deferred" })]; } catch { staged = []; }
  const perItem = staged.filter(i => i.category === "medication" || i.category === "allergy").length;
  const total = archiveRows + staged.length;
  if (total === 0) return null;
  const body = perItem > 0
    ? `${total} item${total === 1 ? " is" : "s are"} waiting for review. ${perItem} ${perItem === 1 ? "is a medication or allergy and needs" : "are medications or allergies and need"} to be confirmed one at a time.`
    : `${total} item${total === 1 ? " is" : "s are"} waiting for review.`;
  return { kind: "review", id: "review", fingerprint: `${archiveRows}:${staged.length}:${perItem}`,
    title: "Imported records are waiting for review", body, date: "", action: `Review ${total} item${total === 1 ? "" : "s"}`, nav: "import" };
}

export function outOfRangeResults(now = new Date()) {
  const labs = read("mi_labs", []);
  if (!Array.isArray(labs)) return [];
  const cutoff = now.getTime() - RESULT_WINDOW_DAYS * DAY;
  const byDate = new Map();
  for (const l of labs) {
    if (!l || !l.date) continue;
    const d = toDate(l.date); if (!d || d.getTime() < cutoff) continue;
    if (!byDate.has(l.date)) byDate.set(l.date, []);
    byDate.get(l.date).push(l);
  }
  const out = [];
  for (const [date, rows] of byDate) {
    const flagged = rows.filter(r => r.flag);
    if (!flagged.length) continue;
    const f = flagged[0];
    const title = flagged.length === 1 ? `${f.name} is out of range` : `${flagged.length} results are out of range`;
    const ref = f.refRange ? ` Reference range ${f.refRange}.` : "";
    const rest = flagged.length === 1
      ? (rows.length > 1 ? " Everything else on the panel was in range." : "")
      : ` ${flagged.slice(1, 4).map(r => r.name).join(", ")}${flagged.length > 4 ? " and more" : ""} also flagged.`;
    const body = `${f.name} ${f.value}${f.unit ? " " + f.unit : ""} on ${formatDateUS(date)}.${ref}${rest}`;
    out.push({ kind: "result", id: `result:${date}`, fingerprint: `${flagged.length}:${rows.length}`, date, when: date,
      title, body, action: "View results", nav: "labs", select: { category: "labs", title: f.name } });
  }
  return out.sort((a, b) => (toDate(b.date) || 0) - (toDate(a.date) || 0));
}

export function upcomingAppointments(now = new Date()) {
  const appts = read("mi_appointments", []);
  if (!Array.isArray(appts)) return [];
  return appts
    .filter(a => a && a.status === "upcoming" && a.date)
    .map(a => ({ a, days: daysFrom(now, a.date) }))
    .filter(({ days }) => days != null && days >= 0 && days <= APPT_WINDOW_DAYS)
    .sort((x, y) => x.days - y.days || String(x.a.time || "").localeCompare(String(y.a.time || "")))
    .map(({ a }) => ({
      kind: "appt", id: `appt:${a.id}`, fingerprint: `${a.date}|${a.time || ""}|${a.provider || ""}`, date: a.date, when: a.date,
      title: a.title || a.provider || "Appointment",
      body: `${longDate(a.date)}${a.time ? ` at ${a.time}` : ""}${a.provider ? ` with ${a.provider}` : ""}${a.facility ? `, ${a.facility}` : ""}.`,
      action: "View appointment", nav: "appointments", select: { category: "appointments", title: a.title || a.provider || "" }, appointment: a,
    }));
}

export function refillsDue(now = new Date()) {
  const meds = read("mi_meds_full", []);
  if (!Array.isArray(meds)) return [];
  const out = [];
  for (const m of meds) {
    if (!m || m.status === "inactive" || !m.refillDate) continue;
    const d = parseRefillDate(m.refillDate, now); if (!d) continue;
    const days = Math.round((startOfDay(d) - startOfDay(now)) / DAY);
    if (days < 0 || days > REFILL_WINDOW_DAYS) continue;
    const dateISO = isoOf(d);
    out.push({ kind: "refill", id: `refill:${m.id ?? m.name}`, fingerprint: `${m.refillDate}`, date: dateISO, when: dateISO,
      title: `${m.name} refill due`,
      body: `${days === 0 ? "Due today" : days === 1 ? "1 day left" : `${days} days left`}. Refill due ${formatDateUS(dateISO)}${m.pharmacy ? ` at ${m.pharmacy}` : ""}.`,
      action: "View medication", nav: "medications", select: { category: "medications", title: m.name }, medication: m, days });
  }
  return out.sort((a, b) => a.days - b.days);
}

// ── assembly ─────────────────────────────────────────────────────────────────
/**
 * The feed. Ordered flags, review, results, then appointments and refills interleaved by date.
 * Acknowledged flags and dismissed cards are excluded; `emergency` lists the emergency-tier
 * flags that drive the strip (DEC-054), acknowledged ones excluded.
 */
export function buildFeed(now = new Date()) {
  const acks = new Set(readAcknowledgments().map(a => a.flagId));
  const flags = [...advisoryFlags(now), ...tripwireFlags()].filter(f => !acks.has(f.flagId));
  const review = pendingReview();
  const results = outOfRangeResults(now).filter(i => !isDismissed(i));
  const dated = [...upcomingAppointments(now), ...refillsDue(now)]
    .filter(i => !isDismissed(i))
    .sort((a, b) => (toDate(a.date) || 0) - (toDate(b.date) || 0) || RANK[a.kind] - RANK[b.kind]);
  const items = [...flags, ...(review && !isDismissed(review) ? [review] : []), ...results, ...dated];
  return {
    items,
    attention: items.filter(i => NEEDS_ATTENTION.has(i.kind)).length,
    emergency: flags.filter(f => f.emergency),
    refillsDue: refillsDue(now).length,
    appointmentsSoon: upcomingAppointments(now).length,
  };
}

// ── vitals (DEC-051 item 5) ──────────────────────────────────────────────────
/** Latest blood pressure, weight, temperature with the existing out-of-range rules (Tab06 thresholds). */
export function currentVitals(readings = []) {
  const bp = readings.find(r => r && r.bp_s != null && r.bp_d != null);
  const wt = readings.find(r => r && r.weight != null);
  const tp = readings.find(r => r && r.temp != null);
  const bpHigh = !!bp && (bp.flag === true || Number(bp.bp_s) >= 140 || Number(bp.bp_d) >= 90);
  const tempOff = !!tp && (Number(tp.temp) > 99.5 || Number(tp.temp) < 97);
  return [
    { id: "bp", label: "Blood pressure", value: bp ? `${bp.bp_s}/${bp.bp_d}` : null, unit: "mmHg", date: bp?.date || null, flagged: bpHigh },
    { id: "weight", label: "Weight", value: wt ? String(wt.weight) : null, unit: "lbs", date: wt?.date || null, flagged: false },
    { id: "temp", label: "Temperature", value: tp ? String(tp.temp) : null, unit: "°F", date: tp?.date || null, flagged: tempOff },
  ];
}

// ── Who to call (DEC-055) ────────────────────────────────────────────────────
/**
 * Roster derived from the care team's fields (no role tags exist; DEC-055 note):
 * coordinator by role or specialty text, after-hours from any 24-hour line, primary
 * care from the pcp flag; remaining slots filled by other members with a phone.
 * TODO(roster): replace the derivation with editable role tags on care team members.
 */
export function rosterFromCareTeam(team, max = 4) {
  const members = Array.isArray(team) ? team.filter(m => m && (m.phone || m.phone24)) : [];
  const rows = []; const used = new Set();
  const take = (m, role, phone) => { if (!m || used.has(m) || !phone) return; used.add(m); rows.push({ role, name: m.name || "", phone, tel: String(phone).replace(/[^\d+]/g, "") }); };
  const coord = members.find(m => /coordinator/i.test(String(m.role || "")) || /coordinator/i.test(String(m.specialty || "")));
  take(coord, "Transplant coordinator", coord?.phone || coord?.phone24);
  const afterHours = members.find(m => m.phone24);
  if (afterHours) { used.delete(afterHours); take(afterHours, "After hours line", afterHours.phone24); }
  const pcp = members.find(m => m.pcp);
  take(pcp, "Primary care", pcp?.phone || pcp?.phone24);
  for (const m of members) { if (rows.length >= max) break; take(m, m.role || m.specialty || "Care team", m.phone || m.phone24); }
  return rows.slice(0, max).map(r => ({ ...r, display: displayPhone(r.phone) }));
}

// ── bell: passive events (DEC-053 last bullet; WO 4.10 Tier 2 fallback) ─────
/** Newest first, last 20. Composed from the timestamps that exist: there is no unified event log. */
export function passiveEvents(readings = [], now = new Date()) {
  const ev = [];
  const push = (id, text, when) => { const t = toDate(when); if (t) ev.push({ id, text, when: t.toISOString(), time: t.getTime() }); };
  const weekly = read("mi_last_weekly_backup", null); if (weekly) push("backup:weekly", "Backed up to Google Drive", weekly);
  const folder = read("mi_last_folder_backup", null); if (folder) push("backup:folder", "Backed up to your backup folder", folder);
  const sync = read("mi_last_sync", null); if (sync) push("sync", "Synced with Google Drive", sync);
  for (const r of readings.slice(0, 20)) {
    if (!r) continue;
    const bits = [];
    if (r.bp_s != null && r.bp_d != null) bits.push(`BP ${r.bp_s}/${r.bp_d}`);
    if (r.weight != null) bits.push(`weight ${r.weight} lbs`);
    if (r.temp != null) bits.push(`temp ${r.temp}°F`);
    if (r.hr != null) bits.push(`HR ${r.hr}`);
    if (r.o2 != null) bits.push(`O2 ${r.o2}%`);
    if (r.glucose != null) bits.push(`glucose ${r.glucose}`);
    if (!bits.length) continue;
    push(`vitals:${r.id || r.ts || r.date}`, `Vitals logged: ${bits.join(", ")}`, r.ts || (r.date ? `${r.date}T${r.time || "12:00"}:00` : null));
  }
  const labs = read("mi_labs", []);
  if (Array.isArray(labs)) {
    const byDate = new Map();
    for (const l of labs) { if (!l || !l.date) continue; if (!byDate.has(l.date)) byDate.set(l.date, []); byDate.get(l.date).push(l); }
    for (const [date, rows] of byDate) {
      if (rows.some(r => r.flag)) continue;
      push(`labs:${date}`, `Results from ${formatDateUS(date)}: all ${rows.length} value${rows.length === 1 ? "" : "s"} in range`, date);
    }
  }
  let log = [];
  try { log = getStore("importLog") || []; } catch { log = []; }
  for (const e of (Array.isArray(log) ? log : []).slice(0, 10)) {
    if (!e || !e.ts) continue;
    push(`import:${e.ts}`, `Import completed${e.records != null ? `: ${e.records} record${e.records === 1 ? "" : "s"}` : ""}${e.source ? ` from ${e.source}` : ""}`, e.ts);
  }
  ev.sort((a, b) => b.time - a.time);
  return ev.slice(0, 20).map(e => ({ ...e, label: labelWhen(e.time, now) }));
}
function labelWhen(t, now) {
  const d = new Date(t);
  const sameDay = startOfDay(d).getTime() === startOfDay(now).getTime();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return sameDay ? `Today, ${time}` : shortDate(d);
}
export function bellUnseenCount(events) {
  const seen = Number(read(BELL_SEEN_KEY, 0)) || 0;
  return events.filter(e => e.time > seen).length;
}
export function markBellSeen(at = Date.now()) { write(BELL_SEEN_KEY, at); }

// ── the flag's own screen ────────────────────────────────────────────────────
/**
 * "View" on an advisory flag reopens the advisory takeover for that event with the
 * same payload the runtime dispatches when it fires (AdvisoryModal's contract). The
 * event log is not touched here; closing the modal records its own dismissal as usual.
 */
export function openAdvisoryFlag(item) {
  if (!item || item.engine !== "advisory" || !item.event || typeof window === "undefined") return false;
  const e = item.event;
  const metric = TRIPWIRE_METRICS[e.metric] || {};
  const displayName = metric.displayName || e.metric;
  const unverified = e.source === "staged" && e.verification === "unverified-import";
  const coordinator = safeCoordinator();
  const staged = e.source === "staged" && e.resultDate ? { date: e.resultDate } : null;
  const advisory = buildAdvisory({ tier: e.tier, metricId: e.metric, metric: displayName, value: e.value, unit: e.unit || "",
    coordinator, staged, source: e.source, verification: e.verification });
  const hit = { metric: e.metric, displayName, unit: e.unit || "", value: e.value, tier: e.tier, source: e.source,
    resultDate: e.resultDate || null, readingId: e.readingId ?? null, verification: e.verification, tableVersion: e.tableVersion };
  window.dispatchEvent(new CustomEvent("insina-advisory", {
    detail: {
      mode: e.tier === EMERGENCY ? "emergency" : "today",
      hit, advisory, coordinator, eventId: e.id,
      requiresVerification: unverified,
      verifyText: unverified ? buildStagedVerify({ metric: displayName, value: e.value, unit: e.unit || "", date: e.resultDate || "" }) : null,
    },
  }));
  return true;
}
