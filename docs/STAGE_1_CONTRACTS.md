# Stage 1 migration safety contracts

Completed: 29 July 2026

## Outcome

Stage 1 freezes the current public/demo behavior and the intended production security/transaction behavior before database, framework, and authentication migration work begins.

No PostgreSQL production repository, Auth.js flow, or route authorization implementation was introduced in this stage.

## Implemented checks

- Every current production API file/method is represented in `tests/contracts/api-security.contract.json`.
- The approved authorization order is fixed as:
  1. authenticated identity;
  2. client identity type;
  3. tenant membership;
  4. Company module entitlement;
  5. School role permission;
  6. class, child, route, or other resource assignment.
- Company platform permissions are distinct from School tenant permissions.
- Teacher, Parent, and Transporter resource boundaries are covered by a passing reference-model test.
- Every mutation has an explicit idempotency decision.
- Shared idempotency-key length validation replaces three duplicated route checks without changing behavior.
- Repository atomic write sets, audit/outbox expectations, replay requirements, and payment row-lock requirements are recorded.
- Health/readiness response shapes and unauthenticated demo behavior are characterized.
- Sales-demo enablement has a fail-closed policy primitive that refuses production mode.
- PostgreSQL 17 and Redis 7.4 disposable service definitions and health checks are available in `tests/integration/compose.yaml`.

## Pending acceptance contracts

The test runner reports future requirements as `TODO`, not false successes:

- 16 route-level authentication/scope/tenant/entitlement/permission matrices.
- PostgreSQL transaction rollback and replay checks for seven repository operations.
- Production demo-route/artifact isolation.
- Real dependency readiness and minimized health disclosure.

These checks become executable as their implementation stages land. They are intentionally not implemented against the current trusted-header/D1 runtime.

## Verification

| Check | Result |
|---|---|
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm test` | 85 total: 51 pass, 34 explicit TODO, 0 fail |
| `npm run build` | Pass |
| Compose YAML structural validation | Pass |
| PostgreSQL/Redis container smoke | CI-only in this environment because Docker is not installed |

## Review files

- `tests/contracts/api-security.contract.json`
- `tests/contracts/repository-transactions.contract.json`
- `tests/api-route-contracts.test.ts`
- `tests/authorization-model.test.ts`
- `tests/repository-contracts.test.ts`
- `tests/public-api-contracts.test.ts`
- `tests/security-primitives.test.ts`
- `tests/integration/compose.yaml`
- `scripts/test-integration-infra.mjs`
