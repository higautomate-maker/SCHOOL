# Company plans and audit

The Company console now has two active sections:

- **Plans & billing** lists each school's persisted subscription plan, tenant status, and period information. “Manage plan” opens the existing audited plan-change control. A plan change updates entitlements; it does **not** create an invoice, collect money, or change the subscription period.
- **Audit log** reads recorded actions across schools, or for one selected school, newest first. The API requires an authenticated platform identity with `platform.schools.view`. It returns action, school, actor display name, resource type, and timestamp, but not event metadata or IP hashes. Results are limited to 100 per request and use a keyset cursor.

Before deploying this version, apply `0018_company_audit_read.sql` through the existing PostgreSQL migration procedure after backup validation. The migration grants platform-read SELECT visibility to `audit_events`; tenant write policies are unchanged. Verify a school identity receives 403 from `/api/v1/company/audit`, and a Company administrator can view an existing school audit event.

Platform SaaS billing remains a separate product decision. Before enabling invoices or collections, define contractual plan pricing, billing periods, taxes, proration, refunds, and payment reconciliation. The Company UI intentionally does not present the plan catalogue's seed prices as payable charges.
