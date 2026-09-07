// ── AI-09: deterministic post-generation output filter (AUDIT_SEC_02 F-03) ──
// The Clinical Safety Core (src/prompts/core.js) instructs the model never to
// give specific action guidance (dose changes, start/stop directives) — but
// that instruction lives entirely in the system prompt, with no deterministic
// backstop if the model ignores it, is jailbroken, or simply errs. This module
// is that backstop: a pure, regex-based scan run on AI text AFTER generation,
// before it is ever rendered — the same "deterministic, not the model" principle
// as the A-01 tripwire engine (DEC-002).
//
// The hard part is not detecting directive language — it's not flagging the
// SAFE reminder sentences the CSC explicitly wants the model to say, e.g.
// "Don't stop taking your medication without asking your doctor first." That
// sentence contains "stop taking" but is the opposite of a prohibited
// directive: it's a caution AGAINST unsupervised changes. A naive keyword
// match would censor exactly the sentence the safety rules are trying to
// produce. So this scans sentence-by-sentence and skips any sentence that
// also carries a nearby negation/caution marker (don't, without asking your
// doctor, before talking to your care team, etc.) — those are the guardrail
// sentences, not the violation.
//
// Deliberately NOT covered (documented limitation, not a gap pretending to be
// closed): third-person/past-tense record echoes ("Your care team increased
// your Tacrolimus to 5mg last visit") are facts about the record, not the AI
// giving an instruction — the patterns below target second-person imperative
// and first-person-recommendation phrasing specifically, which is what the
// CSC actually prohibits the model from originating.

/** Sentence markers that mean "this is a caution against acting without a
 * clinician, not an instruction to act" — skip flagging when one is nearby. */
const SAFE_GUARD_MARKERS = [
  /\bdo(?:n'?t|\s+not)\b/i,
  /\bnever\b/i,
  /\bshould(?:n'?t| not)\b/i,
  /\bwithout (?:asking|talking to|consulting|checking with|contacting)\b/i,
  /\bbefore (?:asking|talking to|consulting|checking with|contacting|changing|stopping|starting)\b/i,
  /\bonly (?:if|when|after) (?:your|a) (?:doctor|care team|coordinator|physician|provider)\b/i,
];

/** Directive shapes: second-person imperative or first-person recommendation,
 * naming an action a patient could take on a medication/dose right now. */
const DIRECTIVE_PATTERNS = [
  { label: "you-should-dose-action", re: /\byou should (?:now )?(increase|decrease|double|reduce|lower|raise|stop|discontinue|start|begin|skip|hold|take an? (?:extra|additional)|take \d)/i },
  { label: "i-recommend-you-dose-action", re: /\bi (?:recommend|suggest|advise) (?:that )?you (increase|decrease|double|reduce|lower|raise|stop|discontinue|start|begin|skip|hold)/i },
  { label: "imperative-dose-change", re: /(?:^|[.!?]\s+)(increase|decrease|double|reduce|lower|raise) your (?:daily |next )?(?:dose|dosage)\b/i },
  { label: "imperative-stop-start", re: /(?:^|[.!?]\s+)(stop|discontinue|start|begin|skip|hold) (?:taking )?your\b/i },
  { label: "you-need-to-dose-action", re: /\byou need to (increase|decrease|double|reduce|lower|raise|stop|discontinue|start|begin|skip|hold)/i },
];

/** Split into rough sentences, keeping the terminator so pattern anchors on
 * sentence-start (`^|[.!?]\s+`) still line up. Good enough for a deterministic
 * heuristic scan — not a full NLP sentence tokenizer.
 *
 * The separators are CAPTURED (kept in the returned array) so the scan can
 * reassemble the text with exactly the whitespace it arrived with. The old
 * separator-discarding split + join(" ") ate the newline after any
 * sentence-ending period, which flattened AI bullet lists into run-on
 * paragraphs everywhere the filter runs on a whole message — the report
 * overlay, its print, and saved transcripts — while the chat screen, which
 * filters line by line, kept its bullets. Detection is unchanged: the split
 * points are identical and redaction still replaces whole sentences. */
function splitSentences(text) {
  const parts = text.split(/((?<=[.!?])\s+)/);
  return parts.length ? parts : [text];
}

const REDACTION_NOTE =
  "[Insina Health removed a line here. It appeared to give a specific medication or dose instruction. " +
  "Insina explains and organizes your record; it does not tell you what to do. " +
  "Discuss any medication or dose change with your care team.]";

/**
 * Scan AI-generated text for prohibited directive language. Pure, synchronous,
 * deterministic — no AI/network involved (mirrors the tripwire engine's own
 * "client-side only" guarantee).
 * @param {string} text
 * @returns {{ flagged: boolean, redactedText: string, matches: Array<{label:string, sentence:string}> }}
 */
export function scanForProhibitedDirectives(text) {
  const input = String(text ?? "");
  if (!input) return { flagged: false, redactedText: input, matches: [] };

  const sentences = splitSentences(input);
  const matches = [];

  const out = sentences.map(sentence => {
    if (/^\s*$/.test(sentence)) return sentence; // captured separator — pass through untouched

    const isSafeGuard = SAFE_GUARD_MARKERS.some(re => re.test(sentence));
    if (isSafeGuard) return sentence; // caution/guardrail sentence — never flag

    const hit = DIRECTIVE_PATTERNS.find(p => p.re.test(sentence));
    if (!hit) return sentence;

    matches.push({ label: hit.label, sentence: sentence.trim() });
    return REDACTION_NOTE;
  });

  // join("") — the separators between sentences are already in `out`,
  // preserved verbatim by the capturing split above.
  return { flagged: matches.length > 0, redactedText: out.join(""), matches };
}
