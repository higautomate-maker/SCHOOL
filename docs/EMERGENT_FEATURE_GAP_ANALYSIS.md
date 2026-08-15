# EMERGENT Feature Gap Analysis (vs. reference school apps)

Purpose: the user asked to check current "such models" (e.g. the
multi-school reference app in the brief and similar products) and identify what,
if anything, is **missing** from HIG School's modules — without inventing
incomplete functionality.

Method: mapped the reference teacher/parent/student mobile flows (home grid,
Communication, My Workspace, Digital Learning, My Leave with balance, Mark Entry,
My Attendance calendar) against HIG's existing module catalogue
(`server/access/catalogue.ts`) and mobile app feature catalogue.

## Already covered by existing modules/features (no gap)

| Reference capability | HIG module / feature |
| --- | --- |
| Attendance / My Attendance | `attendance` module; parent/student `attendance` feature |
| Homework / Lesson Planning | `academics`, `lesson_planner` |
| Mark Entry / Exams / Results | `examinations`, `assessment`, `cbc_academics`; student `results` |
| Circulars / School News / Notices | `communication` (+ mobile `notices`) |
| Calendar / Events | `communication` events; mobile `school_events` |
| Mailbox / messaging | notifications inbox (`/api/v1/mobile/notifications`) |
| My Leave / Leave balance | `front_office` (leave requests); parent `leave_requests` |
| Fees / Payments | `fees_finance`; parent/student `fees_*` |
| Hostel / Hostel attendance | `hostel` |
| Library | `library` |
| Digital Learning / E-Connect / Live classes | `live_classes`, `study_center` |
| Transport / GPS / Boarding / SOS | `transport`; driver `gps_tracking`, `boarding`, `emergency_alerts` |
| Certificates, Inventory, Assets, HR, PTM | `certificates`, `inventory`, `asset_management`, `human_resources`, `ptm_meetings` |

**Conclusion:** HIG's module coverage is broad and already matches or exceeds the
reference app's feature surface. The redesign therefore focused on
**discoverability, daily prioritisation, safe states and consistency**, not on
adding missing modules.

## Genuinely thin / candidate enhancements (proposed, NOT built)

These are surfaced as proposals with a rollback-safe path rather than half-built,
per the brief:

1. **Student "Birthday" / gallery quick-tiles** — reference apps show a birthdays
   feed and an image gallery on the home grid. HIG has `communication` events and
   media; a read-only "birthdays this week" tile could be derived from existing
   student DOB data (needs a scoped read endpoint; no new storage).
2. **"Remarks / Syllabus" quick access** — exist within academics; could be
   promoted as first-class home tiles.
3. **Punch-in/out staff attendance** — reference shows geofenced staff punch;
   HIG has `attendance` for students/staff but a dedicated staff self-attendance
   punch would need a new endpoint + device-time safeguards (propose separately).

## What WAS delivered in this round (safe, on existing data)
- **Today summary** (role-aware daily priorities, counts only) — see
  `EMERGENT_API_ADDITIONS.md`.
- **Unread-notices badge** (count only, existing read-status model).
- **Brand-consistent responsive** login/reset/invitation (two-panel wide, single
  card mobile) with unchanged safe auth behaviour.
- **Mobile Flutter CI** (analyze + tests + unsigned debug APKs) — see
  `.github/workflows/mobile-apk.yml`.

No permissions were added, no hidden module exposed, and no direct API access to
restricted data was created.
