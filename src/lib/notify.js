// ─────────────────────────────────────────────────────────────────────────────
// notify.js — Local notifications. Appointment reminders + attention alerts are
// toggled in Settings; medication reminders are per dose-time group, toggled on
// the Meds screen. The app is fully usable with all of them off. These are local
// (Notification API + in-session scheduling); background push is a later phase.
// ─────────────────────────────────────────────────────────────────────────────

import { rls, wls, upcomingAppointments, daysUntil } from "./companionData.js";

// ── Appointment / attention prefs ─────────────────────────────────────────────
const PREF_DEFAULTS = { appts: false, alerts: false };
export function getNotifPrefs() { return { ...PREF_DEFAULTS, ...rls("mi_notif_prefs", {}) }; }
export function setNotifPrefs(p) { wls("mi_notif_prefs", { ...getNotifPrefs(), ...p }); }

// ── Per-group medication reminders ────────────────────────────────────────────
const REMINDER_DEFAULTS = {
  morning: { on: false, time: "08:00" },
  midday:  { on: false, time: "12:00" },
  evening: { on: false, time: "20:00" },
};
export function getMedReminders() { return { ...REMINDER_DEFAULTS, ...rls("mi_med_reminders", {}) }; }
export function setMedReminder(group, patch) {
  const all = getMedReminders();
  all[group] = { ...all[group], ...patch };
  wls("mi_med_reminders", all);
  scheduleMedReminders();
}

export async function requestNotifPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
}

function fire(title, body) {
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try { new Notification(title, { body, icon: "/favicon.png" }); } catch { /* ignore */ }
  }
}

function msUntil(time) {
  const [h, m] = (time || "08:00").split(":").map(Number);
  const at = new Date();
  at.setHours(h, m, 0, 0);
  if (at <= new Date()) at.setDate(at.getDate() + 1);
  return at - new Date();
}

// Schedule the next occurrence of each enabled group's reminder; re-arm on fire
// (works while the app stays open).
let medTimers = [];
export function scheduleMedReminders() {
  medTimers.forEach(clearTimeout);
  medTimers = [];
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const reminders = getMedReminders();
  for (const [group, cfg] of Object.entries(reminders)) {
    if (!cfg.on) continue;
    const id = setTimeout(() => {
      fire("Insina Health: Medications", `Time for your ${group} medications.`);
      scheduleMedReminders();
    }, msUntil(cfg.time));
    medTimers.push(id);
  }
}

// ── On-open: appointment reminders + attention alerts (best-effort, once) ─────
export function runOpenNotifications(flags = []) {
  const prefs = getNotifPrefs();
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (prefs.appts) {
    const appt = upcomingAppointments()[0];
    const d = appt ? daysUntil(appt.date) : null;
    if (d != null && d >= 0 && d <= 1) fire("Insina Health: Upcoming visit", `${appt.title} ${d === 0 ? "today" : "tomorrow"}. Review your Pre-Visit Brief.`);
  }
  if (prefs.alerts && flags.length) fire("Insina Health: Worth a glance", flags[0].title);
}
