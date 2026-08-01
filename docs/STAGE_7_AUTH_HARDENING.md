# Stage 7 — Web authentication and access-control hardening

Stage 7 replaces the temporary Stage 6 trusted-identity-header boundary with real web authentication. Mobile token authentication is explicitly out of scope; the existing mobile/demo code is not used as a real authentication source.

## Security design

- Passwords use `@node-rs/argon2` Argon2id v19 with 65,536 KiB memory, three iterations, parallelism one, and 32-byte output. Successful verification rehashes an outdated encoding.
- Passwords accept Unicode/passphrases, are 12–128 Unicode code points, and are checked against a local common-password deny-list. No composition rule is imposed.
- Sessions use random 256-bit opaque tokens. Only SHA-256 token hashes are stored. The `__Host-hig_session` cookie is `Secure`, `HttpOnly`, `SameSite=Lax`, and `Path=/`; the readable `__Host-hig_csrf` cookie carries a separate random value whose hash is bound to the session.
- Idle expiry is 30 minutes and absolute expiry is 12 hours. Login, tenant switching, password rehash/change/reset, and invitation acceptance revoke or rotate sessions as applicable.
- Real routes ignore all `oai-authenticated-user-*` headers. Identity, active tenant, membership, modules, role permissions, and platform permissions are resolved from the server-side session.
- Every tenant API compares the requested school UUID with the verified session tenant before calling a tenant repository. PostgreSQL RLS remains an independent backstop.
- Platform and school identities are mutually exclusive within a session. A platform user must explicitly switch into an active school membership to receive a school-scoped session.
- High-risk settings and role mutations remain blocked because Stage 7 deliberately does not provide MFA/step-up bypasses.
- Login, recovery, invitation, tenant-switch, and session-revocation limits use Redis atomic counters in production/staging. Missing Redis fails closed.
- Audit events retain only keyed hashes of IP/user-agent data and token/email hashes where needed. Set a unique `HIG_SECURITY_HASH_KEY` (different from `SESSION_SECRET` and `HIG_ENCRYPTION_KEY`); passwords and raw tokens are never logged or stored.

The mandatory native-module gate passed with Node.js `v22.23.2` in the
`node:22-alpine` Linux arm64 image using the exact Argon2id parameters above.
This proves compatibility for the current Hostinger-compatible container
architecture; the Docker build remains an acceptance gate for every release.
Native password hashing is enabled only in the Node runtime. The Cloudflare
bundle remains build-compatible but real authentication fails closed there;
enabling Cloudflare authentication requires a separately reviewed Worker-safe
Argon2 implementation and is not part of Stage 7.

## Additive migrations

SQLite migration `drizzle/0008_auth_hardening.sql` and PostgreSQL migration `drizzle-postgres/0004_auth_hardening.sql` add membership security state, credentials, sessions, password-reset tokens, platform-role assignments, and expiry/token indexes. PostgreSQL auth tables use an explicit auth-service RLS context and are not visible with ordinary tenant context. Existing Stage 6 columns and tables are not removed.

The PostgreSQL application role needs explicit grants on the four new auth tables. Run the following from the database owner account, replacing the role name if staging uses a different non-owner role. Never grant ownership, `SUPERUSER`, `CREATEROLE`, or `BYPASSRLS`.

```sql
GRANT SELECT, INSERT, UPDATE, DELETE
ON auth_credentials, auth_sessions, password_reset_tokens, platform_role_assignments
TO staging_school_app;
```

Ordinary tenant context cannot read these tables. Authentication repositories set the transaction-local `app.auth_service` context; tenant repositories do not.

## One-time platform bootstrap

There is no HTTP bootstrap endpoint. On a new database, create a temporary password file locally, restrict it to mode `0600`, then run:

```sh
HIG_BOOTSTRAP_EMAIL='admin@example.com' \
HIG_BOOTSTRAP_FULL_NAME='Platform Administrator' \
HIG_BOOTSTRAP_PASSWORD_FILE='/run/secrets/hig-bootstrap-password' \
npm run auth:bootstrap-platform-admin
```

The command refuses to run if a platform-role assignment already exists. It never prints the password or hash. Delete the temporary password file securely after successful bootstrap.

## Email and demo isolation

Set `HIG_EMAIL_ADAPTER=smtp`, an `smtps://` `SMTP_URL`, and `SMTP_FROM`. Production fails closed when delivery is absent. Tests and explicitly configured staging may use `HIG_EMAIL_ADAPTER=capture`; capture is forbidden in ordinary production.

Sales-demo accounts must be injected at deployment through `HIG_DEMO_ACCOUNTS_JSON`. No password or static demo token is bundled into the web production runtime. Demo cookies/endpoints remain separate, and all demo endpoints return 404 unless the existing sales-demo deployment gate is explicitly enabled.

## Stage 7 candidate rollout

1. Back up staging PostgreSQL and record the current Stage 6 image tag.
2. Build the candidate locally and run every Stage 7 acceptance gate.
3. Apply additive migrations with the owner connection, then grant only required auth-table privileges to the non-owner application role.
4. Configure Redis, SMTP, `SESSION_SECRET`, `HIG_SECURITY_HASH_KEY`, and encryption secrets in the Hostinger secret/environment UI. All three application secrets must be unique. Do not place them in Compose, Git, chat, or shell history.
5. Create mode-`0600` platform and school password files in the existing staging backup volume. Set only their paths in `.env.staging`; do not put either password in the environment file.
6. Bootstrap the first platform admin through the protected operator container. Create the synthetic school account through a real school invitation and accept it once; give it the existing `school_admin` role and verify its active tenant.
7. Apply the candidate Traefik override. It keeps the operator IP allowlist and strips all legacy identity headers.
8. Start one candidate instance, verify health/readiness, login/logout, session revocation, invitation, reset, tenant isolation, RLS, and audit events, then replace the old instance.
9. Run `npm run staging:smoke` in the operator container. It performs a real platform login, a separate real school login, CSRF-protected mutations, and tenant-scoped reads. It no longer sends trusted identity headers.
10. Do not enable PostgreSQL in production as part of Stage 7. Repository defaults remain SQLite and shadow reads remain disabled.

The staging smoke variables contain identifiers and file paths only:

```dotenv
HIG_STAGING_PLATFORM_AUTH_EMAIL=staging.platform@higschool.test
HIG_STAGING_PLATFORM_PASSWORD_FILE=/backups/staging-school/stage7-platform-password
HIG_STAGING_SCHOOL_AUTH_EMAIL=staging.school@higschool.test
HIG_STAGING_SCHOOL_PASSWORD_FILE=/backups/staging-school/stage7-school-password
```

The smoke password files are secrets. Do not send them in chat, add them to Git, or copy them into Docker image layers.

## Rollback

The database changes are additive. Roll back the application/proxy image to the recorded Stage 6 image without dropping auth tables. Restore the pre-rollout staging backup only if the migration itself failed before any accepted Stage 7 user activity. Password/session/invitation writes made after activation must not be silently merged or discarded. The Stage 6 trusted-header proxy override must not be exposed publicly; keep the operator allowlist while investigating.

## Required validation

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run build:hostinger
npm run check:hostinger-bundle
npm run security:secrets
npm run security:licenses
HIG_REPOSITORY_BACKEND=sqlite npm run test:integration:auth
HIG_REPOSITORY_BACKEND=postgres npm run test:integration:auth
npm run test:integration:infra
npm run test:integration:hostinger
npm run test:readiness:production
npm run test:load:postgres
git diff --check
```

No Stage 7 source change deploys itself. Stage 8 must not begin until Stage 7 is accepted.
