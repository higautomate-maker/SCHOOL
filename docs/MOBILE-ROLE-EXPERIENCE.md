# Mobile role experience

Date: 2026-08-09

Status: **Interaction model defined and implemented; physical-device, usability
and accessibility acceptance remains in the final test stage.**

## Product direction

Hig School uses one calm, professional interaction language across the Parent,
Student, Teacher/Staff and Transporter applications. The visual direction takes
inspiration from common school-app patterns—large daily shortcuts, categorized
workspaces, clear schedules, status cards and persistent bottom navigation—
without copying third-party artwork, layouts or source code.

The home screen is not a catalogue. It answers three questions first:

1. Who am I acting as, and which child/class/route is in scope?
2. What is important today?
3. What can I do next with one tap?

The authorized actions are exposed on Home and the role-specific bottom tabs;
there is no duplicate More catalogue. Recently opened items are stored
on-device for convenience; they never grant access. Every destination still
comes from the server-issued effective-access response.

## Shared interaction rules

- Four stable destinations: Home, Diary, Notices and Profile for parents;
  Home, Attendance, Homework and Profile for teacher/staff users.
- Home gives priority to authorized daily actions and actionable counts,
  avoiding duplicate children/notices panels.
- The server remains authoritative for all visible modules and actions.
- No disabled or unlicensed feature is teased in the interface.
- Daily actions use plain verbs: Mark attendance, View timetable, Track bus,
  Pay fees, Send request, Start trip.
- Important actions use at least a 48 logical-pixel target.
- Color never carries status alone; every status also has text and an icon.
- Cached/offline content is visibly identified and queued writes are explained.
- Empty states explain what is missing and, where possible, what the user can do.
- Parent data is always scoped to linked children; transporter data is scoped to
  assigned vehicles, routes, trips and students.
- Navigation, headings and cards are designed for English now and leave room for
  longer translated labels and future RTL support.

## Parent daily flow

Home prioritizes linked children, unread school alerts and the highest-frequency
authorized actions: child overview, attendance, homework, timetable, fees and
transport tracking. A parent can switch mental context by selecting a child,
then open the relevant module. Requests for leave, PTM or school contact remain
explicit, auditable actions.

Current Android improvements: Today counts come from authorized records;
leave requests choose a linked child and explicit first/last days; the school
calendar groups authorized events, examinations and PTMs by date; Notices has
a searchable Sent requests view; fee history distinguishes confirmed ledger
payments from pending checkout. Home shows a linked child's active bus status
and only displays an ETA for a fresh online location. Older published clients
can still send their original undated leave request format during rollout.

Remaining work is explicit: the Sent requests view is not a two-way chat,
attachments need an approved school file-storage policy, and an official
downloadable fee receipt needs school invoice/receipt numbering and tax policy.
No UI may label a pending Razorpay checkout as a paid receipt.

## Student daily flow

Home prioritizes timetable, homework, attendance, examinations/results and
study material. Learning and administrative features are separated so the
student can reach the next class or assignment without scanning a long menu.

## Teacher and staff daily flow

Home prioritizes attendance, students, academics/timetable, lesson planning,
assessment/examinations and communication when those modules are authorized.
Management actions appear only when `canManage` is true. Staff with narrower
permissions see a smaller workspace, not inaccessible controls.

Attendance uses a dedicated classroom workflow rather than a generic record
form. The teacher chooses a class/section and calendar date, can mark the whole
class present in one tap, changes only absent/late/excused exceptions, sees
completion progress, and cannot save an incomplete register. Existing marks
for the selected date are restored for safe correction. Historical attendance
rows always show a human-readable date and class context.

## Transporter daily flow

The transporter app remains trip-first. The primary screen shows assignment,
trip state, next stop, student count and GPS state. Start/Pause/Resume Trip and
SOS remain persistent high-priority controls. Stops and students are one tap
away, and boarding/drop actions remain available only during an active trip.

## Final-stage acceptance

Final acceptance must include representative Teacher, Parent, Student and
Transporter accounts on small and large Android devices plus iPhone. Test:

- first-time sign-in, session restoration and recovery guidance;
- every entitled feature and the absence of every prohibited feature;
- every visible navigation target, module tile and record row opens the
  promised destination; disabled controls explain their prerequisite;
- one-handed navigation and common daily tasks;
- offline reads, queued writes and reconnection;
- dynamic text sizing, screen-reader labels, contrast and 48px targets;
- slow/failed API states and empty school data;
- parent multi-child scoping and transporter assignment scoping;
- push-notification deep-link behavior;
- Android/iOS trip background behavior and emergency actions.

The final stage should include observed task testing with at least one real
teacher, parent and transport operator. Completion means they can perform their
top three daily tasks without instruction, not merely that every screen opens.
