# EMERGENT Test Results — `emergent/saas-ux-redesign`

Environment used for verification: Node **22.13.0**, dependencies installed with
`npm install`. Commands are the repository's own scripts.

## Summary

| Check | Command | Result |
| --- | --- | --- |
| Unit tests (full) | `npm run test:unit` | **356 pass · 0 fail · 14 todo** (370 total) |
| New focused tests | `node --experimental-strip-types --test tests/emergent-login-error-states.test.ts` | **13 pass · 0 fail** |
| Type check | `npm run typecheck` (`tsc --noEmit`) | **0 errors** |
| Lint | `npm run lint` (`eslint .`) | **0 errors** |
| Web build | `npm run build` (vinext build) | **Build complete** — `/login`, `/password/forgot`, `/password/reset`, `/invitation/accept` all emitted |
| Flutter analyze (staff_admin_app) | `flutter analyze` | **No issues found** |
| Flutter analyze (student_parent_app) | `flutter analyze` | **No issues found** |
| Flutter analyze (driver_gps_app) | `flutter analyze` | **No issues found** |
| Flutter analyze (hig_mobile_core) | `flutter analyze` | **No issues found** |
| Login before/after screenshots | `scripts/emergent-screenshots.mjs` | Captured (synthetic data) — see `docs/screenshots/` |

Environment: web verified on Node **22.13.0**; Flutter verified on **3.47.0 /
Dart 3.13.0**. Flutter `pub get` succeeded for all three apps without upgrading
dependencies (auto-refreshed `pubspec.lock` / `analysis_options.yaml` were
reverted, since no build failure required them).

> The pre-existing `tests/rendered-html.test.mjs` is a leftover starter-skeleton
> test (asserts `title: "Starter Project"`), is **excluded** from the official
> `test:unit` glob (`tests/*.test.ts`), and fails on `main` independently. Not modified.

## New tests — `tests/emergent-login-error-states.test.ts`

Covers the redesigned login safety contract and fail-closed access:

1. Wrong credentials return the **exact** required copy; `400/404/422` share the
   same generic message (no account-existence leak).
2. Rate limit (`429`), outage (`503/5xx`) and rejected (`403`) map to distinct
   safe messages.
3. Network failures return a friendly retry message.
4. No login message contains technical terms (stack/trace/timeout/exception/sql/
   database/token/etc.).
5. Required fields validated before any request (empty + invalid-email cases).
6. School module access is fail-closed: needs Company-enabled **and** role permission.
7. A role missing the view permission cannot reach an enabled module.
8. App feature is inaccessible when its required school module is disabled.
9. App feature accessible only when policy **and** dependency are satisfied.

## Role / access boundary verification

Confirmed via new tests plus existing suites that remain green:
`tests/authorization-model.test.ts`, `tests/access-validation.test.ts`,
`tests/stage8-1-company-access.test.ts`, `tests/stage8-1-school-access.test.ts`,
`tests/stage8-1-access-policy.test.ts`, `tests/stage9-mobile-*` (mobile auth,
credential revocation, persona concurrency), `tests/tenancy.test.ts`.

- Company / School / Teacher / Parent / Student / Transporter authentication and
  access boundaries: covered by the above suites (all pass).
- Unauthorized screens/features hidden **and** direct API requests denied:
  enforced by the shared catalogue and re-asserted in new tests 6–9.

## Not runnable in this environment (must run in customer CI)

| Item | Reason | How to run |
| --- | --- | --- |
| Flutter **debug APK** (3 apps) | Host is ARM64 Linux; the Android build-tools `aapt2`/`d8` and a stable Android SDK are x86_64-oriented and the sandbox reset removed the SDK mid-build. `flutter analyze` passed for all apps, so the Dart/UI changes compile. | On an x86_64 CI runner with JDK 17 + Android SDK 35 + build-tools 34: `flutter build apk --debug --dart-define=API_BASE_URL=<host>` per app (see `EMERGENT_EXPORT_INSTRUCTIONS.md`). |
| Flutter unit/widget tests | Apps ship no `test/` directory (pre-existing). | Add widget tests in CI if desired; none exist to run today. |
| Integration/staging/postgres suites | Require Redis/Postgres/Docker services & secrets | `npm run test:integration:*`, `npm run staging:*` in provisioned CI |

The Flutter changes are localised to login screens, one shared helper, and the
role-dashboard section, and passed `flutter analyze` cleanly against the existing
Material 3 theme and `HigMobileApi` types.

## Login screenshots (review pack)

Before/after screenshots for login, forgot-password, reset-password and
invitation-accept (desktop + mobile) were captured locally with synthetic data.
See `docs/screenshots/README.md` and the `docs/screenshots/before` /
`docs/screenshots/after` folders. No real names, emails, tenant IDs, passwords,
tokens, API URLs or production data appear in any image.
