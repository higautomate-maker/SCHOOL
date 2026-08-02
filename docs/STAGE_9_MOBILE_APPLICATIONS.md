# Stage 9 — Mobile Applications

## Status

Stage 9 Batch 1 is the production mobile identity and API foundation.

Base release:

- Stage 8.1 accepted tag: `stage8-1-web-accepted-e74aa34`
- Base commit: `e74aa34`
- Batch branch: `stage9-batch1-mobile-identity-api`

This batch does not create Flutter platform runners, build APK/IPA files,
deploy staging, or apply a database migration.

## Existing mobile applications

The repository contains three Flutter applications:

1. `student_parent_app`
2. `staff_admin_app`
3. `driver_gps_app`

Their existing `/api/v1/demo/*` integration remains sales-demo only.
Production mobile code must not authenticate through demo tokens or read
production data through demo routes.

## Authentication boundaries

### Existing web authentication

Existing Company and School web authentication remains unchanged:

- secure cookie session;
- CSRF token for unsafe browser requests;
- same-origin validation;
- platform or school identity;
- tenant membership;
- School module entitlement;
- School role permission;
- step-up authentication where required.

### Production mobile authentication

Mobile authentication uses dedicated opaque bearer tokens.

Mobile endpoints must not:

- accept the web session cookie as a substitute for a mobile token;
- use the demo bearer token implementation;
- require browser CSRF cookies;
- trust tenant, persona, feature, or resource assignments supplied by the app;
- return password hashes or stored token hashes;
- log raw access or refresh tokens.

The API selects all authorization context from server-controlled records.

## Supported mobile principals

### School staff and administrators

Staff and administrator mobile sessions use the existing School identity.

Required boundaries:

1. active user;
2. valid credential;
3. active School membership;
4. correct tenant;
5. Company-enabled School module;
6. School role permission;
7. resource assignment where the operation requires it.

A staff mobile session does not receive Parent, Student, or Transporter
app-feature access.

### Parent

A Parent mobile session requires:

1. active user and credential;
2. active Parent mobile identity for the selected tenant;
3. Company-enabled Parent app feature;
4. required School module enabled;
5. an active relationship to the requested student or other resource.

### Student

A Student mobile session requires:

1. active user and credential;
2. active Student mobile identity for the selected tenant;
3. Company-enabled Student app feature;
4. required School module enabled;
5. assignment to the requested student record.

### Transporter

A Transporter mobile session requires:

1. active user and credential;
2. active Transporter mobile identity for the selected tenant;
3. Company-enabled Transporter app feature;
4. the Transport School module enabled;
5. assignment to the requested vehicle, route, trip, or student list.

## Data model

Batch 1 will add additive tables equivalent to the following contracts.

### `mobile_identities`

Tenant-scoped relationship between a user and a mobile persona.

Required fields:

- `id`
- `tenant_id`
- `user_id`
- `audience`: Parent, Student, or Transporter
- `status`: invited, active, suspended, or revoked
- `created_at`
- `updated_at`
- optional `revoked_at`
- optional `revoked_reason`

The combination of tenant, user, and audience must be unique.

### `mobile_identity_assignments`

Tenant-scoped resources available to one mobile identity.

Required fields:

- `id`
- `tenant_id`
- `mobile_identity_id`
- `resource_type`
- `resource_id`
- `status`
- `created_at`
- `updated_at`

The same active assignment must not be duplicated.

Parent and Student student assignments must reference a student belonging to
the same tenant.

Transport assignments must fail closed until the corresponding tenant-scoped
resource exists.

### `mobile_sessions`

A mobile session is separate from the browser `auth_sessions` table.

Required fields:

- `id`
- `user_id`
- `tenant_id`
- optional `mobile_identity_id`
- principal type
- access-token hash
- refresh-token hash
- refresh-family identifier
- refresh rotation counter
- credential version
- access expiry
- refresh expiry
- issued and last-seen timestamps
- optional revocation timestamp and reason
- optional device identifier hash
- optional platform and app-version metadata
- hashed IP and user-agent metadata

Only hashes are persisted. Raw tokens are returned once.

### `mobile_refresh_token_uses`

Consumed refresh-token hashes are retained for replay detection.

A replayed refresh token revokes every active session in the refresh family.

## Token lifecycle

