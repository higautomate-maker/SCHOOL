# Stage 10 — GPS Location Retention and Automatic Deletion

## Policy

Raw vehicle GPS `location` events are retained for 30 days by default.

The technical retention window can be changed with:

`HIG_TRANSPORT_LOCATION_RETENTION_DAYS`

The value is bounded to 1–90 days. Stage 12 security/compliance must approve the
final production retention period before launch.

## Automatic deletion

Retention is tenant scoped and activity triggered.

When the server accepts real GPS `location` traffic, it checks whether that
tenant's retention sweep is due. A sweep is attempted at most once every six
hours per application process.

The server deletes expired raw `location` events only. SOS, boarding/drop,
trip, stop and geofence events are not deleted by this Stage 10 policy.

Deletion is bounded to 5,000 rows per batch and at most eight batches per
sweep. PostgreSQL uses `FOR UPDATE SKIP LOCKED` so concurrent application
processes do not contend on the same cleanup rows.

## Privacy and tenant isolation

Every cleanup query contains the authenticated tenant ID. The deletion query
rechecks the tenant and `event_type = 'location'` conditions.

The cleanup executes inside the same tenant-scoped PostgreSQL transaction
model already used by mobile transport operations.

## Why activity-triggered in Stage 10

The repository currently has a dedicated Stage 8 notification worker but no
general-purpose maintenance scheduler. Activity-triggered cleanup avoids
introducing a privileged cross-tenant scheduler or migration-owner credential
into the application runtime.

Stage 12 can replace or supplement this with a centrally scheduled maintenance
job after the production retention policy, service account, and operational
monitoring requirements are approved.

## Operational behavior

If a tenant has no transport activity, no new GPS data is being generated.
The next accepted GPS location for that tenant triggers the overdue retention
sweep.

## Deployment status

This block requires no database migration.

Nothing is committed, pushed, merged, migrated, or deployed by the validation
script.
