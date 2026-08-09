# Stage 11B — Razorpay Sandbox Integration

## Scope

Stage 11B enables the server-side Razorpay sandbox payment flow.

No live-money processing is enabled by this stage.

The implementation includes:

- Parent-authenticated payment order creation.
- Server-derived student authorization.
- Exact integer-paise amounts.
- Optional surcharge calculation.
- Server-created Razorpay Orders.
- Stable unique Razorpay receipts.
- Recovery by receipt after an uncertain API response.
- Checkout signature verification.
- Raw-body webhook signature verification.
- Duplicate webhook protection.
- Out-of-order captured/failed event handling.
- Automatic fee-ledger posting after `payment.captured`.
- Reconciliation state instead of unsafe posting if the invoice changed.

## Parent checkout contract

`POST /api/v1/mobile/payments/orders`

Requires:

- authenticated Parent identity;
- active server-side student assignment;
- a valid `Idempotency-Key`;
- an invoice belonging to an assigned child;
- Razorpay enabled in sandbox mode.

Response exposes only checkout-safe values:

- local payment order ID;
- Razorpay order ID;
- Razorpay Key ID;
- amount in paise;
- invoice amount;
- surcharge;
- INR currency;
- receipt.

The Key Secret and webhook secret are never returned.

## Checkout verification

`POST /api/v1/mobile/payments/razorpay/verify`

The client supplies:

- local payment order ID;
- Razorpay order ID;
- Razorpay payment ID;
- Razorpay signature.

The server loads the authoritative Razorpay order ID from its own database and
verifies HMAC-SHA256 using the encrypted sandbox Key Secret.

Successful checkout verification records an authorised attempt only.

It does not mark the school invoice paid.

`payment.captured` remains the financial posting boundary.

## Webhook

Configure the tenant-specific endpoint:

`/api/v1/payments/webhooks/razorpay/<school-id>`

The webhook route reads `request.text()` first and verifies
`X-Razorpay-Signature` against the exact raw body.

`x-razorpay-event-id` is stored behind a tenant/provider unique constraint.

Raw webhook bodies are not persisted.

## Captured payment posting

A verified `payment.captured` event:

1. locks the payment order;
2. validates provider order, amount and currency;
3. records the provider payment attempt;
4. locks the fee invoice;
5. verifies its outstanding amount is still exactly the amount originally
   ordered;
6. inserts one `fee_payments` row;
7. updates the invoice balance/status;
8. records an audit event;
9. records a notification outbox event;
10. marks the payment order paid.

If the invoice balance changed after checkout started, the gateway payment is
not silently forced into the fee ledger. The order moves to
`requires_reconciliation` for Stage 11C handling.

## Out-of-order events

`payment.failed` never downgrades an order already recorded as paid.

A later `payment.captured` event can promote a previously failed/attempted
payment to paid after all financial checks pass.

## Deployment boundary

Migration `0014_payment_foundation.sql` remains local and unapplied.

Stage 11B validation does not create real payments unless a developer manually
calls the sandbox order endpoint with configured Razorpay Test API keys.

Nothing is committed, pushed, merged or deployed by this development step.
