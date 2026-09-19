# Google Play release readiness

Status (2026-09-19): preparation only. All three Play listings exist and remain
in Draft. No bundle has been uploaded. Production release setup and the Play
content declarations remain incomplete.

## Stable application identities

| App | Application ID | Play listing name | Play app ID |
| --- | --- | --- | --- |
| Staff / teacher | com.higautomation.higschool.staffadmin | HIGA Teacher | 4973865480914142225 |
| Student / parent | com.higautomation.higschool.studentparent | HIGA Parent & Student | 4975353407782747472 |
| Driver | com.higautomation.higschool.driver | HIGA School Transport | 4972821249674777041 |

Keep these application IDs for all later updates. Listing names are editable;
application IDs and signing identity must not be casually replaced.

## Signing preparation

Each app's Android release build now uses `signingConfigs.release`, never the
debug signing fallback. Separate local upload credentials were generated for
the three apps and must be preserved in an encrypted, off-machine backup.
Debug builds remain independent of upload credentials.

Create and securely back up an upload keystore, then supply an ignored
`mobile/<app>/android/key.properties` for each app:

```properties
storeFile=/absolute/private/path/to/upload-keystore.jks
storePassword=LOCAL_SECRET
keyAlias=upload
keyPassword=LOCAL_SECRET
```

Do not commit these files, paste passwords into chat, or put credentials in APKs.
Use restrictive file permissions and a secure backup outside the build machine.
Enroll each app in Play App Signing after the owner approves Google's terms.
Google's app-signing certificate may differ from both the upload and debug keys.
Existing locally installed debug APKs may require a one-time uninstall before
installing from Play; preserve unsynced work first. Later Play installs can update
in place using the preserved Play signing identity.

## Required before building a store candidate

- Verify the reviewed Git commit and successful checks; do not assume the current
  local branch has been merged. Current inspected HEAD: `9e611d1`.
- Confirm intended release track. Start with internal testing, then perform
  device acceptance before public production rollout.
- Confirm production API URL and matching server/migration deployment. Current
  app source defaults to staging; override `API_BASE_URL` explicitly.
- Configure `HIG_MAP_TILE_URL`, `HIG_MAP_ATTRIBUTION`, and
  `HIG_MAP_ATTRIBUTION_URL` with a provider approved for the actual expected load.
  Release builds do not use the debug public-tile fallback. Client credentials
  must be appropriately restricted; never embed a server secret.
- Explicitly decide `HIG_ENABLE_LIVE_PAYMENTS`; complete Razorpay test-mode
  verification before enabling live payments and verify server configuration.
- Keep internal test tenant configuration separate from public distribution.
- Verify installed Flutter/Android target SDK and native dependencies against
  the Play Console requirements in effect at upload time.

Build signed Android App Bundles (AAB), not the existing debug APKs, with explicit
`--build-name` and `--build-number`. Use the approved build-time configuration for
each app; do not run a generic default build that silently selects staging.

## Store submission inputs and acceptance

Internal-staging build helper: after upload credentials are configured and code
reviewed/committed, run `bash mobile/scripts/build_play_internal.sh FULL_SHA CODE VERSION`.
It validates all apps and builds three release AABs with an explicit staging API
and live payments disabled. It does not upload, install or promote anything.
The helper's syntax and signing setup were checked; the teacher AAB has been
signed locally. A clean reviewed commit is still required before the three-app
internal bundle set is built.
Choose CODE above every prior upload, including internal tracks. Configure the
map environment variables described above to test maps; otherwise the build
prints a warning and the release UI reports the map unavailable.

Production helper: after the production server, privacy page, deletion page,
approved map provider and payment decision are live, set the three map variables
plus `HIG_ENABLE_LIVE_PAYMENTS=true` or `false`, then run
`bash mobile/scripts/build_play_production.sh FULL_SHA CODE VERSION`. The helper
refuses a dirty tree or unavailable production endpoint, validates every app,
and produces checksummed AABs. It does not upload or publish them.

- Public privacy-policy URL, public support contact and accurate store descriptions.
- Screenshots from the actual released UI, app icons and feature graphics.
- Data Safety answers verified against source, SDKs and server behaviour; student
  data, photos, authentication, payments and precise driver location need review.
- Target audience and content-rating questionnaires; do not assume an app used by
  students is adults-only. Check applicable children/families requirements.
- Reviewer access instructions and stable, synthetic-data demo accounts for all
  gated roles. Do not supply real pupils' records or production credentials.
- Account/data deletion requirements evaluated against the actual account flows,
  with the required in-app and public request mechanisms where applicable.
- Driver location permission/foreground-service declarations and prominent
  disclosure verified against the final merged Android manifest and runtime UX.
  Test an active trip with the screen locked and with network/location loss.
- Owner approval for Developer Program Policies, Play App Signing terms and
  export declarations. Do not certify compliance merely to create a listing.
- Internal-track acceptance for teacher class/subject attendance, homework,
  parent diary dates/completion, notices, photo persistence, payments and transport.

## How future updates reach users

1. Review, test and merge changes; select the exact release commit.
2. Increment Android versionCode (`--build-number`) above every previously
   uploaded code for that app; do not reuse a code across its release tracks.
3. Build with the same app ID and upload-signing credentials; retain Play App Signing.
4. Upload the AAB to the same Play listing, test it, then submit/promote for review
   and rollout. Verify the Play Console reports the intended release available.
5. Eligible users see Update in Google Play. Auto-install depends on their Play
   settings, device eligibility and rollout availability. A GitHub push alone does
   not release an update. A separate in-app update prompt is optional future work.

No unattended public publishing has been configured. Keep a human production
approval gate even if build/upload automation is added later.

## Official references

- https://docs.flutter.dev/deployment/android
- https://support.google.com/googleplay/android-developer/answer/9859350
- https://support.google.com/googleplay/android-developer/answer/9842756
- https://support.google.com/googleplay/android-developer/answer/10144311
