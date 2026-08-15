# EMERGENT UX Changelog — `emergent/saas-ux-redesign`

All changes are **presentation / client-validation / documentation / tests only**.
No API contract, authorization rule, tenant isolation, hashing, rate limiting,
session handling, idempotency, GPS safeguard, audit control, schema or database
data was changed. No secrets or env files were added.

## Login experience (web + all mobile apps)

### New — safe, shared error vocabulary
- **Web:** `app/login/error-messages.ts` (new) — pure, dependency-free module
  mapping HTTP status / network failure to user-safe copy, plus pre-submit field
  validation.
- **Mobile:** `HigAuthMessages`, `higFriendlyAuthMessage`, `higValidateEmail`,
  `higValidatePassword` added to `mobile/packages/hig_mobile_core/lib/src/hig_mobile_ui.dart`
  and shared by every app.

### Behaviour now guaranteed on every login surface
- Wrong credentials show **exactly**:
  `Incorrect email or password. Please check your details and try again.`
- `400 / 401 / 403 / 404 / 422` all map to that same generic message → **never
  reveals whether an email exists** and never leaks validation internals.
- `429` → "Too many sign-in attempts. Please wait a moment, then try again."
- `503 / 5xx` → "Sign-in is temporarily unavailable. Please try again in a few minutes."
- Network/timeout failures → "We couldn't connect. Please check your internet
  connection and try again."
- **No** stack traces, exceptions, timeouts, API/DB internals, or raw server
  strings can reach the user on any surface.
- Required fields are validated **before** any request is sent.

### Web login (`app/login/page.tsx`, `app/login/login.module.css`)
- Added password **show/hide** toggle (`data-testid="login-password-toggle"`).
- Inline, accessible field errors (`aria-invalid`, `aria-describedby`).
- Status→message mapping and a friendly network retry message.
- Added a **"Need help signing in?"** expandable panel with plain-language steps
  and a password-reset link.
- Kept `autocomplete="username"/"current-password"` for autofill.
- Added `data-testid` hooks across the form for reliable QA automation.

### Mobile login (shared `LoginView` + `driver_gps_app` `DriverLogin`)
- Errors now routed through `higFriendlyAuthMessage` (was `exception.toString()`).
- **School ID field is hidden entirely when the app is preconfigured for a school**
  (`HIG_TENANT_ID` set at build time) — the long internal tenant UUID is no longer
  shown. It appears only when a School ID must actually be entered.
- Inline `errorText` for School ID / email / password with pre-submit validation.
- Added `autofillHints` (username/email/password).
- Driver login gained a consistent **"Need help signing in?"** dialog and the same
  safe error card used by the student/parent/staff apps.
- Session-restore failures are also sanitised (`_restore` / `restore`).

## Documentation added (`docs/`)
- `EMERGENT_DESIGN_AUDIT.md`, `EMERGENT_ROLE_ACCESS_MATRIX.md`,
  `EMERGENT_UX_CHANGELOG.md`, `EMERGENT_TEST_RESULTS.md`,
  `EMERGENT_EXPORT_INSTRUCTIONS.md`, `EMERGENT_HANDOFF_MANIFEST.md`.

## Tests added
- `tests/emergent-login-error-states.test.ts` — 9 tests covering exact
  wrong-credentials copy, no-leak guarantees, network/rate-limit/outage mapping,
  pre-submit validation, and fail-closed module/app-feature access.

## Round 2 additions (same branch)

### Brand consistency (responsive login/reset/invitation)
- New `app/AuthBrandPanel.tsx` + responsive `app/auth-flow.module.css`: **two-panel
  branded layout on wide screens** (parity with `/login`) that **collapses to a
  compact single card on mobile**, for `/password/forgot`, `/password/reset`,
  `/invitation/accept`. Same colours, logo, typography, safe errors and
  accessibility. **Authentication behaviour and safe messages unchanged.**

### Today summary (read-only, role-aware, counts only)
- New pure builder `server/mobile-app/today-summary.ts` + `mobileTodaySummary()`
  in `server/mobile-app/service.ts`; new endpoint `GET /api/v1/mobile/today`;
  additive `today` + `unreadNotices` fields on `mobileHomeSnapshot`.
- Fail-closed: tiles appear only for authorized modules/features; counts only; safe
  zero/empty states; no N+1; no migration/external service. See
  `EMERGENT_API_ADDITIONS.md`.

### Unread-notices badge (mobile)
- `hig_mobile_ui.dart`: notification bell now shows a **count-only** badge from the
  existing `unreadCount` (hidden at 0, capped `99+`); a "Today" summary strip with
  count tiles + caught-up empty state was added to the role dashboard.

### Mobile Flutter CI
- `.github/workflows/mobile-apk.yml`: PR job (Linux x86_64) running analyze +
  tests + **unsigned** debug APK builds for all three apps, with pub/Gradle
  caching, artifacts retained 5 days. **No signing keys, secrets or publishing.**

## Explicitly NOT done (by constraint)
- No changes to `server/**` authorization, tenancy, crypto, rate limiting, mobile
  auth tokens, payments, or migrations.
- No new `.env`, secrets, Firebase config, production URLs, or seed data.
- No destructive migration. Any future schema change must be proposed separately
  with a rollback plan.
- Fonts, colours and layout tokens of the existing design system were preserved to
  keep the product consistent; only the login surfaces were restyled within those
  tokens.
