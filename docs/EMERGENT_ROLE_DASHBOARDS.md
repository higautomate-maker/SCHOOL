# EMERGENT Role Dashboards — Prioritisation & Proposed Enhancements

This documents how each role's dashboard surfaces **daily priorities first**, using
only the **existing** fail-closed access model (Company policy → role permission →
relationship). Nothing here adds permissions, exposes hidden modules, or opens
direct API access to restricted data.

## How "daily priorities" are derived (implemented)

Mobile role dashboards (`mobile/packages/hig_mobile_core`) build a per-role,
priority-ordered list from the **already-authorized** feature set:

| Role | Daily priorities shown first (only if authorized) |
| --- | --- |
| Parent | Child overview · Attendance · Homework · Transport tracking · Fees · Timetable |
| Student | Timetable · Homework · Attendance · Examinations · Results · Study material |
| Teacher/Staff (`school`) | Attendance · Students · Academics · Lesson planner · Examinations · Communication |
| Driver (`transporter`) | Trip control · Assigned route · Pickup list · Boarding · GPS · SOS |

Rules that keep this safe (unchanged):
- A tile appears **only** if the feature resolves as `accessible` (policy enabled
  **and** dependency satisfied **and** relationship valid). Unauthorized tiles are
  never rendered and their APIs remain denied.
- If a role currently has **no** authorized actions, the dashboard now shows a
  friendly fail-closed empty state ("No actions available yet…") instead of a blank
  screen — added in this branch.

### Changes made in this branch (safe, presentation-only)
- Added per-role priority subtitles ("Your child's day at a glance", "What you need
  for today", "Your trip and safety controls").
- Added the fail-closed empty state above.
- Web School workspace and Company portal already lead with role-appropriate
  overview + quick actions; left unchanged to avoid risk in large existing files.

## Proposed enhancements (require backend work — NOT implemented here)

Per the brief, these are **proposed separately** rather than half-built. Each needs
a documented, tested, non-breaking API extension and would remain fail-closed.

1. **"Today" server summary endpoint** (`GET /api/v1/dashboard/summary`)
   Returns counts the user is already allowed to see (e.g. teacher: classes to mark
   today; parent: unpaid fee count; driver: next trip time). *Why backend:* avoids
   N client calls; must enforce the same authorization as the underlying modules.
   *Rollback:* additive endpoint, feature-flag off = current behaviour.

2. **Unread notices badge** on the dashboard entry for Communication.
   *Why backend:* needs a read-state per user; propose a non-destructive
   `notice_reads` table with a rollback migration.

3. **Driver "next stop ETA"** card using existing GPS/geofence data.
   *Why backend:* derive from current trip state already stored; expose via the
   existing transport read model only while a trip is active.

4. **Parent/Student "due soon"** (homework/fees) ordering.
   *Why backend:* sort by due date server-side within already-authorized records.

None of the above were implemented to avoid shipping incomplete or unauthorized
functionality. They can be scoped as follow-up PRs with tests and rollback plans.
