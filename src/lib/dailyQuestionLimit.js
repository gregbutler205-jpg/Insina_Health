// ── Daily question limit (OPEN-17a resolved: Greg, 2026-07-21) ───────────────
// 15 conversation questions per day per user, enforced client-side per turn in
// the AI Analysis tab (DEC-042's "the daily limit is the cap" — the work order
// believed a limit existed; none did, so this is it). Counts SUCCESSFUL sends
// only — a request the proxy rejected or a cold-start fetch failure doesn't
// consume quota, so the Retry path never double-charges a turn. The counter
// resets at local midnight. Per-conversation Summary prints and other AI
// surfaces are not conversation turns and are not counted (work-order scope).
// The proxy's per-IP hourly caps (60/hr chat) remain the hard backstop.
//
// Storage: insina_ai_daily {date: "YYYY-MM-DD", count} — operational metadata
// left outside the vault on purpose (no clinical content; the chat content
// keys moved into the vault in migration v5, OPEN-17b).

export const DAILY_QUESTION_LIMIT = 15;
const KEY = "insina_ai_daily";

const dayStr = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function read(now = new Date()) {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && raw.date === dayStr(now) && Number.isFinite(raw.count) && raw.count >= 0) return raw;
  } catch { /* corrupted → treat as fresh day */ }
  return { date: dayStr(now), count: 0 };
}

export function questionsUsedToday(now = new Date()) {
  return read(now).count;
}

export function questionsRemainingToday(now = new Date()) {
  return Math.max(0, DAILY_QUESTION_LIMIT - read(now).count);
}

export function dailyLimitReached(now = new Date()) {
  return read(now).count >= DAILY_QUESTION_LIMIT;
}

/** Record one successful conversation turn. Returns the new count. */
export function recordQuestionSent(now = new Date()) {
  const cur = read(now);
  const next = { date: cur.date, count: cur.count + 1 };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* quota — non-fatal */ }
  return next.count;
}
