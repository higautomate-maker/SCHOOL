# Incident response and recovery runbook

Status: required operational procedure for Stage 12 and Stage 14 acceptance.

## Roles to name before production

- Incident commander: owns severity, coordination and closure.
- Technical lead: owns containment, diagnosis and recovery.
- Security/privacy lead: owns evidence, scope and notification assessment.
- Communications lead: owns customer, provider and internal updates.
- Financial lead: joins every payment or reconciliation incident.

The production release checklist must contain a primary and backup person plus
an out-of-band contact method for every role.

## Severity

- **SEV-1:** cross-tenant exposure, account takeover, payment integrity failure,
  exposed production secret, unrecoverable data loss, active safety/SOS failure
  or complete production outage.
- **SEV-2:** material tenant outage, delayed notifications, degraded tracking,
  reconciliation mismatch without confirmed loss or failed automated backup.
- **SEV-3:** bounded defect with a workaround and no confirmed security,
  financial, safety or data-loss effect.

## First response

1. Open an incident record with UTC start time, reporter, affected environment,
   symptoms and current release/image.
2. Assign severity and roles. Use an out-of-band channel if account or messaging
   compromise is possible.
3. Preserve application, proxy, worker, database, Redis and provider evidence.
   Do not paste secrets, tokens, raw payment payloads or student GPS into chat.
4. Stop the affected capability using the narrowest available control. Prefer
   disabling a provider or feature over stopping unrelated school functions.
5. For suspected cross-tenant access, payment corruption, secret exposure or
   SOS failure, declare SEV-1 and block further writes to the affected path.
6. Record every command, configuration change, credential rotation and restore
   point with actor and UTC time.

## Containment matrix

| Incident | Immediate containment |
| --- | --- |
| Session/account compromise | Revoke affected sessions, reset credentials, preserve audit events, review tenant membership and MFA state |
| Application secret exposure | Rotate the exact secret, restart only consumers, revoke derived sessions/tokens where applicable and verify old material fails |
| Database credential exposure | Rotate runtime and migration roles separately; confirm runtime remains `NOSUPERUSER`, `NOBYPASSRLS` and not table owner |
| Notification/provider compromise | Disable affected adapter, retain outbox records, rotate provider keys and replay only reviewed events |
| Razorpay compromise/mismatch | Disable new online orders/refunds, retain webhooks, rotate keys, reconcile provider-to-ledger before re-enabling |
| GPS/privacy incident | Stop active tracking endpoint if needed, preserve tenant-scoped audit evidence and verify retention deletion boundaries |
| Data loss/corruption | Stop affected writes, create a forensic snapshot/branch and restore into an isolated target before any live replacement |

## Recovery procedure

1. Select a validated PostgreSQL backup or provider recovery branch from before
   the incident. Never restore over the active database as the first test.
2. Restore into a separate isolated target using the operator role.
3. Validate archive structure, migration ledger/checksums, tenant counts,
   students, invoices, payments and exact integer-paise totals.
4. Run health, readiness, authentication denial, tenant isolation, RLS,
   Stage 10 and Stage 11 checks against the candidate.
5. Reconcile payment orders, attempts, webhooks, refunds and fee ledger before
   accepting any financial recovery.
6. Obtain incident-commander and technical-lead approval before routing traffic
   to a recovered target.
7. Monitor errors, database connections, queue depth, worker heartbeat, payment
   mismatch and notification failures during the recovery window.
8. Keep the original affected target and evidence read-only until retention and
   legal/privacy review permits deletion.

## Credential rotation verification

- New credentials work only in the intended environment and tenant/provider.
- Old credentials and sessions are rejected.
- Runtime and migration database credentials remain distinct.
- No secret is present in Git, images, logs, terminal history or incident notes.
- Health/readiness and one least-privilege functional request pass after restart.

## Communication and closure

For SEV-1/2, send status at an agreed interval even when there is no change.
Never include credentials, raw payment instruments, access tokens or student
location history. Security/privacy lead determines contractual or regulatory
notification with qualified counsel; this runbook does not invent a universal
deadline.

Close only after impact and timeline are known, recovery is verified, temporary
controls have owners/expiry, affected parties have received required updates
and follow-up actions are tracked. Complete a blameless post-incident review
within five business days.

## Stage 12 exercise evidence

Before production, run one tabletop and one isolated technical restore. Record:

- scenario and participants;
- detection, containment and recovery timestamps;
- recovery point and recovery time achieved;
- backup checksum/branch and isolated restore target;
- migration, RLS, tenant, financial and application validation results;
- gaps, named owners and due dates.

Do not run the exercise against production or delete its source backup.
