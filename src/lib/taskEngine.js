// ── Ongoing task engine (ONBOARDING_SPEC v1.1 §7) ────────────────────────────
// Rule-based, deterministic, no AI — the accretion counterpart of the
// tripwire philosophy. Evaluated on app open and after record writes
// (mount + focus + explicit re-evaluation events). Each task: id, trigger
// rule, reason copy, benefit copy, time estimate, CTA route, dismiss/snooze.
// Max 4 visible, priority-ordered (T1–T9 enumeration order). No completion
// percentage anywhere; benefit always renders before the ask.

import { loadState } from "./onboardingState.js";
import { getStagedStore } from "./onboardingStaging.js";
import { evaluateGoalMinimum } from "./artifactEngine.js";
import { MAX_VISIBLE_TASKS } from "../config/onboardingConfig.js";

const readArr = k => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };
const readObj = (k, fb) => { try { return JSON.parse(localStorage.getItem(k) || "null") ?? fb; } catch { return fb; } };
const writeObj = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* locked/quota */ } };

// ── Dismiss / snooze state (per task-instance key) ────────────────────────────
const TASK_STATE_KEY = "mi_onboarding_tasks";
const SNOOZE_DAYS = 7;

export function dismissTask(key) {
  const s = readObj(TASK_STATE_KEY, { dismissed: {}, snoozed: {} });
  s.dismissed[key] = new Date().toISOString();
  writeObj(TASK_STATE_KEY, s);
}
export function snoozeTask(key, now = new Date()) {
  const s = readObj(TASK_STATE_KEY, { dismissed: {}, snoozed: {} });
  s.snoozed[key] = new Date(now.getTime() + SNOOZE_DAYS * 86400000).toISOString();
  writeObj(TASK_STATE_KEY, s);
}
function isHidden(key, now) {
  const s = readObj(TASK_STATE_KEY, { dismissed: {}, snoozed: {} });
  if (s.dismissed[key]) return true;
  const until = s.snoozed[key];
  return !!(until && new Date(until) > now);
}

// ── Session counting (T9: "Session ≥ 2") ─────────────────────────────────────
// One session per calendar day the app is opened. recordAppOpen() runs at
// shell mount, post-unlock.
const SESSION_KEY = "mi_onboarding_sessions";
export function recordAppOpen(now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const s = readObj(SESSION_KEY, { count: 0, lastDay: null });
  if (s.lastDay !== today) writeObj(SESSION_KEY, { count: s.count + 1, lastDay: today });
  return readObj(SESSION_KEY, { count: 1 });
}
export function sessionCount() { return readObj(SESSION_KEY, { count: 0 }).count; }

// ── Rule inputs ───────────────────────────────────────────────────────────────
function driveConnected() { return !!localStorage.getItem("mi_google_user"); }
function confirmedItemCount() {
  const staged = getStagedStore().items.filter(i => i.status === "confirmed").length;
  const manualMeds = readArr("mi_meds_full").filter(m => m.source === "Entered manually").length;
  const manualAllergies = readArr("mi_allergies").length ? 0 : 0; // allergies counted via staged/confirmed only
  return staged + manualMeds + manualAllergies;
}

// §8 storage prompt — exact copy (deviations are build errors).
export const STORAGE_PROMPT = {
  headline: "Your record lives only in this browser right now.",
  body: (n) => `You've confirmed ${n} items. Connect your own Google Drive so your record is backed up and available on other devices. Insina never sees your files — the connection uses your Google account, not ours.`,
  cta: "Connect Google Drive",
  later: "Maybe later",
};

