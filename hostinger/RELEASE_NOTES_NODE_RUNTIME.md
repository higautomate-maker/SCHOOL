# Hostinger Node runtime correction

Release date: 29 July 2026

## Corrected

- Removed direct `cloudflare:workers` imports from every shared application repository.
- Added a persistence contract with isolated Cloudflare D1 and Node SQLite implementations.
- Added a build-time runtime alias so the Hostinger server graph can only reach Node SQLite.
- Disabled Cloudflare Vite plugin loading for the Hostinger build.
- Added checked-in SQLite migration execution and persistent `/data` storage.
- Added Docker health checking.
- Added a production-bundle scan that rejects `cloudflare:` references.
- Added a Docker acceptance test for image build, healthy status, health HTTP 200, login rendering, mutation, restart, and persistence.
- Hardened the acceptance test against Docker port-forwarding startup races by waiting for Docker health and then polling HTTP health for up to 90 seconds, with retryable connection/502/503 handling and automatic diagnostics.
- Replaced Docker Desktop's unreliable anonymous `127.0.0.1::3000` mapping with an explicitly selected free localhost port passed as `127.0.0.1:<port>:3000`.

## Verified in this workspace

- ESLint passed.
- TypeScript passed.
- 95 tests: 61 passed, 34 explicit future-stage TODOs, 0 failed.
- Secret scan passed.
- Cloudflare-target build passed.
- Hostinger/Node-target build passed.
- Hostinger emitted-bundle scan passed with no `cloudflare:` reference.
- Node SQLite migration and cross-process persistence test passed.
- Docker Compose and GitHub Actions YAML parsed successfully.

The Docker daemon is unavailable in the current Codex workstation, so the added end-to-end container command is enforced by CI and should also be run on the Hostinger VPS before DNS cutover:

```bash
npm run test:integration:hostinger
```
