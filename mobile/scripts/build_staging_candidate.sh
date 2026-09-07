#!/usr/bin/env bash
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EXPECTED="${1:?Pass the full reviewed Git commit SHA}"
[[ "$EXPECTED" =~ ^[0-9a-f]{40}$ ]] || { echo 'Expected a full 40-character commit SHA'; exit 1; }
test "$(git -C "$REPO" rev-parse HEAD)" = "$EXPECTED"
test -z "$(git -C "$REPO" status --porcelain)" || { echo 'Commit or review outstanding changes before building.'; exit 1; }
FLUTTER="${HIG_FLUTTER_BIN:-/Users/ankityadav/Develop/flutter/bin/flutter}"
test -x "$FLUTTER"
OUT="$REPO/release/mobile-${EXPECTED:0:12}-local"
test ! -e "$OUT" || { echo "Output already exists: $OUT. Keep it; do not overwrite a reviewed build."; exit 1; }
mkdir -p "$REPO/release"
mkdir -m 700 "$OUT"

for APP in staff_admin_app student_parent_app driver_gps_app; do
  (
    cd "$REPO/mobile/$APP"
    "$FLUTTER" --suppress-analytics pub get
    git -C "$REPO" diff --exit-code -- "mobile/$APP/pubspec.lock" mobile/packages/hig_mobile_core/pubspec.lock
    "$FLUTTER" --suppress-analytics analyze
    if [ -d test ]; then "$FLUTTER" --suppress-analytics test; fi
    "$FLUTTER" --suppress-analytics build apk --debug \
      --dart-define=API_BASE_URL=https://staging-school.higaai.com \
      --dart-define=HIG_TENANT_ID=1c602856-3fec-486f-b18d-a791f124b206 \
      --dart-define=HIG_ENABLE_LIVE_PAYMENTS=false
    test -s build/app/outputs/flutter-apk/app-debug.apk
    install -m 600 build/app/outputs/flutter-apk/app-debug.apk "$OUT/$APP.apk"
  )
done
(cd "$OUT" && shasum -a 256 staff_admin_app.apk student_parent_app.apk driver_gps_app.apk > SHA256SUMS)
echo "STAGING_APKS_BUILT_FROM=$EXPECTED"
echo "OUTPUT_DIRECTORY=$OUT"
echo 'Install only after the matching server release and migrations are deployed to staging.'
