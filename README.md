# Hig School

Hig School is the multi-tenant school operating system from HIG Automation India Private Limited. It includes separate Company and School portals, a synchronized demonstration API, a 13-module Student & Parent Flutter app, a 16-module Staff & Admin Flutter app, and a dedicated Driver GPS Flutter app.

The Hostinger demonstration uses persistent SQLite storage and role-targeted notifications. Teacher attendance/homework, school fee/notice updates and Driver GPS changes are retained and appear in the linked Student/Parent notification feed.

Start the demonstration at `/login`. Test accounts are documented in `DEMO_CREDENTIALS.md`; Hostinger VPS instructions are in `hostinger/HOSTINGER_DEPLOYMENT.md`.

## Connected product surfaces

- **Company Login** — onboard schools, manage subscriptions, and enable or disable modules per school from the dedicated Module Access workspace.
- **School Login** — complete ERP workspace whose navigation is filtered by the Company policy.
- **Student & Parent App** — 13 role-appropriate module screens with attendance, fees, academics, PTM, library and live transport data.
- **Staff & Admin App** — 16 working module screens, including writable attendance, homework, assessment, leave and payroll workflows.
- **Driver GPS App** — live trip, route students, trip history, profile and GPS status updates.

The browser mobile previews are included for immediate demonstration. Flutter source is included for Android and iOS; signed APK/AAB/IPA files must be produced with the customer’s signing identities.

Role menus are intentionally different:

- Students receive learning, attendance, timetable, assessment, syllabus, library, fees and transport self-service.
- Parents receive linked-child monitoring, published results, fees, notices, PTM, leave/callback requests, library and live transport.
- Teachers/Staff receive writable classroom attendance, marks, exams, lesson planning, homework, gradebook, student lists, logs, leave and payroll.

## Local development

Use Node.js 22.13 or newer. Copy `.env.example` to `.env.local`, install dependencies, and run `npm run dev`. The initial Sites deployment uses D1 through the logical `DB` binding declared in `.openai/hosting.json`.

## Verification

- `npm run lint`
- `npm run typecheck`
- `npm run test:unit`
- `npm run build`

Architecture and production completion gates are documented in `docs/ARCHITECTURE.md` and `docs/PHASE-1.md`.
