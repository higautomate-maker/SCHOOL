# Mobile map, checkout and graphic implementation

> Historical implementation notes. See [current release and test checklist](MOBILE-CANDIDATE-20260907.md) for current validation. The combined candidate also adds migrations 0015–0017 for assignments, lesson attendance, diary and profile photos; the “no migration” statement below applies only to map/checkout changes.

## Changes

- Shared home welcome uses original generated school artwork and forest-green styling. Existing HIG identity and role access are preserved. Asset: `mobile/packages/hig_mobile_core/assets/school-campus.png`.
- Parent transport renders the existing authorized location and child stop on a Flutter map. Invalid coordinates are rejected. Cached/offline, invalid/future or older-than-120-second locations cannot show an ETA. Foreground polling is bounded to one request; background polling pauses. The backend now suppresses delayed ETA too.
- Parent invoice cards open Razorpay Checkout with server amounts and explicit surcharge confirmation. No payment enters the offline queue. Retry key, order and callback proof persist in secure storage. Checkout success remains awaiting capture, not paid. Balance confirmation uses an uncached server read.
- Added authorized mobile payment status endpoint. Retries reuse the same order only after server/provider status allows them. Pending orders are reused across new sessions, and another guardian's pending order blocks a new attempt. Invoice locking serializes order creation. New payment initiation checks the enabled parent payment feature.

## Configuration and release gates

Debug maps use OSM standard tiles, with attribution, for bounded manual tests only. Production builds require `HIG_MAP_TILE_URL`, `HIG_MAP_ATTRIBUTION` and `HIG_MAP_ATTRIBUTION_URL` from an approved provider. Public client keys must be restricted; never put server secrets in these values. This does not provide street routing or traffic-aware ETA. Provider terms, privacy disclosure and map availability must be approved before release.

Live Razorpay keys are rejected unless `HIG_ENABLE_LIVE_PAYMENTS=true` is deliberately supplied. Do not enable this until sandbox payment/capture/webhook/retry tests pass. Server gateway configuration and the new status route must be deployed to staging before testing the retry flow. Existing order and verify routes are reused. No migration is added.

Remaining acceptance: real sandbox checkout, cancelled checkout retry, app restart during payment, lost callback, duplicate attempts across guardians, webhook lag and actual balance reconciliation; real two-device GPS/locked-screen road test; iOS build; production map provider. Payment receipts/refunds remain separate workflows; this change does not claim a downloadable certified receipt. No real payment or school data was changed during implementation.

## Image provenance

Generated with the built-in image-generation tool, inspected locally and copied into the app; no real school or student is depicted. Prompt: “Create one premium editorial illustration asset for HIG School mobile app. Landscape 3:2. An elegant modern school campus with a small golden yellow school bus and leafy trees, clean dimensional paper-cut architectural illustration, deep forest green and warm ivory with restrained lime highlights, sophisticated welcoming educational product design, no people, no words, no lettering, no logos, no watermark. Simple composition readable as a small mobile banner, generous clear sky space. This is an asset, not a UI screenshot.”

## Validation evidence

All three Android debug builds succeeded. Server typecheck and lint passed; full server unit suite: 398 total, 384 passed, 14 TODO, zero failures. Student/parent analysis passes. Shared Flutter analysis has no errors/warnings, but reports one pre-existing attendance BuildContext advisory. Flutter tests could not run: the installed macOS x64 engine aborts in `cpuinfo_macos.cc` before test loading. This is not a test pass; run these tests in Linux CI or a working Flutter test environment before merging. No physical-device acceptance or full UI redesign verification has been completed.
