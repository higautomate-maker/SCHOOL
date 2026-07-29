# Hig School QA handoff

## Automated verification

The release was checked with:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

All 29 automated tests pass. They include durable SQLite reload, teacher-to-parent attendance notifications, teacher-to-student attendance synchronization, Company-to-School module policy synchronization, Parent request permissions, Student read-only protection, tenant isolation, school onboarding, role permissions, payments, cross-module workflows, sample-data completeness, and PDF asset report generation.

The seeded demo includes 9 students, 9 current attendance entries, 6 fee invoices, 5 payments, and 20+ records across academics and school operations.

## Functional acceptance paths

1. Company login → Modules → toggle a Northfield module.
2. School login → confirm the disabled module is removed from the sidebar.
3. Staff login → Attendance → mark Aarav present, late, or absent.
4. Student or Parent login → Attendance → confirm the new status.
5. Staff login → Homework → publish an assignment.
6. Student or Parent login → Homework → confirm the assignment appears.
7. Driver login → update location or trip status.
8. Student or Parent login → Transport → confirm the new trip data.

Every mobile launcher tile uses the same tested open-screen handler: 13 Student/Parent modules and 16 Staff/Admin modules. Header controls, four bottom-navigation destinations, record disclosure arrows, attendance status buttons, homework publishing, leave/payroll actions, and Driver live-location/trip/SOS controls all have explicit handlers.

## Scope note

The connected demo store is persisted in a Docker-mounted SQLite database and survives restarts. Before real-school onboarding, complete the normalized production database, managed identity/MFA, external push providers, backups, mobile push credentials, and Android/iOS signing.
