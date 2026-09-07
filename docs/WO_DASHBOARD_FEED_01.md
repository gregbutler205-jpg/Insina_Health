# WO_DASHBOARD_FEED_01: Dashboard restructure

Status: READY. DEC-051 through DEC-057 merged into DECISIONS.md on 2026-09-07 (accepted as written from `docs/DEC_DRAFT_USABILITY_2026-09-06.md`).
Authorized by: DEC-051 (structure), DEC-052 (feed), DEC-053 (acknowledge), DEC-054 (emergency strip), DEC-055 (roster), DEC-056 (navigation), DEC-057 (reports).
Reference mockup: `docs/mockups/insina_dashboard_feed.jsx` (filed there on 2026-09-06). The mockup is the visual target, not a spec; where it and this document differ, this document wins. Where this document is silent, follow the mockup.
Branch: `feat/dashboard-feed-01`
Deliverable: one PR, screenshots, and a short report (section 7).

## Review tier: STANDARD

Not light, not full. This work order changes how tripwire flags are displayed and adds an acknowledgment record event, so the review checks those two things and the screenshots. It does not require an inventory or a line-by-line TODO audit. Expected review time: 15 minutes.

Tier 1 halt (stop and report, do not proceed) applies to any step that would require changing tripwire engine output, authoring urgency text, altering the ingestion contract, or writing anything other than an acknowledgment to the patient record.
Tier 2 (proceed conservatively and log) applies to everything else.

---

## 1. Purpose

Replace the dashboard's status-wall layout with the feed structure approved in the DEC entries: greeting, conditional emergency strip, five quick actions, one "Your updates" column, three vitals, and a right rail with Who to call and Insina AI.

## 2. In scope

1. Em dash cleanup across all product copy (small, do it first).
2. Dashboard layout and components as specified in section 4.
3. Feed assembly from existing data sources.
4. Acknowledgment record event for tripwire flags.
5. Emergency strip hook.
6. Sidebar regrouping and avatar menu.
7. Top bar rearrangement.
8. Bell for passive events.

## 3. Out of scope

- Any change to the tripwire engine, its rules, tiers, or text.
- Any change to ingestion, the archive tier, or confirmation flows. The feed links to the existing review screens; it does not reimplement them.
- Light theme, text size control, Tier 0 mobile surface. Separate work orders.
- Reports content. The Reports tile and Tools entry route to the existing print outputs; if no single Reports screen exists, create a plain page that lists the four existing outputs as links and nothing else.
- Any other tab.

## 4. Specification

### 4.1 Em dash cleanup
Search all source, copy strings, and templates for the em dash character (U+2014) and the en dash (U+2013) used as a separator. Replace with a colon, comma, or period as the sentence requires. Do not touch imported clinical document content in the archive tier; that is patient data. Report the count.

### 4.2 Top bar
Left to right: menu toggle, Emergency (existing red button, unchanged behavior), search as icon-only with `aria-label="Search"`, date and time, text size placeholder (omit entirely; that control is a later work order), Import records (text button routing to the existing import screen), bell (4.8), Insina AI mark (existing, unchanged), avatar (4.7). Remove the sync pill and the "Last Updated" card; the timestamp moves to the greeting row (4.3).

### 4.3 Greeting row
Left: "Good morning, {first name}." in the existing display font, with a subtitle beneath: "{n} things need your attention." when n is greater than 0, else "Nothing needs your attention today." Right, same row, baseline aligned: a small green dot and "Last updated {time}" in the mono font, using the existing sync timestamp.

### 4.4 Emergency strip
Above the quick actions, rendered only when the tripwire engine's current output contains at least one emergency-tier flag. Full width, danger background tint, danger border. Content order is fixed and not authored here: the tripwire engine's emergency text is rendered verbatim, which by CSC v1.2 already leads with 911 and nearest ED. No dismiss control. If the engine does not currently expose tier on its output, Tier 1 halt and report; do not infer tier from text.

### 4.5 Quick actions
Five tiles in one row on desktop, three per row on narrow viewports. In order: Log vitals, Medications, Appointments, Symptoms, Reports. Each tile: colored icon square (colors from the mockup), text label, 96px minimum height, 44px minimum hit area. Badges: Medications shows the count of refills due within 7 days; Appointments shows the count of appointments within 14 days. Badge hidden when zero. Tiles route to existing screens.

### 4.6 Your updates column
One column, maximum width 720px, below the quick actions. Heading "Your updates" with an amber count badge showing the number of needs-attention items (kinds flag, review, result); badge hidden when zero.

**Sources and kinds.**
- `flag`: every advisory-tier tripwire flag currently active. Emergency-tier flags also appear here in addition to the strip.
- `review`: one card if the archive tier has any unconfirmed items, showing the count and, if available, how many are medications or allergies. Routes to the existing review screen.
- `result`: each lab result set (one card per collection date) that contains at least one out-of-range value. Routes to that result in Labs and trends.
- `appt`: each appointment within the next 14 days.
- `refill`: each medication whose refill is due within 7 days.

