# Phase 1 implementation checklist

## Delivered foundation

- [x] Branded Super Admin command center
- [x] Responsive platform navigation and tenant overview
- [x] School onboarding interaction with secure-tenant explanation
- [x] Plans, modules, access-control and audit entry points
- [x] Initial tenant, campus, user, membership, plan, subscription, module-policy and audit schema
- [x] Tenant guard and permission evaluator with isolation tests
- [x] Health and readiness endpoints under `/api/v1`
- [x] Phase 0 architecture and tenancy decisions

## Production completion gates

- [ ] Confirm external customer authentication provider and implement MFA, session rotation, device history and account recovery
- [ ] Move production persistence to managed PostgreSQL; enable RLS and PgBouncer
- [x] Implement repository-backed school creation with a hashed, expiring invitation record and transactional audit event
- [ ] Add Razorpay subscription webhooks with signature verification and idempotency
- [ ] Add Redis rate limits and background job worker
- [ ] Complete OpenAPI specification, accessibility audit, load test and independent security review

The visual application is an operational product shell. It intentionally does not claim that unresolved production identity, payments or messaging integrations are live.

## Phase 1.1 delivery

School onboarding is now a server-authorized, idempotent D1 operation. It creates the tenant, main campus, subscription trial, scoped School Admin membership, default module policies, expiring invitation record and audit event in one batch. Actual invitation email delivery remains gated on selection of an email provider.

## Phase 1.2 delivery

Platform administrators can now open a live tenant control drawer, change the subscription plan, override modules, rotate or revoke the School Admin invitation, and inspect recent audit activity. Every write is authenticated, schema-validated, idempotent and recorded in the tenant audit stream.

## Phase 1.3 delivery

Each tenant now has persistent roles and permission grants. The protected School Admin role starts with the complete Phase 1 permission catalogue, custom roles can be created without code, and permissions can be replaced through a validated matrix. System safeguards prevent removal of role administration from School Admin; every change is tenant-scoped and audited.
