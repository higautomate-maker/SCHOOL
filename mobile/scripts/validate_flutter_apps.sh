#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
command -v flutter >/dev/null 2>&1 || { echo "Flutter is required for mobile validation."; exit 1; }

projects=(
  "mobile/packages/hig_mobile_core"
  "mobile/student_parent_app"
  "mobile/staff_admin_app"
  "mobile/driver_gps_app"
)

for project in "${projects[@]}"; do
  echo "===== $project ====="
  (
    cd "$ROOT/$project"
    flutter pub get
    format_paths=(lib)
    if [ -d test ]; then format_paths+=(test); fi
    dart format --output=none --set-exit-if-changed "${format_paths[@]}"
    flutter analyze
    if [ -d test ]; then flutter test; fi
  )
done

for app in student_parent_app staff_admin_app driver_gps_app; do
  test -d "$ROOT/mobile/$app/android" || {
    echo "Native runners are missing. Run mobile/scripts/bootstrap_flutter_platforms.sh first."
    exit 1
  }
  (
    cd "$ROOT/mobile/$app"
    flutter build apk --debug \
      --dart-define=API_BASE_URL=https://staging.example.invalid \
      --dart-define=HIG_TENANT_ID=00000000-0000-4000-8000-000000000001
  )
done

if command -v xcodebuild >/dev/null 2>&1; then
  for app in student_parent_app staff_admin_app driver_gps_app; do
    (
      cd "$ROOT/mobile/$app"
      flutter build ios --simulator --no-codesign \
        --dart-define=API_BASE_URL=https://staging.example.invalid \
        --dart-define=HIG_TENANT_ID=00000000-0000-4000-8000-000000000001
    )
  done
else
  if [ "${HIG_REQUIRE_IOS_BUILD:-true}" = "true" ]; then
    echo "Xcode is required for Stage 9 iOS build acceptance."
    exit 1
  fi
  echo "Xcode not found; iOS Simulator builds skipped by explicit diagnostic override."
fi

echo "All required Flutter validation gates passed."
