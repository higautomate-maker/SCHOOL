# EMERGENT API Additions & Permission Decisions

All additions are **read-only, backward-compatible, non-breaking extensions**.
No endpoint was changed or removed. No destructive migration and no external
service. Tenant + role + module/feature enforcement is unchanged and applied
server-side.

## 1. `GET /api/v1/mobile/today` (new, read-only)

Returns a small, role-aware "Today" summary of **counts only** for the
authenticated mobile principal.

- **Auth:** requires a valid mobile bearer principal (`authenticatedMobilePrincipal`).
  Returns `401 {"error":"Authentication required"}` otherwise. Errors are routed
  through `mobileAppErrorResponse` → safe generic message ("Today summary
  unavailable"); never leaks internals.
- **Response shape:**
  ```json
  { "today": {
      "role": "parent",
      "generatedAt": "2026-06-01T00:00:00.000Z",
      "items": [ { "key": "fees_due", "label": "Fees due", "count": 1, "hint": "Invoices with a balance" } ],
      "empty": false
  } }
  ```
- **Counts only:** each item is `{ key, label, count, hint }` — **no** names,
  amounts, records, or cross-role data. `count` is a sanitised non-negative
  integer.

### Permission / access decisions
- Access is resolved via `effectiveAccessForPrincipal(principal)` (the same
  fail-closed resolver used everywhere): `modules` (school) / `features`
  (parent/student/transporter).
- A tile is emitted **only** when its gating module/feature is authorized:
  - School/Teacher: `attendance` → attendance tile; `fees_finance` → fees tile;
    `communication` → unread-notices tile; etc.
  - Parent/Student: `attendance`, `fees_payments`/`fees_summary`,
    `examinations`/`results`, `notices`.
  - Transporter: `trip_control`, `boarding`, `emergency_alerts`.
  - Company (platform): only when `isPlatformAdmin` — schools/subscriptions/security counts.
- Underlying counts come from **already-authorized** aggregate loaders
  (`mobileOperationsSnapshot`, `mobileNotifications`), which are tenant- and
  relationship-scoped. Parents/students only ever count their own children's data.
- **No N+1:** each role path performs at most one additional aggregate load
  (operations OR driver snapshot) plus the existing notifications load. The
  builder (`server/mobile-app/today-summary.ts`) is pure and does no I/O.
- **Zero/empty states:** counts of 0 are returned as safe zero-state tiles;
  when a user has no authorized tiles, `empty: true` with an empty `items` array.

## 2. `mobileHomeSnapshot` additions (existing endpoint `GET /api/v1/mobile/home`)

Two **additive** fields (existing consumers ignore them; no contract break):
- `unreadNotices: number` — mirror of `notifications.unreadCount` for convenient
  badge rendering. **Count only.**
- `today: TodaySummary` — same object as `/api/v1/mobile/today`.

## 3. Unread-notices badge (client)

- Data source: the **existing** `NotificationInboxPage.unreadCount`, already
  computed server-side and scoped to the principal's tenant, audience and
  read-status (only `in_app` deliveries addressed to the user, not yet read).
- The client badge shows **only the number** (never notice content or sender),
  hides entirely at `0` (clean zero-state), and caps display at `99+`.
- No new storage: the read-status model (`notification read` route + inbox
  `read_at`) already exists; no migration was added.

## Tests
- `tests/emergent-today-summary.test.ts` — role coverage for Company, School,
  Teacher, Parent, Student, Transporter; fail-closed gating; counts-only shape;
  non-negative integers; safe empty/zero states (8 tests).
- Existing suites remain green (see `EMERGENT_TEST_RESULTS.md`).
