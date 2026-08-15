# EMERGENT Test Results — `emergent/saas-ux-redesign`

Environment used for verification: Node **22.13.0**, dependencies installed with
`npm install`. Commands are the repository's own scripts.

## Summary

| Check | Command | Result |
| --- | --- | --- |
| Unit tests (full) | `npm run test:unit` | **352 pass · 0 fail · 14 todo** (366 total) |
| New focused tests | `node --experimental-strip-types --test tests/emergent-login-error-states.test.ts` | **9 pass · 0 fail** |
| Type check | `npm run typecheck` (`tsc --noEmit`) | **0 errors** |
| Lint | `npm run lint` (`eslint .`) | **0 errors** |
| Web build | `npm run build` (vinext build) | **Build complete** — `/login` and all routes emitted |

> The pre-existing `tests/rendered-html.test.mjs` is a leftover starter-skeleton
> test (it asserts `title: "Starter Project"`), is **excluded** from the official
> `test:unit` glob (`tests/*.test.ts`), and fails on `main` independently of this
> work. It was not modified.

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
| Flutter analyze/build (3 apps) | Flutter SDK not installed here | `bash mobile/scripts/validate_flutter_apps.sh`; `flutter build apk` per app (see export instructions) |
| Integration/staging/postgres suites | Require Redis/Postgres/Docker services & secrets | `npm run test:integration:*`, `npm run staging:*` in provisioned CI |
| Live login screenshots | vinext runtime needs Workers/Wrangler + env validation | `npm run build && npm start` then load `/login` |

The Flutter changes are localised to login screens and a small shared helper and
were written to compile against the existing Material 3 theme and `HigMobileApi`
types; run `flutter analyze` in CI to confirm before release.
