# Teacher attendance: implementation checkpoint

> Historical checkpoints below. The completed candidate now includes lesson persistence, the Flutter lesson selector, diary, and administrator assignment UI. See [current release and test checklist](MOBILE-CANDIDATE-20260907.md) for the authoritative handoff. These migrations have not been applied to staging by this work.

Approved rule: class teachers mark daily attendance; subject teachers mark their assigned lessons. School-admin overrides require an audit reason. Daily and lesson records must remain separate.

## Implemented locally

`server/operations/teacher-attendance-policy.ts` implements a deny-by-default decision function with school, session, class, section, teacher, subject and active-assignment checks. Six unit tests cover boundaries, multiple classes, invalid context and reason-required admin overrides.

The policy is now called by the mobile daily-attendance write path. The web
operations contract remains compatible while its separate UI migration is
pending.

## Existing implementation gaps confirmed at the start

- `performMobileOperation` checks attendance module management permission but not a class/subject teaching assignment.
- Current `mark_attendance` input has student, date and status, not lesson/subject context.
- Current daily attendance repository must not be reused for lesson records: its daily upsert would overwrite the daily mark.

## Assignment persistence and API checkpoint

- Added migration `0015_teacher_assignments.sql`, matching schema and migration manifests. It has tenant-scoped foreign keys, active/revoked assignments, duplicate prevention and forced row-level security.
- Added authenticated `/api/v1/mobile/teaching-context`: GET returns the signed-in teacher's active-session assignments; POST requires school-admin role plus academics management permission. The repository rechecks active administrator membership and validates teacher membership, class/section/session and subject. Assignment writes and audit events share a transaction.
- Ten policy/input unit tests pass. A fresh, disposable local PostgreSQL 17 database passed migration, runtime-role RLS, own-context reads, class/subject assignment, repeat setter, revocation, suspended-teacher and audit checks using `scripts/test-teacher-assignments-postgres.mjs`.
- PostgreSQL integration is local only. No live school assignments have been created and no staging migration has been applied.
- The Staff/Teacher attendance screen now loads server-owned class-teacher contexts, filters the roster to the selected class and includes immutable session/class/section identifiers in each queued write.
- The PostgreSQL write transaction rechecks the active assignment, current session, exact student roster scope and authenticated user before saving. Revocation is protected by row locks. Missing or forged assignments fail closed; school-admin overrides require a reason and store it in the same audit transaction.
- Subject-teacher policy exists, but independent lesson-attendance persistence and its mobile lesson workflow are still pending. Daily records are not reused for lessons.

Deployment prerequisite: reviewed migration, explicit teacher assignment provisioning, endpoint permission/negative tests and runtime grant verification. Do not deploy this partial flow alone: the updated readiness manifest expects migration 0015.

## Next integration slice

1. Add independent lesson attendance persistence and idempotency, with tests proving lesson saves do not overwrite daily attendance.
2. Add the subject-teacher lesson selector and lesson register to Flutter.
3. Add endpoint-level negative tests and exercise revoked assignments, foreign students and concurrent changes.
4. Provision explicit staging teacher assignments, apply migration 0015 through the operator, then run role and physical-device acceptance before producing APKs.

No live database, hosting configuration, deployment or APK changes are part of this checkpoint. Existing map/payment work is preserved.
