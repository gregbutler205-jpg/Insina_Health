# Draft DEC entries: usability and dashboard restructure

Session date: September 5 and 6, 2026
Status: DRAFT. IDs are TBD until merged into DECISIONS.md. Nothing below is settled until merged.
Update 2026-09-06: DEC-TBD-01 and DEC-TBD-02 were accepted by Greg as written and merged into DECISIONS.md as DEC-049 and DEC-050. Update 2026-09-07: DEC-TBD-05 through DEC-TBD-11 were accepted by Greg as written and merged as DEC-051 through DEC-057. DEC-TBD-03 (theme policy), DEC-TBD-04 (text size control), DEC-TBD-12 (usability testing gate), and the deferred list are still drafts.
Source: usability review and dashboard redesign session; mockups `insina_tier0_today.jsx` and `insina_dashboard_feed.jsx`.

Ordering note: DEC-TBD-01 through DEC-TBD-03 are prerequisites for the others and for WO_ACCESSIBLE_TOKENS_01. DEC-TBD-04 onward describe the dashboard and can merge together.

---

## DEC-TBD-01: Accessibility baseline is a hard rule

Merged as DEC-049 on 2026-09-06, accepted as written.

**Decision.** All patient-facing surfaces meet WCAG 2.2 AA. This rule has the same weight as the em dash rule and the disclosure accuracy rule: a surface that fails it does not ship.

**Specifics.**
- Text contrast 4.5:1 minimum against its actual background; 3:1 for large text (24px regular or 19px bold and above) and for UI component boundaries.
- Body text floor 14px on mobile, 13px on desktop. Labels and figures floor 12px. No text below 12px anywhere.
- Every interactive element is at least 44 by 44 CSS pixels.
- Every interactive element has a visible focus state.
- Icons never carry meaning alone; every icon in navigation or actions has a text label or an accessible name.
- Color never carries meaning alone; a flag state has a shape or word as well as a color.

**Enforcement.** Automated check (axe or equivalent) in the build; a failing AA check blocks the PR. Manual contrast audit on any new token.

**Rationale.** The target population skews older, rural, on phones, with hepatic encephalopathy, tacrolimus tremor, and eye disease in the risk profile. The prior token set had section labels at 1.5:1 and meta text at 2.1:1.

---

## DEC-TBD-02: Accessible token amendment to the locked design system

Merged as DEC-050 on 2026-09-06, accepted as written. DEC-050 carries an implementation note on where the code's actual token values differ from the Old column.

**Decision.** The design system remains locked (DM Serif Display, Sora, DM Mono, dark navy, accent blue). The following text tokens are amended. Measured against `--bg-card` #0b1220.

| Token | Old | Ratio | New | Ratio |
|---|---|---|---|---|
| text-faint | #1e3550 | 1.5 | #7a97b6 | 6.2 |
| text-ghost | #2d4d6a | 2.1 | #8aa6c2 | 7.4 |
| text-dim | #3d5a7a | 2.6 | #8fabc7 | 7.9 |
| accent-blue (text use) | #4f8ef7 | 5.8 | #6ea3ff | 7.4 |
| danger (text use) | #ef4444 | 5.0 | #f87171 | 6.8 |
| success (text use) | #10b981 | 7.4 | #2dd4a0 | 9.8 |
| border | #0d1a28 / #111e30 | under 1.5 | #1c2a40 | 3.1 vs card |

text-primary, text-secondary, text-muted, warning, and the background tokens are unchanged. The old accent #4F8EF7 remains the brand accent for logos, marks, and external materials; the amended value is for text and interactive states inside the app.

**Rationale.** Keeps hue family and brand recognition; clears AA with margin so future tints do not fall back under.

---

## DEC-TBD-03: Theme policy

**Decision.** Dark navy remains the brand for external materials and the default in the app. A light theme is a first-class surface with its own AA-verified token set, and the app follows the device setting by default. Patients can override in Settings.

**Rationale.** Dark mode reads as premium to reviewers and as unreadable to some patients with dry eyes or cataracts. Both must work.

---

## DEC-TBD-04: Text size control

**Decision.** A patient-facing text size control with three steps (smaller, normal, larger; 88, 100, 118 percent). Normal is the default and is the AA-verified size. Smaller is opt-in and may drop below the AA floor; it is never the default and never set by the app. The setting persists in the patient's record.

**Rationale.** Requested by the founder-user; accepted as opt-in so the accessibility floor is not weakened for anyone who has not chosen it.

---

## DEC-TBD-05: Dashboard structure

Merged as DEC-051 on 2026-09-07, accepted as written.

**Decision.** The dashboard follows a feed structure rather than a status snapshot. Top to bottom:
1. Greeting, with an attention count on the left and "Last updated" on the right.
2. Emergency strip (conditional, see DEC-TBD-08).
3. Five quick action tiles: Log vitals, Medications (refill count badge), Appointments (count badge, next 14 days), Symptoms, Reports.
4. One column, "Your updates" (DEC-TBD-06), capped at 720px wide.
5. Current vitals: blood pressure, weight, temperature only, with a link to all vitals and trends.
6. Right rail: Who to call (DEC-TBD-09), Insina AI panel with preset questions.

