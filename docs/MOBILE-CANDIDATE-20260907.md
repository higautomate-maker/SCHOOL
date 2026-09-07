# Connected mobile candidate — 7 September 2026

This is an implementation/testing candidate, not official-launch approval. Git branch: `feat/mobile-map-checkout-premium`. The GitHub PR records the final commit and CI outcomes. The previously installed APK and staging server do not automatically receive these changes.

## Implemented in this candidate

- Smaller illustrated home header; four primary tasks. Teacher: Attendance, Diary, Academics, Communication. Parent: Diary, Fees, Transport, Attendance. Other enabled tools remain under More; existing Study Center records are not removed.
- Teacher class/section selection from administrator-managed assignments. Daily attendance is class-teacher-only; subject lessons have separate subject/period/date records. All present plus exceptions, retry retention, and discard protection remain. Queued attendance is re-authorized when synchronized.
- School web **Academics → Assign Class Teacher** now manages real class/subject teaching assignments, including revocation, instead of example teacher names. Only active school administrators with Academics management access can use it. Each change is audited. Teachers do not grant themselves access.
- Dated diary with previous/next day and calendar selection. Subject teachers publish homework for assigned classes. Parents see homework for linked children and can mark “Completed at home.” This acknowledgement is not teacher grading. Publication errors retain the form; repeated identical publication IDs do not duplicate homework. Offline diary is labelled and cannot falsely save completion.
- Profile photo selection/change/removal for Parent/Teacher, persisted to the server. Images are resized by the client and bounded by the server; JPEG/PNG only, no external image URLs/SVG. Small self-service photos are stored in PostgreSQL, with tenant/user isolation and an audit entry. This is not a general file-upload service. Default is initials, not an unrelated person's photograph.
- Parent map uses the existing authorized Transporter feed and assigned stop. Invalid, future, cached/offline and older-than-120-second locations do not provide a live ETA. Foreground polling is bounded; it pauses in the background.
- Parent fee cards open native Razorpay Checkout from server-calculated amounts. Explicit surcharge confirmation; no payment offline queue; pending state survives app restart. Checkout callbacks do not mark invoices paid. Server/provider verification and webhook reconciliation remain authoritative. Pending orders block duplicate guardian attempts.

## Database and deployment prerequisites

New versioned migrations: `0015_teacher_assignments.sql`, `0016_lesson_attendance.sql`, `0017_mobile_diary_profiles.sql`. All are additive and have forced tenant RLS. Never run a demo seed or change production credentials for this release.

**Important rollback constraint:** the existing readiness check expects an exact migration manifest. After these migrations, an old image can report not-ready even though its old tables still exist. Do not use the earlier image-only automatic rollback script. Plan a short staging maintenance window; retain a fresh verified backup and the old image IDs. A failed migration/candidate requires investigation and a reviewed recovery/forward-fix decision, not a blind database restore or deletion of migration-ledger rows.

Deployment order:

1. Require all checks on the final feature-branch commit to pass. Review the PR before merging. Never interpret “no checks reported” as a pass.
2. Package the reviewed commit with `git archive`; record its SHA-256, transfer to the VPS, and verify it there. Use a new `/opt/hig-school-mobile-<short-sha>` directory. Copy protected staging env files from the current live release without printing secrets.
3. Build the app, worker and operator with a new immutable tag. Preserve current staging while building.
4. Create and validate a fresh staging database backup using the existing operator backup procedure. Verify staging environment/role protection. Review the migration check: only 0015–0017 should be pending if staging is still at the recorded September baseline. Stop on different or checksum-mismatched migrations.
5. During the agreed staging window, from the candidate release directory (with `STAGING_IMAGE_TAG` set to its new tag):

   ```bash
   docker compose -f deploy/hostinger-staging.compose.yml --profile operator run --rm operator npm run staging:migrate &&
   docker compose -f deploy/hostinger-staging.compose.yml --profile operator run --rm operator node --experimental-strip-types scripts/validate-mobile-candidate.ts &&
   docker compose -f deploy/hostinger-staging.compose.yml up -d --no-build app worker
   ```

   If any command fails, stop. Do not run the remaining commands. The runtime-table check verifies privileges and forced RLS; missing grants must be corrected by the migration administrator, not by giving the app an owner/superuser role.
