# Stage 11C — Refunds and Reconciliation

Stage 11C treats refunds as high-risk financial mutations.

A refund requires School authentication, Finance & Fees management
permission, same-tenant authorization, CSRF/same-origin protection,
a provider-safe Idempotency-Key, sensitive-operation rate limiting,
and explicit password step-up authentication.

The administration endpoint is:

GET /api/v1/schools/<school-id>/payments

Refund creation is:

POST /api/v1/schools/<school-id>/payments

Refund amounts use integer paise. Requested, pending, and processed
refunds reserve their amount so competing requests cannot over-refund
the original payment.

The local Idempotency-Key is also sent to Razorpay using
X-Refund-Idempotency.

A successful Refund API response does not reverse the school fee
ledger.

refund.created records pending state only.

refund.failed marks a non-final refund failed and releases its
reservation.

Only a verified refund.processed webhook is allowed to reduce
fee_invoices.paid_paise.

Before that financial reversal, the service checks payment identity,
refund amount, INR currency, payment status, invoice state, ledger
underflow, and projected total provider refunds.

Financial mismatches move the payment to requires_reconciliation
rather than forcing an unsafe ledger mutation.

A processed refund records an immutable audit event and updates the
payment order and attempt to partially_refunded or refunded.

Migration 0014 remains local and unapplied during development.

No live payment/refund, commit, push, merge, or deployment is
performed by this stage.
