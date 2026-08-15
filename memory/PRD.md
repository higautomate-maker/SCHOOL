# PRD — HIG School SaaS UX Redesign (Emergent)

## Original problem statement
Redesign & test an existing multi-tenant school-management SaaS (Next.js 16/TS web +
3 Flutter apps). Preserve architecture, modules, RBAC, tenant isolation, security.
Deliver in branch `emergent/saas-ux-redesign` (never touch `main`), with audit,
role-access matrix, UX changelog, test results, export instructions, handoff manifest.
Priority: professional, safe, consistent login experiences with user-safe error
messages; role dashboards; empty/loading/error states.

## Architecture (baseline, unchanged)
- Web: Next.js 16 + React 19 on vinext (Cloudflare Workers), Drizzle ORM (SQLite/Postgres).
- Auth: Argon2 + session cookies (web), bearer access/refresh (mobile); Redis rate limiting.
- Fail-closed authorization: Company policy → School role → user relationship.
  Source of truth: `server/access/catalogue.ts`, `server/auth/policies.ts`.
- Mobile: 3 Flutter apps sharing `mobile/packages/hig_mobile_core` (offline queue, FCM, driver GPS/SOS).

## Roles / personas
Company admin · School admin · Teacher/Staff · Parent · Student · Transporter/Driver.

## What's implemented (2026-06 — branch emergent/saas-ux-redesign)
- Web login (`app/login/`): safe HTTP-status→message mapping, pre-submit validation,
  password show/hide, "Need help signing in?" panel, accessible field errors, test IDs.
  New pure module `app/login/error-messages.ts`.
- Mobile login (shared `LoginView` + driver `DriverLogin`): `HigAuthMessages` +
  `higFriendlyAuthMessage` + validators; hide internal School ID UUID when preconfigured;
  autofill hints; sanitised session-restore errors.
- Exact wrong-credentials copy enforced everywhere; no leak of account existence/internals.
- Tests: `tests/emergent-login-error-states.test.ts` (9 pass).
- Docs: `docs/EMERGENT_{DESIGN_AUDIT,ROLE_ACCESS_MATRIX,UX_CHANGELOG,TEST_RESULTS,EXPORT_INSTRUCTIONS,HANDOFF_MANIFEST}.md`.

## Verification (Node 22.13)
- `npm run test:unit`: 352 pass / 0 fail / 14 todo (366).  New tests: 9/9.
- `tsc --noEmit`: 0 errors.  `eslint .`: 0 errors.  `npm run build`: success.
- NOT run here (need CI): Flutter analyze/build (3 apps), integration/staging/postgres suites, live screenshots.

## Backlog / next (P1/P2)
- P1: Run `flutter analyze` + debug APK builds for all 3 apps in CI; capture login screenshots.
- P1: Extend safe-message treatment to password reset & invitation-accept screens.
- P2: Role-dashboard "daily priorities" polish per role (web School workspace).
- P2: Company portal "Plans & billing" and platform-wide audit search (currently PLANNED/disabled).
- P2: Empty/loading/retry audit across remaining School web workspaces.

## Delivery
Branch `emergent/saas-ux-redesign`. `main` untouched (== origin/main 6a1e99d).
Publish via "Save to GitHub" → open PR into `main`. No secrets/env/migrations added.

## Update — 2026-06 (session 2: all four follow-up enhancements)
1. **Flutter CI**: `flutter analyze` clean on all 3 apps + `hig_mobile_core` (Flutter 3.47/Dart 3.13); `pub get` OK without dep upgrades (auto-refreshed lockfiles/analysis_options reverted). Debug APK build blocked by ARM64 host (x86_64 aapt2) + sandbox reset — documented as x86_64-CI requirement.
2. **Reset/invitation screens**: rebuilt `app/password/forgot`, `app/password/reset`, `app/invitation/accept` with shared `auth-flow.module.css`, safe enumeration-proof messaging, field + password-policy validation, show/hide. 5xx/429 on forgot now shows safe outage message (enumeration-safe).
3. **Role dashboards**: mobile role-priority hints + fail-closed empty state (`hig_mobile_ui.dart`); proposed backend-dependent enhancements documented in `docs/EMERGENT_ROLE_DASHBOARDS.md` (not half-built).
4. **Screenshots**: before/after review pack (desktop+mobile) in `docs/screenshots/` via `scripts/emergent-screenshots.mjs`, synthetic data only.

Verification: `test:unit` 356 pass / 0 fail / 14 todo (370); tsc 0; eslint 0; web build OK.
Testing agent (frontend): 9/9 auth-UX requirements PASS. Only finding = preview-infra WAF blocks %00 in Vite dev module URLs (hydration needs proxy on preview URL only; production build unaffected) — not a code defect.
Total: 10 commits on branch.