- Access token lifetime: 15 minutes.
- Refresh token lifetime: 30 days.
- Access and refresh tokens contain at least 256 bits of randomness.
- Tokens are stored as SHA-256 hashes.
- Refresh tokens rotate on every successful refresh.
- Rotation is atomic.
- A consumed-token replay revokes the token family.
- Logout revokes the current mobile session.
- Password change or reset revokes all web and mobile sessions.
- Credential-version mismatch invalidates the session.
- Suspended or revoked memberships and relationships invalidate the session.
- Expired sessions cannot be refreshed.
- Login, refresh, logout, rejection, revocation, and replay detection create
  security audit events without raw tokens.

## Mobile endpoints

Batch 1 implements only these production endpoints.

### `POST /api/v1/mobile/auth/login`

Input:

- email
- password
- tenant ID
- principal type
- optional device metadata

Output:

- access token
- refresh token
- access expiry
- refresh expiry
- session identifier
- authenticated principal summary

Requirements:

- generic invalid-credential response;
- existing authentication rate limiter;
- active tenant relationship;
- no cookie creation;
- no raw secrets in logs.

### `POST /api/v1/mobile/auth/refresh`

Input:

- refresh token
- optional device metadata

Output:

- rotated access token
- rotated refresh token
- new expiries

Requirements:

- atomic token rotation;
- replay detection;
- family revocation after replay;
- credential and identity revalidation.

### `POST /api/v1/mobile/auth/logout`

Requires the mobile bearer token.

The current mobile session is revoked. The operation is safe to repeat.

### `GET /api/v1/mobile/session`

Returns only the authenticated session's:

- user identity;
- tenant;
- principal type;
- School membership summary for staff;
- mobile relationship summary for Parent, Student, or Transporter;
- non-secret device/session metadata.

### `GET /api/v1/mobile/access`

Returns only access calculated for the authenticated tenant and principal.

For Parent, Student, and Transporter it returns that persona's effective
Company-controlled features.

For School staff it returns effective School modules narrowed by the user's
role permissions.

The endpoint does not accept an arbitrary school or audience override.

## Authorization order

### School staff mobile requests

1. authenticated mobile bearer token;
2. mobile client type;
3. active School membership;
4. exact tenant match;
5. Company School-module entitlement;
6. School role permission;
7. resource assignment when applicable.

### Parent, Student, and Transporter requests

1. authenticated mobile bearer token;
2. expected mobile persona;
3. active tenant relationship;
4. exact tenant match;
5. Company app-feature policy;
6. required School module;
7. resource assignment.

A hidden menu item is never considered authorization.

## PostgreSQL security

Every new tenant-scoped table must:

- enable row-level security;
- force row-level security;
- use the existing transaction-scoped tenant context;
- deny access when tenant context is absent;
- expose only narrowly scoped authentication-service policies;
- avoid `BYPASSRLS`;
- avoid disabling RLS during migrations or tests.

The migration must be additive and compatible with the accepted Stage 8.1
application image.

## SQLite parity

The SQLite test repository must implement the same observable behavior:

- identity selection;
- assignment boundaries;
- token hashing;
- refresh rotation;
- replay detection;
- expiration;
- revocation;
- credential-version invalidation;
- access calculation.

PostgreSQL is the staging and production source of truth.

## Batch 1 tests

Automated tests must cover:

- valid staff, Parent, Student, and Transporter login;
- generic invalid-login response;
- wrong tenant rejection;
- wrong persona rejection;
- inactive relationship rejection;
- access-token expiry;
- refresh-token rotation;
- refresh-token replay and family revocation;
- logout and repeated logout;
- credential-version invalidation;
- password-change revocation;
- Company-disabled app feature;
- required School module disabled;
- School role permission denial;
- Parent and Student assignment isolation;
- Transporter assignment isolation;
- cross-tenant rejection;
- forced-RLS behavior;
- SQLite/PostgreSQL parity;
- no raw tokens, passwords, or credentials in source or artifacts;
- existing web authentication regression protection.

## Explicitly deferred

These items are not part of Batch 1:

- production attendance, homework, fee, result, library, PTM, or GPS data APIs;
- mobile account-provisioning user interface;
- push-notification device registration;
- Flutter secure-storage integration;
- Flutter API integration;
- Android and iOS runners;
- Android background-location configuration;
- Apple signing;
- Google Play or App Store submission;
- staging migration or deployment.

## Batch 1 acceptance gates

Batch 1 code is accepted locally only when:

- migrations and runtime migration manifests agree;
- PostgreSQL and SQLite implementations have parity;
- unit and integration tests pass;
- tenant and assignment isolation pass;
- typecheck and lint pass;
- Hostinger production build passes;
- secret scan passes;
- no demo credential enters production mobile code;
- existing web authentication tests remain green.

Staging migration and deployment require a separate reviewed command after
local acceptance.
