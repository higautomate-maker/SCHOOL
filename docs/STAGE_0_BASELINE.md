# Stage 0 baseline

Captured: 29 July 2026

## Approved product boundaries

The browser identities are Company and School. The mobile identities are Teacher, Parent, and Transporter. Company entitles modules to a School; the School can grant role permissions only inside that entitled module set. Teacher, Parent, and Transporter access is narrowed again by class, child, or route assignment.

## Toolchain

- Node.js: `22.23.1` (`.nvmrc`)
- npm: `10.9.8` (`packageManager`)
- Current framework baseline: Vinext `0.0.50`, Vite `8.0.13`, Next.js `16.2.6`
- Target framework is stock Next.js in Stage 4.

## Verification baseline

| Check | Result |
|---|---|
| `npm run lint` | Pass; one informational Babel de-optimization notice for the 500 KB School page |
| `npm run typecheck` | Pass after excluding copied/generated release content |
| `npm test` | Pass: 29 tests |
| `npm run security:secrets` | Pass with the explicitly listed sales-demo files temporarily allowed until Stage 5 |
| `npm run security:licenses` | Pass: 510 installed dependency records, one missing machine-readable declaration for manual SBOM review |
| `npm run sbom` | Pass; CycloneDX output generated |
| `npm audit --audit-level=high` | Not runnable in the Codex sandbox because registry DNS/network access is blocked; configured to run in GitHub Actions |
| `npm run build` | Pass with a large-chunk warning |
| `npm run start` | Fails in the pre-migration runtime because Node cannot load the `cloudflare:` module scheme |

The `npm run start` failure is a captured pre-existing blocker. It will be removed by the repository/database port and stock Next.js cutover in Stages 3–4. It is not hidden by Stage 0.

## Source boundaries

The compiler, linter, Docker context, and future Git baseline exclude local databases, dependency folders, release copies, ZIPs, TypeScript caches, Vinext/Next/Wrangler output, and other generated packaging directories.

The authoritative application source remains:

- `app/**`
- `server/**`
- `db/**`
- `drizzle/**`
- `tests/**`
- `mobile/**`
- configuration and documentation at the repository root

## API and UI evidence

- The representative API response shapes are frozen in `docs/baseline/API_CONTRACTS.json`.
- Existing characterization tests verify complete sample data, attendance propagation to Student/Parent, Company module-policy propagation to School, and role restrictions.
- Visual reference routes to recapture after a runnable local server is available:
  - `/login`
  - `/company`
  - `/school/dashboard`
  - `/mobile-preview/staff`
  - `/mobile-preview/student`
  - `/mobile-preview/driver`

The Codex filesystem sandbox blocked listening on a localhost port (`EPERM`), and the previously open local tab no longer had a running server. Therefore new PNG captures could not be produced in this execution. This limitation does not affect the source checks or API characterization tests.

## Known critical risks retained for later authorized stages

- Trusted identity headers instead of production authentication.
- Unused tenant guards and missing two-layer entitlement/permission enforcement.
- Production-reachable demo endpoints, SQLite, plaintext demo credentials, and static mobile logins.
- D1/Cloudflare runtime coupling.
- Plaintext integration/payment secrets.
- No secure upload pipeline or production GPS identity.

These are deliberately recorded rather than altered during Stage 0.

## Git baseline status

No canonical Git history is present. The Codex workspace reserves `.git` as read-only, so `git init` fails with `Operation not permitted`. Initialize and tag the baseline from an unrestricted terminal:

```sh
git init -b main
git add .
git commit -m "chore: establish audited Stage 0 baseline"
git tag stage-0-baseline-2026-07-29
```

Review `git status` before committing. Generated and release artifacts are excluded by `.gitignore`.