**Order.** flag, review, result, then appt and refill interleaved by date ascending. Within flag, preserve tripwire engine order.

**Display.** Five cards, then a "View all {n}" toggle. Cards of kind flag, review, and result use the amber tint and border; appt and refill use the plain card style. Each card: icon, title, date in mono, one line of body text, one primary action button. Body and title text for flags is the engine's text, verbatim, truncated only with an ellipsis if it exceeds two lines, with the full text on the flag's own screen.

**Actions per kind.** flag: the engine's action text if it provides one, else "View"; plus an Acknowledge button (4.9). review: "Review {n} items". result: "View results". appt: "Prepare for this visit" if a consultation prep output exists for that provider type, else "View". refill: "Mark as refilled" wired to the existing refill logging if present, else "View medication".

**Dismiss.** Every card except flag has an X (44px hit area, `aria-label="Dismiss"`). Dismissing hides the card for this record until the underlying item changes (new date, new result, count change). Store dismissals in the patient record under a `dashboardDismissals` key with the item's stable id and a timestamp. Dismissing never alters the underlying item.

**Empty state.** A single card with a green check and "Nothing new. Your record is up to date."

### 4.7 Vitals
Below the column: heading "Current vitals" and three cards, blood pressure, weight, temperature, each showing the latest value, unit, and date, using the existing out-of-range coloring. Beneath: a full-width ghost button "All vitals and trends" routing to Vitals. Remove the nine-card row.

### 4.8 Right rail
Fixed 300px on desktop; stacks below the column on narrow viewports.

**Who to call.** Heading, then up to four rows: role, name, phone number as a `tel:` link in the mono font with a phone icon, 44px hit area. Roster source: care team entries tagged with roles transplant coordinator, after-hours or on-call, and primary care. If the care team model has no role tags, Tier 2: use the first three care team entries that have a phone number, add a `TODO(roster)` comment, and report it. Beneath: ghost button "Full care team ({n})" routing to Care team.

**Insina AI.** The existing panel and preset questions, unchanged, except the panel subtitle becomes "Asks questions about your record. It never tells you what to do." if the current subtitle differs. All AI affordances remain behind the existing global flag.

### 4.9 Acknowledgment record event
Pressing Acknowledge on a flag card writes `{ flagId, acknowledgedAt, recordedBy }` to a `flagAcknowledgments` array in the patient record, where `recordedBy` is the current operator if the operator toggle exists, else "patient". The card is removed from the feed. The tripwire engine's own state is not modified; if the engine re-emits the same flagId on its next evaluation, the card reappears. If the engine does not expose a stable flagId, Tier 1 halt and report.

### 4.10 Bell
Icon button in the top bar with a count badge. Opens a dropdown listing passive events from the existing event or sync log: backups completed, vitals logged, result sets with all values in range, import completed. Newest first, last 20. If no such log exists, Tier 2: show backups and vitals logged only, from whatever timestamps are available, and report it.

### 4.11 Sidebar
Groups in order: Today (Dashboard, Appointments); My health (Labs and trends, Medications, Vitals, Symptoms, Health profile, Care team); Records (Conditions, Procedures, Diagnostics, Documents, Notes); Tools (Import records, Reports, Insina AI). Today and My health are fixed. Records and Tools have a chevron toggle; Records defaults collapsed, Tools defaults expanded; state persists in local settings. Emergency information stays pinned at the bottom with the existing danger styling. Remove Log out, Settings, and Data and Backup from the sidebar (4.12). The existing collapse-to-rail behavior, if present, keeps the wordmark visible; if none exists, add a toggle that collapses to a 96px icon rail with `title` on each icon.

### 4.12 Avatar menu
The avatar opens a menu: patient name and condition line, then Profile, Settings, Backup, Log out, each routing to the existing screen. Closes on outside click and on Escape.

## 5. Acceptance criteria

- Zero em dashes or separator en dashes in product copy; count reported.
- Dashboard renders all sections in 4.2 through 4.12 at 1280px and 390px; screenshots attached for both, plus one with the feed empty and one with a flag present.
- Flag cards show engine text verbatim and have no dismiss control.
- Acknowledge writes the record event and removes the card; verified by inspecting the stored record.
- Emergency strip renders when and only when an emergency-tier flag exists; verified with a fixture.
- Badges hide at zero.
- All eight AI session acceptance tests, scanner fixtures, and post-pass validation still pass.
- axe reports zero AA violations on the dashboard.
- No file outside the dashboard, sidebar, top bar, and copy strings is modified, except as needed for the two record keys in 4.6 and 4.9.

## 6. Fixtures

Add two dashboard fixtures for the screenshots and the axe run: one with no flags, no pending reviews, no out-of-range results; one with one advisory flag, one emergency flag, one pending review, one out-of-range result, three appointments, one refill. Use the demo persona, never real data.

## 7. Report

Short. Return to chat:
1. Em dash count replaced.
2. Any Tier 1 halt and why.
3. Any Tier 2 decision taken (roster fallback, bell fallback, anything else) in one line each.
4. Screenshot links.
5. One line confirming the acknowledgment record write was inspected.