6. Verify container health, shared worker heartbeat, public health/readiness, staging smoke and tenant isolation. Use the existing scripts; do not repeat login tests rapidly enough to trigger the login rate limit. Record exit codes, not only printed PASS text. The earlier bounded-load process did not always exit cleanly; an interrupted run is not a clean suite pass.
7. Sign in as the staging school administrator. Under **Academics → Assign Class Teacher**, assign the real test teacher to Grade 8 A as class teacher and separately to each subject taught. Add a second class/subject assignment if testing multi-class selection. Do not create unrestricted grants for all teachers. New diary starts with no entries; publish test homework through the teacher app. Legacy Study Center records remain in their original screen and are not silently reclassified as diary entries.

## Mac build and install

Run from the SCHOOL repository, on the exact reviewed commit. Replace `FULL_REVIEWED_SHA` with its full 40-character hash:

```bash
bash mobile/scripts/build_staging_candidate.sh FULL_REVIEWED_SHA
bash mobile/scripts/install_staging_candidate.sh FULL_REVIEWED_SHA
```

The first command analyzes/tests each app and builds three locally debug-signed staging APKs under `release/mobile-<12-character-sha>-local/`, with checksums. The second requires exactly one authorized device and checksums, then upgrades with `adb install -r`; it never uninstalls or clears data. Keep the Mac's existing debug signing key. CI APKs may use a different key and should not replace the locally signed build on the existing test phone.

No live payments are enabled by this script. Debug maps use attributed OpenStreetMap tiles for bounded testing. Store releases require an approved map provider, restricted public client configuration, signing and store review; do not ship the debug-map fallback as production.

## Final acceptance — still requires actual staging/device evidence

| Journey | Expected proof |
| --- | --- |
| Teacher daily register | Assigned classes only; dated all-present/exceptions; save/reopen; unsaved guard; revoked assignment rejected |
| Subject lesson | Select class, subject, period, date; save; daily register unchanged; other teacher/class rejected |
| Diary | Two teachers publish different subjects; parent changes dates and acknowledges correct child; another parent cannot see/write it |
| Profile | Choose/change/remove photo; restart/login preserves it; no overflow at larger text settings |
| Fees | Real Razorpay **sandbox** success, cancel, app restart, lost callback, delayed webhook, second guardian and reconciled balance; no double charge |
| Transport | Two devices, moving trip, lock screen, network loss/recovery, boarding/drop/SOS; stale marker clearly labelled; correct parent's stop only |
| Navigation | Every visible primary action opens its intended screen; no blanket assertion that every historical secondary ERP workflow is complete |

Outstanding external inputs: staging admin access/assignments, Razorpay sandbox configuration and reachable webhooks, two-device road test, production map/provider decisions, signed iOS/Android store builds, privacy/security and production cutover approvals. This candidate does not close those launch gates.

## Automated evidence

Local validation includes TypeScript/lint, server tests, dependency/secret/licence checks, Hostinger build/bundle validation, Flutter analysis and widget tests, and isolated PostgreSQL 17 migration/assignment/lesson/diary/RLS tests. CI reruns validation on the pushed commit. Existing server TODO tests and documented dependency/licence exceptions remain disclosed; they are not implementation passes. No live database changes or real charges were made by these tests.

Final local run: 401 server tests passed, 14 existing TODO tests; 4 staff and 6 parent Flutter tests passed. Dependency policy retains the documented image-size exception; one dependency requires machine-readable licence/SBOM review. Real device acceptance and Razorpay sandbox transactions are not covered by these counts.
