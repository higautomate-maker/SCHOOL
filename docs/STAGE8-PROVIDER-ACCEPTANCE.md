# Stage 8 — Real provider and dead-letter acceptance

Status: core notification/outbox/worker implementation is complete; this
checklist requires staging-only provider credentials and controlled recipients.

## Provider matrix

Run once for Firebase push, production-candidate email and production-candidate
SMS:

1. Store staging-only credentials outside Git and container images.
2. Send to one controlled recipient for each supported audience.
3. Verify provider acceptance ID, worker delivery state and user receipt.
4. Exercise a temporary provider failure and confirm bounded retry/backoff.
5. Exercise a permanent invalid-recipient failure and confirm it is not retried
   indefinitely.
6. Verify logs and public API responses contain no credentials, message body
   secrets or provider authentication detail.
7. Rotate the credential and verify the old credential fails.

## Dead-letter operational test

- Use a synthetic staging notification and a deliberately invalid controlled
  destination; never target a real parent/student without consent.
- Allow the configured retry policy to exhaust normally. Do not edit database
  attempt counts to manufacture the result.
- Confirm the record remains tenant scoped, retains a stable failure code and
  is visible to the designated operator without exposing provider secrets.
- Correct the destination/provider configuration, requeue once through the
  supported operator path and verify exactly one delivery effect.
- Record notification ID, tenant, adapter, attempt timestamps, final state,
  operator and screenshots/log references with sensitive content redacted.

Stage 8 provider acceptance fails on duplicate delivery effect, cross-tenant
visibility, unbounded retry, missing audit evidence or raw secret disclosure.
