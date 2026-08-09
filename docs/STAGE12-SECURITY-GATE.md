# Stage 12 — Security and compliance gate

Date: 2026-08-09

Status: **Automated engineering gate passed with one temporary upstream
dependency exception; formal external acceptance remains open.**

## Automated results

- Full test suite: **343 total, 329 passed, 14 explicitly planned, 0 failed**.
- Stage 10: **71 passed, 0 failed**.
- Stage 11: **29 passed, 0 failed**.
- TypeScript type checking: passed.
- Production build: passed.
- Tracked-secret scan: passed.
- License inventory: passed for 533 package records; one package without a
  machine-readable license remains flagged for SBOM review.
- ESLint: no errors.
- PostgreSQL forced RLS, tenant isolation, runtime/migration role separation,
  migration ordering and checksums are covered by automated and live staging
  checks.
- Razorpay sandbox signatures, webhook idempotency, duplicate-payment
  prevention, refunds and reconciliation are covered by Stage 11 tests.

## Temporary dependency exception: `image-size@2.0.2`

`npm audit --omit=dev` reports two high-severity denial-of-service advisories
for the ICNS, JXL and HEIF parsers in transitive dependency
`vinext@0.0.50 -> image-size@2.0.2`. As of this report, the advisories list no
patched `image-size` release. The suggested `vinext` downgrade is not accepted
without compatibility validation.

Compensating controls:

- The application has no server API that accepts or parses an untrusted image
  upload with `image-size`.
- Existing file inputs are client-side prototype controls and do not persist or
  process uploaded image bytes on the server.
- Do not add a production image-upload endpoint until the dependency is
  patched or the upload path performs strict type, size, timeout and process
  isolation controls without invoking the affected parsers.
- Recheck the advisories and upstream release before every production build.

This exception covers availability risk only. It does not permit untrusted
server-side image parsing and does not waive any critical, confidentiality or
integrity vulnerability.

## Formal gates still required

- Independent authorization and penetration testing of browser, mobile and
  payment APIs.
- Real provider credential/key rotation rehearsal for email, SMS, Firebase and
  Razorpay.
- Incident-response tabletop and database/Redis recovery exercise with named
  owners and measured recovery objectives, following
  `docs/INCIDENT-RESPONSE-AND-RECOVERY.md`.
- Final privacy approval for student, parent, GPS, notification and payment
  retention periods.
- Production monitoring, alert routing and evidence retention.
- Signed review of the SBOM/license exception and the temporary dependency
  exception above.

## Release decision

Automated security evidence is green except for the explicitly constrained
upstream `image-size` exception. Stage 12 is not fully accepted until the formal
gates are signed. Stage 13 production cutover and Stage 14 launch remain no-go.