// T2 per-element copy: benefit-before-ask, artifact-specific.
const T2_COPY = {
  name_dob:    (artifact) => ({ reason: `Add your name and date of birth: needed for your ${artifact}.`, benefit: "Every report is labeled correctly for your care team.", minutes: 1, route: "profile", ctaLabel: "Add basics" }),
  tier0:       (artifact) => ({ reason: `Add your transplant details: needed for your ${artifact}.`, benefit: "Your reports carry the context every clinician asks for first.", minutes: 2, route: "onboarding:2", ctaLabel: "Add details" }),
  medication:  (artifact) => ({ reason: `Add at least one medication: needed for your ${artifact}.`, benefit: "Your first report becomes available the moment one is confirmed.", minutes: 2, route: "import", ctaLabel: "Add medications" }),
  allergies:   (artifact) => ({ reason: `Confirm your allergies: needed for your ${artifact}.`, benefit: "Contraindication checks in your reports depend on this.", minutes: 1, route: "import", ctaLabel: "Review allergies" }),
  condition:   (artifact) => ({ reason: `Add a condition (or confirm you have none): needed for your ${artifact}.`, benefit: "Your profile tells the whole story at a glance.", minutes: 1, route: "conditions", ctaLabel: "Add condition" }),
  appointment: (artifact) => ({ reason: `Add your upcoming appointment: needed for your ${artifact}.`, benefit: "Your prep brief is built around the visit.", minutes: 1, route: "appointments", ctaLabel: "Add appointment" }),
};

/**
 * Evaluate T1–T9 and return every currently-triggered, non-hidden task in
 * priority order. Callers slice to MAX_VISIBLE_TASKS for display.
 */
