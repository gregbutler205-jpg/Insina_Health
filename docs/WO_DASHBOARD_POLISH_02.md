# WO_DASHBOARD_POLISH_02: post-deploy shell and print polish

**Source.** Greg's six items in chat after the v1.61.0 deploy (2026-09-07), plus
his answers to four questions in the same conversation. This document is the
spec of record; DECISIONS.md carries the reasoning.

**Authorized by:** DEC-058 (icon rail), DEC-059 (shared top bar), DEC-060
(Reports profile print and preflight gate), DEC-061 (print consistency),
DEC-062 (Reference disclaimers). DEC-058 and DEC-059 amend DEC-056; DEC-060
amends DEC-057.

**Branch:** `feat/dashboard-polish-02`. **Version:** v1.62.0. **Review tier:**
STANDARD (screenshots of the rail, the flyout, a standalone screen with the
shared top bar, one printout on the shared shell, and the Reference screen).

## Items (Greg's wording, then the build note)

1. "On the logo in the top left corner, use just the shield when the menu is
   collapsed rather than just the name." The rail shows `public/shield_logo.png`
   (the favicon art) at 48px. The expanded sidebar keeps the lockup.
2. "On Reports button, go straight to print on the Patient Profile rather than
   opening it." Answer chosen: print with all cards, no picker. The profile
   printout moves to `src/lib/printProfile.js` (built from the stores, not the
   mounted screen) so Reports can print it without opening Health profile. The
   Health profile screen keeps its card picker and calls the same builder. Every
   Reports print runs the RIE preflight check first (the Medication Report did
   not before).
3. "When the menu is collapsed, only show the Today and the My Health items. Use
   one icon for Records and one for Tools. Don't show all of those." Answer
   chosen: the group icon opens a flyout menu beside the rail listing that
   group's screens; the rail stays collapsed. Emergency Information stays pinned.
4. "On every screen I want a collapse button and a Home button. Home does not
   have to be on the Dashboard." Answer chosen: one shared top bar everywhere.
   `src/components/TopBar.jsx` is extracted from App.jsx and rendered by the
   four standalone screens (Medications, Labs, Vitals, Symptoms) and Insina AI
   in place of their own headers. Home appears on every screen except the
   dashboard. Screen-specific actions move to a slim screen bar under it.
5. "I want to make the print feature on Health Profile, Medications, Labs, more
   consistent on the Print button." Answer chosen: all three layers now.
   (A) one shared `PrintButton` (same icon, label, size, and position; a small
   menu where a screen has two reports); (B) one shared report shell
   (`src/lib/printShell.js`: logo, title, patient line, printed date, one
   table style, one footer) used by every printout except the Emergency Card,
   the consent record, and the AI session document, which keep their reviewed
   layouts; screens that printed themselves (Vitals, Documents, Notes,
   Conditions, Procedures, Diagnostics, Import) now print a report on the
   shell; (C) every print runs through `requestReport` (RIE preflight).
6. "On the Reference screen include a disclaimer ... May not include all unsafe
   OTC medicines, etc." Each Reference section opens with one line in that
   pattern, worded per section.

## Out of scope

Text size and theme (DEC-TBD-03/04), a bottom tab bar, roster role tags, and
any change to the Emergency Card layout or the AI prompts.
