# Shared data synchronization

All portals and apps use the same API origin and tenant:

```text
Company Portal ── module policies ─┐
School Portal ─── operations ──────┼── Hig School API ── tenant data store
Staff App ─────── attendance ──────┤
Student/Parent ── read updates ────┤
Driver App ────── GPS updates ─────┘
```

Demo endpoints:

- `POST /api/v1/demo/login`
- `GET /api/v1/demo/session`
- `GET /api/v1/demo/state`
- `POST /api/v1/demo/action`

Supported synchronized actions:

- `set_module`
- `mark_attendance`
- `add_student`
- `create_invoice`
- `record_payment`
- `create_record`
- `update_status`
- `update_gps`

The state response carries an increasing `version` and `updatedAt`. Web and mobile clients refresh every 5–8 seconds and can also refresh manually.
