# EMERGENT Design & UX Audit — HIG School SaaS

_Baseline branch: `main` (read-only). Working branch: `emergent/saas-ux-redesign`._

This audit was produced **before** code changes. It records the architecture, the
role/journey model, and the concrete UX gaps addressed by this redesign. No
architecture, module, infrastructure, database data, or security control was
changed to produce it.

---

## 1. Architecture overview

| Area | Finding |
| --- | --- |
| Web framework | **Next.js 16 / React 19** running on the **vinext** (Cloudflare Workers–compatible) runtime, TypeScript throughout. |
| Data access | **Drizzle ORM** with a repository abstraction. Two backends: `sqlite` (local/demo) and **Postgres** (staging/production) selected via `server/runtime/repository-backend.ts`. |
| Auth (web) | Session-cookie based. `server/auth/service.ts` (`authenticatePassword`, `resolveSession`, `logout`), Argon2 password hashing (`@node-rs/argon2`), CSRF token cookie, same-origin assertion, privacy-hashed audit events. |
| Auth (mobile) | Bearer access/refresh tokens. `server/mobile-auth/*` with rotation, revocation and per-device sessions. |
| Rate limiting | `server/auth/rate-limit.ts` — Redis-backed with in-memory fallback (dev only); burst + long windows per IP / email / combined dimension. |
| Authorization | **Fail-closed**, layered: Company plan/override policy → School role permissions → user relationship/assignment. Central catalogue in `server/access/catalogue.ts`; route policies in `server/auth/policies.ts`; enforcement in `server/auth/authorization.ts`. |
| Tenancy / RLS | Tenant isolation in `server/tenancy.ts` and Postgres row-level security (Stage 13 docs). |
| Idempotency | `server/http/idempotency.ts`; all mutating client calls send `idempotency-key`. |
| Notifications | Queue/worker/inbox under `server/notifications/*`. |
| Payments | Razorpay provider (`server/payments/*`) — sandbox/credential-gated, not enabled by this redesign. |
| Mobile apps | Three Flutter apps sharing `mobile/packages/hig_mobile_core`: **student_parent_app**, **staff_admin_app**, **driver_gps_app**. Offline cache + queued writes, secure session storage, FCM push, driver background GPS + geofencing + SOS. |

### Web surfaces
- `/login` — single sign-in entry for Company and School web users (destination resolved by identity type after auth).
- `/company` — platform administration (schools, subscriptions, module & app access policy, tenant audit drawer).
- `/school`, `/school/[...slug]` — School ERP workspace, navigation filtered by Company policy + role permissions.
- `/mobile-preview/[role]` — browser preview of the mobile experiences.
- `/password/forgot`, `/password/reset`, `/invitation/accept` — credential lifecycle.

---

## 2. User journeys reviewed

1. **Company / platform** — sign in → school portfolio, subscriptions, per-school module & per-app feature policy, tenant audit visibility.
2. **School administrator** — sign in → school overview, students, staff (HR), attendance, finance/fees, notices/communication, transport, reports.
3. **Teacher / staff** (staff_admin_app + school web) — timetable, attendance (writable), students, homework/lesson planning, assessments, notices, PTM, leave/payroll.
4. **Parent** (student_parent_app) — linked children, attendance, homework, timetable, fees, notices, live transport tracking, requests (leave/PTM/contact).
5. **Student** (student_parent_app) — timetable, homework, attendance, results, notices, study material, live classes, transport.
6. **Transporter / driver** (driver_gps_app) — assigned vehicle/route, start/pause/resume/complete trip, live GPS state, geofence stop status, boarding/drop-off, SOS, offline recovery.

Each journey's authorized module/feature set is derived from the same catalogue,
so hiding a capability in the UI and blocking it in the API come from one source
of truth (see `EMERGENT_ROLE_ACCESS_MATRIX.md`).

---

## 3. Gaps identified (and addressed in this branch)

### 3.1 Login (highest priority — safety)
| Gap | Evidence (baseline) | Risk |
| --- | --- | --- |
| Raw server/error strings shown to users | Web `app/login/page.tsx` rendered `result.error` and `cause.message` directly; Flutter `LoginView`/`DriverLogin` rendered `exception.toString()`. | Leaks API internals, "Authentication service unavailable", timeouts, and raw exception text to end users. |
| Wrong-credentials copy not standardised | API returns `"Invalid email or password"`; UI showed it verbatim. | Not the required exact wording; inconsistent across surfaces. |
| No pre-submit field validation | Both web and mobile sent requests with empty/invalid fields. | Wasted requests, confusing errors, unnecessary rate-limit pressure. |
| Long internal UUID School ID always shown | Flutter login always rendered the `School ID` field even when the app was built for a specific school (`HIG_TENANT_ID`). | Exposes internal tenant UUID to drivers/parents; confusing. |
| Inconsistent "need help" guidance | Web had only a bare "Forgot password" link; no plain-language help. | Non-technical users get stuck. |

### 3.2 Cross-surface consistency
- Web and mobile used **different** error containers, tones and copy. No shared, user-safe message vocabulary existed.
- Password show/hide existed on mobile but **not** on web.

### 3.3 States
- Empty/loading/error states are generally good in the mobile core (`_HigEmptyCard`, offline banner) and Company portal, but login error states were unsafe and the web login lacked a retry-friendly message and help affordance.

> **Not changed by design:** every backend authorization check, tenant isolation,
> password hashing, rate limiting, session revocation, idempotency, GPS safeguards
> and audit logging remain exactly as on `main`. This redesign is presentation- and
> client-validation-only, plus documentation and tests.
