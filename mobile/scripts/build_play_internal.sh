#!/usr/bin/env bash
# Builds all three signed bundles for INTERNAL STAGING TESTING only.
# Never promote these bundles to production: API is intentionally staging.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EXPECTED="${1:?Pass the full reviewed Git commit SHA}"
BUILD_NUMBER="${2:?Pass a new Android versionCode greater than all previous uploads}"
BUILD_NAME="${3:?Pass the user-visible version, e.g. 1.0.0}"
[[ "$EXPECTED" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid commit SHA'; exit 1; }
[[ "$BUILD_NUMBER" =~ ^[1-9][0-9]{0,9}$ ]] || { echo 'Invalid versionCode'; exit 1; }
(( BUILD_NUMBER <= 2100000000 )) || { echo 'versionCode exceeds Android limit'; exit 1; }
[[ "$BUILD_NAME" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Version must be X.Y.Z'; exit 1; }
test "$(git -C "$REPO" rev-parse HEAD)" = "$EXPECTED"
test -z "$(git -C "$REPO" status --porcelain)" || {
  echo 'Review and commit outstanding changes before building.'; exit 1;
}
FLUTTER="${HIG_FLUTTER_BIN:-/Users/ankityadav/Develop/flutter/bin/flutter}"
test -x "$FLUTTER"
for APP in staff_admin_app student_parent_app driver_gps_app; do
  test -s "$REPO/mobile/$APP/android/key.properties" || {
    echo "Missing upload signing configuration for $APP"; exit 1;
  }
done

OUT="$REPO/release/play-internal-${EXPECTED:0:12}-$BUILD_NUMBER"
case "$OUT" in "$REPO"/release/play-internal-*) ;; *) exit 1 ;; esac
test ! -e "$OUT" || { echo 'Output exists. Do not overwrite a reviewed build.'; exit 1; }
mkdir -p "$REPO/release"
mkdir -m 700 "$OUT"

MAP_ARGS=()
if [ -n "${HIG_MAP_TILE_URL:-}" ]; then
  [[ "$HIG_MAP_TILE_URL" == https://* ]] || { echo 'Map URL must use HTTPS'; exit 1; }
  test -n "${HIG_MAP_ATTRIBUTION:-}"
  [[ "${HIG_MAP_ATTRIBUTION_URL:-}" == https://* ]] || { echo 'Attribution URL must use HTTPS'; exit 1; }
  MAP_ARGS+=("--dart-define=HIG_MAP_TILE_URL=$HIG_MAP_TILE_URL")
  MAP_ARGS+=("--dart-define=HIG_MAP_ATTRIBUTION=$HIG_MAP_ATTRIBUTION")
  MAP_ARGS+=("--dart-define=HIG_MAP_ATTRIBUTION_URL=$HIG_MAP_ATTRIBUTION_URL")
else
  echo 'WARNING: No map provider configured; vehicle map will show unavailable.'
fi

for APP in staff_admin_app student_parent_app driver_gps_app; do
  (
    cd "$REPO/mobile/$APP"
    "$FLUTTER" --suppress-analytics pub get
    git -C "$REPO" diff --exit-code -- "mobile/$APP/pubspec.lock" mobile/packages/hig_mobile_core/pubspec.lock
    "$FLUTTER" --suppress-analytics analyze
    if [ -d test ]; then "$FLUTTER" --suppress-analytics test; fi
    "$FLUTTER" --suppress-analytics build appbundle --release \
      --build-name="$BUILD_NAME" --build-number="$BUILD_NUMBER" \
      --dart-define=API_BASE_URL=https://staging-school.higaai.com \
      --dart-define=HIG_ENABLE_LIVE_PAYMENTS=false \
      ${MAP_ARGS[@]+"${MAP_ARGS[@]}"}
    test -s build/app/outputs/bundle/release/app-release.aab
    install -m 600 build/app/outputs/bundle/release/app-release.aab "$OUT/$APP.aab"
  )
done
test -z "$(git -C "$REPO" status --porcelain)" || {
  echo 'Build modified tracked source. Review before upload.'; exit 1;
}
(cd "$OUT" && shasum -a 256 staff_admin_app.aab student_parent_app.aab driver_gps_app.aab)
echo "SOURCE_COMMIT=$EXPECTED"
echo "VERSION=$BUILD_NAME+$BUILD_NUMBER"
echo "OUTPUT_DIRECTORY=$OUT"
echo 'INTERNAL STAGING ONLY. Do not promote these bundles to public production.'
