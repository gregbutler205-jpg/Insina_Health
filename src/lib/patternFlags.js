// ─────────────────────────────────────────────────────────────────────────────
// patternFlags.js — Proactive, data-grounded pattern detection. Runs after sync.
// Deterministic (no AI): cheaper, reproducible, and conservative — we only flag
// what is genuinely worth a glance. The app watches the record so the patient
// doesn't have to. Flags are dismissible; a new reading re-surfaces them.
// ─────────────────────────────────────────────────────────────────────────────

import { rls, wls, readings } from "./companionData.js";

// ── Personalized ranges (doctor targets) override standard reference ranges ──
function customRanges() { return rls("mi_lab_custom_ranges", {}); }
function parseRange(refRange) {
  const m = String(refRange || "").match(/(-?\d+\.?\d*)\s*-\s*(-?\d+\.?\d*)/);
  if (!m) return null;
  return { low: +m[1], high: +m[2] };
}
function rangeFor(lab) {
  const custom = customRanges()[(lab.name || "").toLowerCase().trim()];
  if (custom) return custom;
  return parseRange(lab.refRange);
}

/** Labs for a given name, oldest → newest, numeric values only. */
function labSeries(name) {
  return rls("mi_labs", [])
    .filter(l => (l.name || "").toLowerCase().trim() === name.toLowerCase().trim() && l.value != null && l.value !== "" && !isNaN(+l.value))
    .map(l => ({ ...l, num: +l.value }))
    .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
}
function distinctLabNames() {
  return [...new Set(rls("mi_labs", []).map(l => (l.name || "").trim()).filter(Boolean))];
}

/** Returns conservative pattern flags: [{ id, level, title, detail }]. */
export function computePatternFlags() {
  const flags = [];

  // ── Blood pressure drifting up across recent readings ──────────────────────
  const sys = readings().filter(r => r.bp_s != null).slice(0, 3).map(r => +r.bp_s); // newest-first
  if (sys.length === 3 && sys[0] > sys[1] && sys[1] > sys[2] && sys[0] >= 135) {
    flags.push({
      id: `bp-up-${sys[0]}`, level: "caution",
      title: "Blood pressure drifting up",
      detail: `Systolic rose across your last 3 readings (${[...sys].reverse().join(" → ")}). Worth mentioning at your next visit.`,
    });
  }

  // ── Lab patterns: trough drug level falling, or a value moving past its range ─
  for (const name of distinctLabNames()) {
    const series = labSeries(name);
    if (series.length < 3) continue;
    const last3 = series.slice(-3);
    const nums = last3.map(s => s.num);          // oldest → newest
    const recent = last3[2];
    const range = rangeFor(recent);

    // Drug/trough level trending down toward or below the low bound
    // (nums is oldest → newest, so "down" means strictly decreasing)
    if (/trough|level|tacrolimus|cyclosporine|sirolimus/i.test(name) &&
        nums[0] > nums[1] && nums[1] > nums[2] && range && recent.num <= range.low) {
      flags.push({
        id: `lvl-down-${name}-${recent.num}`, level: "caution",
        title: `${name} trending down`,
        detail: `${nums.join(" → ")} ${recent.unit || ""}; now at/below your target low (${range.low}). Confirm dosing with your team.`,
      });
    }

    // A flagged lab moving FURTHER from its normal range over the last 3 draws
    if (range) {
      const dev = v => v > range.high ? v - range.high : v < range.low ? range.low - v : 0;
      const devs = nums.map(dev);
      if (recent.flag && devs[2] > 0 && devs[0] < devs[1] && devs[1] < devs[2]) {
        flags.push({
          id: `lab-drift-${name}-${recent.num}`, level: "caution",
          title: `${name} moving further from range`,
          detail: `${nums.join(" → ")} ${recent.unit || ""} (ref ${recent.refRange || `${range.low}-${range.high}`}). Drifting the wrong way: flag for review.`,
        });
      }
    }
  }

  return dropDismissed(flags);
}

// ── Dismissals (keyed by flag id, which embeds the latest value so a new ───────
//    reading produces a new id and re-surfaces the pattern) ────────────────────
export function dismissFlag(id) {
  const all = rls("mi_flag_dismissed", []);
  if (!all.includes(id)) wls("mi_flag_dismissed", [id, ...all].slice(0, 200));
}
function dropDismissed(flags) {
  const dismissed = new Set(rls("mi_flag_dismissed", []));
  return flags.filter(f => !dismissed.has(f.id));
}
