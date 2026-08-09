# Stage 11A — Secure Payment Foundation

## Supported payment methods

The production online gateway foundation starts with Razorpay for India.

UPI QR and Bank Transfer remain manual/offline settlement methods.

Other gateway names previously displayed in the prototype UI are not
advertised until real provider adapters exist.

## Secret storage

Payment gateway credentials are never intentionally persisted as plaintext by
the Stage 11 configuration write path.

Credentials are encrypted using AES-256-GCM with `HIG_ENCRYPTION_KEY`.

Payment encryption uses a payment-specific derived key domain and tenant ID as
authenticated additional data. A ciphertext copied to another tenant cannot be
decrypted successfully.

Existing legacy plaintext configuration can be read for upgrade compatibility.
The next successful gateway save rewrites the credential set using encrypted
storage. Production acceptance must verify there are no remaining legacy
plaintext gateway credentials before live payments are enabled.

## Payment data model

`payment_orders` is the server-side payment intent tied to exactly one fee
invoice and student.

Amounts are stored in integer paise.

`payment_attempts` stores provider payment state without storing card details,
UPI credentials or other payment instrument secrets.

`payment_webhook_events` stores the provider event ID, event type, payload hash,
signature verification state and processing status. Raw webhook bodies are not
stored in this table.

All three tables use forced PostgreSQL row-level security and tenant isolation.

## Razorpay webhook contract for Stage 11B

Stage 11B must:

1. read the raw request body;
2. verify `X-Razorpay-Signature` using HMAC-SHA256 and the tenant webhook secret;
3. use `x-razorpay-event-id` as the duplicate-event boundary;
4. accept out-of-order webhook delivery;
5. create fee payment effects idempotently;
6. perform payment mutations only after successful signature verification.

## Deployment status

Migration `0014_payment_foundation.sql` was applied to Hostinger/Neon staging
on 2026-08-09 with its expected checksum. The Stage 11 application, worker and
operator images are deployed and staging health/readiness pass.

Only sandbox payment behavior is enabled. No live merchant credentials, real
payment, production migration or production deployment has been performed.

## Stage 11B sandbox endpoints

Parent order creation:

`POST /api/v1/mobile/payments/orders`

Parent checkout verification:

`POST /api/v1/mobile/payments/razorpay/verify`

Tenant-specific Razorpay webhook:

`POST /api/v1/payments/webhooks/razorpay/<school-id>`

Only Razorpay sandbox mode is permitted during Stage 11B.