export function evaluateTasks(now = new Date()) {
  const tasks = [];
  const state = loadState();
  const staged = getStagedStore().items;
  const goal = state?.goal || null;

  // T1 — unreviewed staged items
  const unreviewed = staged.filter(i => i.status === "staged").length;
  if (unreviewed > 0) tasks.push({
    key: "T1", rule: "T1",
    benefit: "They stay out of your record and reports until you confirm them.",
    reason: `Finish reviewing ${unreviewed} item${unreviewed !== 1 ? "s" : ""} from your documents.`,
    minutes: Math.max(1, Math.ceil(unreviewed / 5)), route: "import", ctaLabel: "Review now",
  });

  // T2 — goal artifact minimum unmet → one task per missing element
  if (goal && !state?.artifact_generated) {
    const evaln = evaluateGoalMinimum(goal);
    evaln.missing.forEach(m => {
      const c = T2_COPY[m.key]?.(evaln.artifact);
      if (c) tasks.push({ key: `T2-${m.key}`, rule: "T2", benefit: c.benefit, reason: c.reason, minutes: c.minutes, route: c.route, ctaLabel: c.ctaLabel });
    });
  }

  // T3 — thin lab trends (track/appointment goals), incl. the §6 queued marker
  if (goal === "track_meds_labs" || goal === "appointment_prep") {
    const byTest = {};
    readArr("mi_labs").forEach(l => { const k = (l.name || "").trim(); if (k) byTest[k] = (byTest[k] || 0) + 1; });
    const thin = Object.entries(byTest).filter(([, n]) => n > 0 && n < 3);
    if (thin.length === 0 && state?.labs_import_task_queued && readArr("mi_labs").length === 0) {
      tasks.push({
        key: "T3-first-labs", rule: "T3",
        benefit: "Trends need history. Your labs become graphs instead of numbers.",
        reason: "Import your lab results from recent visits.",
        minutes: 5, route: "import", ctaLabel: "Import labs",
      });
    }
    thin.slice(0, 3).forEach(([test, n]) => {
      const needed = 3 - n;
      tasks.push({
        key: `T3-${test}`, rule: "T3",
        benefit: "Trends need history. This one becomes a graph instead of a number.",
        reason: `Import earlier ${test} results: ${needed} more unlock${needed === 1 ? "s" : ""} trends.`,
        minutes: 3, route: "import", ctaLabel: "Import labs",
      });
    });
  }

  // T4 — care team lacks the next appointment's specialty
  const today = now.toISOString().slice(0, 10);
  const nextAppt = readArr("mi_appointments")
    .filter(a => a.status === "upcoming" && a.date && a.date >= today && a.specialty)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (nextAppt) {
    const spec = nextAppt.specialty.toLowerCase();
    const covered = readArr("mi_care_team").some(m =>
      (m.specialty || "").toLowerCase().includes(spec) || (m.role || "").toLowerCase().includes(spec) || spec.includes((m.specialty || "zzz").toLowerCase())
    );
    if (!covered) tasks.push({
      key: `T4-${nextAppt.specialty}`, rule: "T4",
      benefit: "Your prep brief and emergency packet know who to name.",
      reason: `Add your ${nextAppt.specialty}: improves your prep brief.`,
      minutes: 1, route: "careplan", ctaLabel: "Add to care team",
    });
  }

  // T5 — "Not sure" deferrals
  const deferred = staged.filter(i => i.status === "deferred").length;
  if (deferred > 0) tasks.push({
    key: "T5", rule: "T5",
    benefit: "A second look usually settles them in seconds.",
    reason: `Revisit ${deferred} item${deferred !== 1 ? "s" : ""} you marked Not sure.`,
    minutes: Math.max(1, Math.ceil(deferred / 2)), route: "import", ctaLabel: "Revisit",
  });

  // T6 — Tier 0 skipped
  const t0 = state?.tier0 || {};
  if (!(t0.organ && t0.tx_date)) tasks.push({
    key: "T6", rule: "T6",
    benefit: "Your Emergency Card leads with what ER teams need first.",
    reason: "Add your transplant details: 2 minutes, needed for your Emergency Card.",
    minutes: 2, route: "onboarding:2", ctaLabel: "Add details",
  });

  // T7 — pharmacy absent with ≥3 active meds
  const activeMeds = readArr("mi_meds_full").filter(m => m.status !== "inactive");
  if (activeMeds.length >= 3 && !activeMeds.some(m => m.pharmacy)) tasks.push({
    key: "T7", rule: "T7",
    benefit: "Refill reminders can tell you where to call.",
    reason: "Add your pharmacy: helps with refill tracking.",
    minutes: 1, route: "profile", ctaLabel: "Add pharmacy",
  });

  // T8 — unverified medication names from free-text manual entry
  const unverified = readArr("mi_meds_full").filter(m => m.unverifiedName).length;
  if (unverified > 0) tasks.push({
    key: "T8", rule: "T8",
    benefit: "Interaction and refill features match on exact names.",
    reason: `Verify ${unverified} medication name${unverified !== 1 ? "s" : ""}.`,
    minutes: 1, route: "medications", ctaLabel: "Verify",
  });

  // T9 — session-two storage prompt (§8 exact copy; rendered specially)
  const confirmed = confirmedItemCount();
  if (sessionCount() >= 2 && !driveConnected() && confirmed >= 10) tasks.push({
    key: "T9", rule: "T9",
    storagePrompt: true,
    benefit: STORAGE_PROMPT.headline,
    reason: STORAGE_PROMPT.body(confirmed),
    minutes: 2, route: "backup", ctaLabel: STORAGE_PROMPT.cta, laterLabel: STORAGE_PROMPT.later,
  });

  // "kept both" duplicates flagged in §5.3 ride T5's spirit but are their own
  // follow-up; surfaced through T8-style verification when flagged.
  const keptBoth = readArr("mi_meds_full").filter(m => m.reviewFlag === "kept-both-duplicate").length;
  if (keptBoth > 0) tasks.push({
    key: "T5-kept-both", rule: "T5",
    benefit: "You kept both copies of a duplicate. One of them is probably right.",
    reason: `Review ${keptBoth} medication entr${keptBoth !== 1 ? "ies" : "y"} you kept as duplicates.`,
    minutes: 1, route: "medications", ctaLabel: "Review",
  });

  // Priority = T1..T9 enumeration order; stable within a rule.
  const rank = t => parseInt(t.rule.slice(1), 10);
  return tasks.filter(t => !isHidden(t.key, now)).sort((a, b) => rank(a) - rank(b));
}

export function visibleTasks(now = new Date()) {
  return evaluateTasks(now).slice(0, MAX_VISIBLE_TASKS);
}
