# Teacher mobile review — 7 September 2026

Device: 3ef17dc8. Installed preview: task-first navigation working tree based on 953691e. The subsequent Home photo fix is source-only, not installed.

## Evidence and limits

Opened the 13 visible More module entry points on the physical teacher phone. This is an entry-point review, not a claim that every nested action, permission variant, or complete business workflow passed.

| Module | Observed result | Remaining acceptance work |
| --- | --- | --- |
| Student Information | Opens a generic empty record list | Must show assigned students, useful search and student details |
| Attendance | Opens Grade 8 A with 30 students and today's date | Save is slow and needs visible progress; exception/date/lesson/device edge cases remain |
| Academics | One Monday timetable record | Verify record detail and provide a usable dated timetable |
| Lesson Planner | One generic record, title `percentage`, description `do` | Proper lesson-planning workflow and useful demo content |
| Study Center | Three subject study records | Verify detail, attachments and action outcomes |
| Examinations | Empty generic list, Add update | Exam-specific workflow not demonstrated |
| Assessment | Two records, Add update | Marks/assessment workflow not demonstrated |
| PTM Meetings | Two records named `ptm` | Scheduling and booking workflow not demonstrated |
| Communication | Three notices, Add update | Verify publishing, recipients, delivery and acknowledgement |
| Live Classes | Empty generic list, Add update | Joining/scheduling not demonstrated |
| Library | Empty generic list | Catalogue/loans not demonstrated |
| Diary | Date navigation, no homework for 7 September, Add homework | Verify teacher publication and parent read/completion end to end |
| Reports & Analytics | Twelve mixed generic records, including timetable, study content and notices | Does not demonstrate meaningful analytics or report generation/export |

With explicit user authorization, submitted all 30 demo Grade 8 A students as present for 7 September 2026. Reopened the register and confirmed `30 of 30 marked` with visible Present values. This changed staging attendance data. No real payment, deletion or transport-trip action was taken.

## Photo defect

Confirmed on the physical phone: the uploaded picture is visible in Profile, while Home displays GT initials.

Profile previously fetched and saved its own photo state. Home always rendered an initials avatar. The source change now publishes the loaded/saved/removed profile photo to HomeView and passes it into the Home avatar. Invalid image data falls back to initials. Shared-core and parent-app analysis passed; updated widget tests and physical verification are still required.

## Release decision

Do not call More fully functional merely because all module routes open. School feature entitlements and user permissions must remain server-enforced; permission controls are not a replacement for task-specific screens. Prioritize student information, save feedback, diary end-to-end delivery, and the photo fix before further visual decoration. Keep unfinished workflows distinguishable from verified ones without silently removing contracted school access.
