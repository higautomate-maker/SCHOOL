# EMERGENT Role → Module Access Matrix — HIG School SaaS

This matrix documents the **existing** fail-closed authorization model. It is
descriptive: the redesign did **not** add, remove, widen or bypass any
permission. Source of truth: `server/access/catalogue.ts`,
`server/auth/policies.ts`, `server/auth/authorization.ts`.

## How access is decided (fail-closed, layered)

```
Company plan / per-school override   →   School role permissions   →   User relationship / assignment
        (upper boundary)                     (narrows only)                (parent↔child, driver↔route)
```

A capability is reachable **only if every layer allows it**. Disabling at any
layer both **hides it in the UI** and **denies the API** (the same catalogue
drives navigation building and route authorization). This is verified by
`tests/emergent-login-error-states.test.ts`,
`tests/stage8-1-company-access.test.ts`, `tests/stage8-1-school-access.test.ts`
and `tests/authorization-model.test.ts`.

- **Web module gate:** `resolveEffectiveSchoolModuleAccess` →
  `accessible = enabledByCompany && permittedByRole`.
- **App feature gate:** `resolveEffectiveAppFeatureAccess` →
  `accessible = enabledByPolicy && dependencySatisfied` (feature also requires its
  `requiredSchoolModule` to be enabled).

## Scopes

| Scope | Who | Permission examples |
| --- | --- | --- |
| `platform` | Company / platform admin | `platform.schools.view`, `platform.schools.manage` |
| `tenant` | School roles (admin, teacher/staff) | module `*.view` / `*.manage` permissions |

## Company (platform) portal

| Area | Policy key | Permission |
| --- | --- | --- |
| Schools list | `schoolsList` | `platform.schools.view` |
| School onboarding / plan / invitation | `schoolsManage` | `platform.schools.manage` |
| Company access config (view) | `companyAccessView` | `platform.schools.view` |
| Company access config (change) | `companyAccessManage` | `platform.schools.manage` |

_Company scope cannot read or mutate tenant academic data through platform routes;
tenant operations require a tenant-scoped session._

## School web modules → required permissions

(from `schoolModuleCatalogue`; a module needs its **view** permission to appear and
**manage** permission to edit, and the Company policy must have it enabled)

| Module | View | Manage | Core admin |
| --- | --- | --- | --- |
| Student Information | students.view | students.manage | ✓ |
| Fees & Finance | fees.view | fees.collect | ✓ |
| Accounts | accounts.view | accounts.manage | |
| Attendance | attendance.view | attendance.manage | ✓ |
| Academics | academics.view | academics.manage | ✓ |
| Front Office | front_office.view | front_office.manage | |
| Lead Management | lead_management.view | lead_management.manage | |
| Examinations | exams.view | exams.publish | ✓ |
| CBC Academics | cbc_academics.view | cbc_academics.manage | |
| Human Resources | human_resources.view | human_resources.manage | |
| PTM Meetings | ptm_meetings.view | ptm_meetings.manage | |
| Lesson Planner | lesson_planner.view | lesson_planner.manage | |
| OSM Module | osm.view | osm.manage | |
| Assessment | assessment.view | assessment.manage | |
| Live Classes | live_classes.view | live_classes.manage | |
| Study Center | study_center.view | study_center.manage | |
| Certificates | certificates.view | certificates.manage | |
| Communication | communication.view | communication.manage | ✓ |
| Library | library.view | library.manage | |
| Inventory | inventory.view | inventory.manage | |
| Transport | transport.view | transport.manage | |
| Hostel | hostel.view | hostel.manage | |
| Help Center | help_center.view | help_center.manage | |
| Asset Management | asset_management.view | asset_management.manage | |
| Reports & Analytics | reports.view | reports.manage | ✓ |
| Settings & Billing | settings.view | settings.manage | ✓ |
| Access Control | roles.view | roles.manage | ✓ |

Default-enabled modules for a new school (`defaultEnabledSchoolModuleKeys`):
Student Information, Fees & Finance, Attendance, Academics, Examinations,
Communication, Settings & Billing, Access Control.

## Mobile app features → required school module

(from `appFeatureCatalogue`; each feature is gated by policy **and** its required
module being enabled, **and** a valid user relationship/assignment)

### Parent app
Child Overview `student_information` · Attendance `attendance` · Homework `academics`
· Timetable `academics` · Examinations `examinations` · Results `examinations`
· Fees & Payments `fees_finance` · Notices `communication` · PTM `ptm_meetings`
· Leave Requests `front_office` · Transport Tracking `transport` · Library `library`
· School Events `communication` · Contact School `communication`.

### Student app
Attendance `attendance` · Homework `academics` · Timetable `academics`
· Examinations `examinations` · Results `examinations` · Notices `communication`
· Fees Summary `fees_finance` · Study Material `study_center` · Live Classes `live_classes`
· Transport `transport` · Library `library`.

### Transporter (driver) app
Assigned Vehicle · Assigned Route · Pickup List · Trip Control · GPS Tracking
· Boarding · Emergency Alerts (SOS) · Vehicle Documents · Fuel & Maintenance —
**all require the `transport` module** and a driver↔route/vehicle assignment.
Live location is only exposed while a trip is active (privacy safeguard preserved).

## Boundary guarantees (unchanged, re-verified)

- A capability disabled by Company is hidden in navigation **and** returns denied
  from the API — no client-only hiding.
- A role missing the `*.view` permission cannot reach an otherwise-enabled module.
- An app feature whose `requiredSchoolModule` is disabled is inaccessible even if
  its own policy flag is on.
- Parents/students see only linked/own records; drivers see only assigned
  routes/students; live GPS is active-trip only.
