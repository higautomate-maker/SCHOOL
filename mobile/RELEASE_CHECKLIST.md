# Stage 9 mobile release preparation

## Application identifiers

| Product | Android application ID / iOS bundle ID |
| --- | --- |
| Student & Parent | `com.higautomation.higschool.studentparent` |
| Staff & Admin | `com.higautomation.higschool.staffadmin` |
| Driver | `com.higautomation.higschool.driver` |

## Stage 9 acceptance

- [ ] Native runners generated using `mobile/scripts/bootstrap_flutter_platforms.sh`.
- [ ] `flutter analyze` and `flutter test` pass for the shared package and all three apps.
- [ ] Android debug APKs build for all apps.
- [ ] Unsigned iOS Simulator builds pass for all apps.
- [ ] Login, session restoration, refresh rotation, logout, and revoked-session behavior tested against staging.
- [ ] Parent/Student data is restricted to assigned students.
- [ ] Staff/Admin modules follow Company entitlements and School role permissions.
- [ ] Offline reads show cached data and queued writes replay with the original idempotency key.
- [ ] Push registration is tested after Firebase files and provider credentials are supplied.
- [ ] Driver tracking is foreground-only; no background-location permission is present.

## External signing inputs

- [ ] Google Play Console account and upload key.
- [ ] Apple Developer team, App Store Connect records, certificates/profiles, and privacy declarations.
- [ ] Firebase projects and platform configuration files.
- [ ] Final app icons, screenshots, descriptions, support URL, and privacy-policy URL.

Signed AAB/IPA production distribution cannot be completed without these account-owned credentials.