Removed from the dashboard: the nine-card vitals row, the full care team, lab flags with no attached action, the Emergency card tile (reachable via the top-bar Emergency button, the sidebar, and Reports).

**Rationale.** MyChart's home page pattern: things that happened or need a response, each with one button. Reduces the page from roughly 40 competing elements to under 20.

---

## DEC-TBD-06: Feed eligibility and ordering

Merged as DEC-052 on 2026-09-07, accepted as written.

**Decision.** "Your updates" contains only:
- Tripwire flags (advisory tier; emergency tier also triggers DEC-TBD-08).
- Imports waiting for review in the archive tier.
- Results with at least one out-of-range value.
- Appointments and refills with a date within the display window.

It does not contain passive events (backups, in-range results, vitals logged); those go to the bell (DEC-TBD-07).

Ordering is fixed: flags, then pending reviews, then out-of-range results, then dated items by date. Five items show, then "View all." Needs-attention items are visually distinct (amber) and the header badge counts only those.

**Rationale.** A flag must never sit visually equal to "backed up to Google Drive." One rule, applied everywhere, is easier to test with patients than three columns.

---

## DEC-TBD-07: Acknowledge versus dismiss

Merged as DEC-053 on 2026-09-07, accepted as written.

**Decision.**
- Tripwire flags cannot be dismissed. They offer one action and an Acknowledge button. Acknowledging records the timestamp in the patient's record and removes the card from the feed. The underlying condition is re-evaluated by the tripwire engine on its own schedule and may re-flag.
- Pending reviews and out-of-range results can be dismissed from the feed; the underlying item remains in its tab unchanged. Dismissing is not confirming.
- Dated items can be dismissed from the feed; the appointment or refill itself is unaffected.
- Passive events live behind a bell icon with a count and never appear in the feed.

**Rationale.** Deterministic layer owns urgency. Dismissal is a display preference; acknowledgment is a record event.

---

## DEC-TBD-08: Emergency tier escalation on the dashboard

Merged as DEC-054 on 2026-09-07, accepted as written.

**Decision.** When the tripwire engine emits an emergency-tier flag, a red strip renders above the quick actions on every dashboard load, leading unconditionally with 911 and nearest ED, with the flag text below. The strip cannot be dismissed; it clears only when the engine clears the condition or the patient acknowledges from within the flag itself. This is the only element that appears outside the feed column.

**Open item.** Exact strip copy is authored by the tripwire spec, not the dashboard. Mockup does not include an example on purpose.

---

## DEC-TBD-09: Who to call roster

Merged as DEC-055 on 2026-09-07, accepted as written.

**Decision.** The dashboard shows a "Who to call" card with three to four entries, each a role, a name, and a tap-to-call number. Default roster for a transplant recipient: transplant coordinator, after-hours transplant line, primary care. The patient edits the roster from Care team. The full directory is not on the dashboard. Tripwire advisory actions may reference a roster entry by role.

**Rationale.** A 19-provider directory is reference material; a three-line card is a tool.

---

## DEC-TBD-10: Navigation structure

Merged as DEC-056 on 2026-09-07, accepted as written.

**Decision.** Sidebar has four groups. Today (Dashboard, Appointments) and My health (Labs and trends, Medications, Vitals, Symptoms, Health profile, Care team) are always expanded. Records (Conditions, Procedures, Diagnostics, Documents, Notes) and Tools (Import records, Reports, Insina AI) are collapsible; Records defaults closed, Tools defaults open; state persists. Emergency information is pinned at the bottom of the sidebar. The sidebar collapses to a 96px icon rail with the Insina Health wordmark visible; on narrow viewports it is replaced by a bottom tab bar. Profile, Settings, Backup, and Log out live in the avatar menu.

Top bar, left to right: menu toggle, Emergency, search (icon), date and time, text size (icon), Import records, bell, Insina AI, avatar. No sync indicator in the top bar.

---

## DEC-TBD-11: Reports is the print center

Merged as DEC-057 on 2026-09-07, accepted as written.

**Decision.** All printable outputs (ED Prep Packet, Consultation Prep, Medication Report, Patient Profile) are reached through one Reports destination, present as a quick action tile and under Tools. This resolves the ED Prep Packet no-print-path issue from the clinical review packet.

---

## DEC-TBD-12: Usability testing as a release gate

**Decision.** No major patient-facing release ships without a usability round: at least five patients and two caregivers recruited through MSLA, demo persona data only, think-aloud, three fixed tasks (find last tacrolimus level and say whether it is in range; log a blood pressure; say what is due this week), SUS at the end. Exit target: 80 percent task success, SUS 70 or above. Founder-user results are excluded from scoring. Protocol in `INSINA_USABILITY_REMEDIATION_PLAN.md` section 6.

---

## Deferred (need their own DEC before design)

- Operator model: patient-primary, caregiver-primary, handoff. Identity and consent under non-custodial storage need a counsel check. Blocks the Tier 0 Today surface and caregiver onboarding.
- Complexity tiers (Today / Core / Full record) and Tier 0 as default landing surface.
- Display of unconfirmed archive-tier items on the dashboard.
- Ingestion strategy: FHIR patient access via Fasten as primary, PDF and manual as fallback.
- PWA sunset criteria.
- PHI-free, opt-in, client-side usage metrics.
