# EMERGENT Source-Only Handoff Manifest

Branch: `emergent/saas-ux-redesign` (never merged into read-only `main`).

This manifest lists **exactly** the source files added or modified by the redesign.
A source-only archive must contain only these files. It must **NOT** include:

- `node_modules/`, `.dart_tool/`, Flutter/Gradle/Xcode build output, `build/`, `dist/`
- APK / AAB / IPA binaries
- `.env*` files, secrets, tokens, keys, Firebase config, production URLs
- caches (`.wrangler/`, `.next/`, `~/.pub-cache`), lockfile-regenerated artifacts
- the `.git/` internals or platform `.emergent/` runtime files
- any real or staging test data / credentials

## Added

| File | Purpose |
| --- | --- |
| `app/login/error-messages.ts` | Pure, dependency-free web login message + validation module. |
| `tests/emergent-login-error-states.test.ts` | Focused tests: login error states + fail-closed access. |
| `docs/EMERGENT_DESIGN_AUDIT.md` | Pre-change architecture & UX audit. |
| `docs/EMERGENT_ROLE_ACCESS_MATRIX.md` | Role → module/feature access matrix. |
| `docs/EMERGENT_UX_CHANGELOG.md` | What changed (presentation/validation only). |
| `docs/EMERGENT_TEST_RESULTS.md` | Test/lint/typecheck/build results. |
| `docs/EMERGENT_EXPORT_INSTRUCTIONS.md` | Export, apply, install, test, build, rollback. |
| `docs/EMERGENT_HANDOFF_MANIFEST.md` | This file. |
| `docs/EMERGENT_ROLE_DASHBOARDS.md` | Role dashboard prioritisation + proposed backend enhancements. |
| `scripts/emergent-screenshots.mjs` | Local, synthetic-data screenshot capture for the review pack. |
| `docs/screenshots/README.md` + `docs/screenshots/{before,after}/*.png` | Login before/after review pack (synthetic data only). |
| `docs/EMERGENT_API_ADDITIONS.md` | New API additions + permission decisions (Today summary, unread badge). |
| `docs/EMERGENT_FEATURE_GAP_ANALYSIS.md` | Feature coverage vs reference apps; proposed (not-built) enhancements. |
| `app/AuthBrandPanel.tsx` | Shared branded left panel for wide-screen auth flows. |
| `server/mobile-app/today-summary.ts` | Pure role-aware "Today" summary builder (counts only). |
| `app/api/v1/mobile/today/route.ts` | Read-only `GET /api/v1/mobile/today` endpoint. |
| `tests/emergent-today-summary.test.ts` | All-roles Today-summary fail-closed tests. |
| `.github/workflows/mobile-apk.yml` | PR CI: Flutter analyze + tests + unsigned debug APKs (x86_64). |
| `docs/screenshots/after-v2/*.png` | Two-panel responsive auth screens (brand consistency). |
| `server/mobile-app/birthdays.ts` | Privacy-safe "birthdays this week" helper (first name + weekday only). |
| `tests/emergent-birthdays.test.ts` | Birthday helper privacy/window tests. |
| `app/api/v1/schools/[schoolId]/today/route.ts` | Read-only web School "Today" endpoint (fail-closed, counts only). |
| `app/school/TodayPanel.tsx` + `app/school/today-panel.module.css` | School dashboard Today panel (loading/empty/error+retry). |
| `server/attendance/staff-punch-safeguards.ts` | PURE geofence + device-clock + ordering safeguards (Staff Punch). |
| `tests/emergent-staff-punch-safeguards.test.ts` | Staff punch safeguard tests (7). |
| `docs/proposals/STAFF_PUNCH.md` | Staff self-attendance punch proposal (migration up/down, endpoint, RLS, rollback). |

## Modified (round 2)

| File | Change |
| --- | --- |
| `app/auth-flow.module.css` | Responsive two-panel + brand panel styles. |
| `app/password/forgot/page.tsx`, `app/password/reset/page.tsx`, `app/invitation/accept/page.tsx` | Wrapped in responsive two-panel; forgot surfaces safe 5xx/429. |
| `server/mobile-app/service.ts` | `mobileTodaySummary()`; additive `today` + `unreadNotices` on home snapshot. |
| `mobile/packages/hig_mobile_core/lib/src/hig_mobile_ui.dart` | Unread badge on bell; Today summary strip + tiles. |

## Modified (round 3)

| File | Change |
| --- | --- |
| `mobile/packages/hig_mobile_core/lib/src/hig_mobile_ui.dart` | Birthdays card added alongside the Today strip + unread badge. |
| `server/mobile-app/service.ts` | Additive `birthdays` on home snapshot (parent/student, authorized records only). |
| `app/school/page.tsx` | Injected `<SchoolTodayPanel/>` into the School dashboard (one line + import). |

## Modified

| File | Change |
| --- | --- |
| `app/login/page.tsx` | Safe error mapping, field validation, password show/hide, help panel, test IDs. |
| `app/login/login.module.css` | Styles for password toggle, field errors, help panel. |
| `mobile/packages/hig_mobile_core/lib/src/hig_mobile_ui.dart` | Shared `HigAuthMessages` + `higFriendlyAuthMessage` + validators. |
| `mobile/packages/hig_mobile_core/lib/hig_mobile_core.dart` | `LoginView`: safe errors, field validation, hide School ID when preconfigured, autofill; sanitised session-restore error. |
| `mobile/driver_gps_app/lib/main.dart` | `DriverLogin`: same safe login treatment + "Need help signing in?"; sanitised restore error. |

## Producing the archive (source-only)

```bash
git checkout emergent/saas-ux-redesign
git archive --format=tar.gz -o emergent-saas-ux-redesign-src.tgz HEAD -- \
  app/login/error-messages.ts \
  app/login/page.tsx \
  app/login/login.module.css \
  mobile/packages/hig_mobile_core/lib/src/hig_mobile_ui.dart \
  mobile/packages/hig_mobile_core/lib/hig_mobile_core.dart \
  mobile/driver_gps_app/lib/main.dart \
  tests/emergent-login-error-states.test.ts \
  docs/EMERGENT_DESIGN_AUDIT.md \
  docs/EMERGENT_ROLE_ACCESS_MATRIX.md \
  docs/EMERGENT_UX_CHANGELOG.md \
  docs/EMERGENT_TEST_RESULTS.md \
  docs/EMERGENT_EXPORT_INSTRUCTIONS.md \
  docs/EMERGENT_HANDOFF_MANIFEST.md
```

`git archive` reads only committed tree contents, so it inherently excludes
`node_modules`, build output, secrets and caches. Verify with:

```bash
tar -tzf emergent-saas-ux-redesign-src.tgz
```
