# HIGA Teacher — Google Play listing

This is the reviewed English (India) listing copy for application ID
`com.higautomation.higschool.staffadmin`.

## Store listing

- App name: `HIGA Teacher`
- Category: Education
- Support email: `info@higautomation.com`
- Privacy policy: `https://school.higaai.com/privacy`
- Short description: `Plan lessons, mark attendance and manage every school day with clarity.`
- Full description:

  `HIGA Teacher keeps day-to-day school work clear, fast and organised. Teachers can move between assigned classes and subjects, take daily or lesson attendance, publish homework, review schedules, and stay connected with school updates from one focused workspace.`

  `Designed for real school routines, the app gives teachers quick access to attendance, homework, timetable, notices and the modules enabled by their school. Class-teacher and subject-teacher responsibilities remain separate, so each teacher sees the work assigned to them.`

  `Key features:`

  `• Mark class or lesson attendance with fast bulk actions and exceptions`

  `• Switch between assigned classes, sections and subjects`

  `• Publish subject-wise homework to the school diary`

  `• Review timetable, notices and school updates`

  `• Keep selected work available through a secure, role-based account`

  `• Add or update an optional profile photo`

  `HIGA Teacher requires an account issued by a participating school. Available features depend on the school’s plan, enabled modules and the teacher’s assigned role.`

## Content declarations — source-reviewed draft

- Ads: no ads or advertising SDK.
- App access: all useful functionality requires a school-issued login. Supply a
  stable synthetic reviewer account and concise login instructions; never use a
  real teacher or pupil account.
- Target audience: adults aged 18 and over; the app is for teachers and school
  staff, not children.
- Government app: no.
- Health features: none.
- Financial features: none offered to the Teacher app user. School fee records
  are administrative school data, not a financial product.
- Category: Education.

## Data safety — source-reviewed draft

The final form must match the shipped bundle and current Google definitions.
The Teacher app sends data to the HIGA School service for app functionality and
account management. It does not sell data and does not include an advertising
SDK.

Declare collection, where the Play form requests it, for:

- name and email address used for the school account;
- optional profile photo chosen by the user;
- teacher-created school content such as attendance marks and homework;
- app/device identifier used for session security and push registration;
- Firebase Cloud Messaging application/device metadata required to deliver
  notifications.

Data is encrypted in transit. Account and data deletion requests are available
at `https://school.higaai.com/account-deletion`. Recheck Firebase Messaging and
all transitive SDK disclosures whenever dependencies or their configuration
change.

## Required media

- Play icon: 512 × 512 PNG, derived from the committed HIGA Teacher icon.
- Feature graphic: 1024 × 500 PNG, derived from the committed HIGA Teacher
  feature artwork.
- Phone screenshots: capture the released build on a clean synthetic reviewer
  account after the bundle is installed. Include Home, attendance, homework and
  timetable; do not use real school, teacher or pupil data.
