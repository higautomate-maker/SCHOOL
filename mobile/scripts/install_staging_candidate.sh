#!/usr/bin/env bash
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EXPECTED="${1:?Pass the full reviewed Git commit SHA}"
[[ "$EXPECTED" =~ ^[0-9a-f]{40}$ ]] || exit 1
test "$(git -C "$REPO" rev-parse HEAD)" = "$EXPECTED"
OUT="$REPO/release/mobile-${EXPECTED:0:12}-local"
test -s "$OUT/SHA256SUMS"
(cd "$OUT" && shasum -a 256 -c SHA256SUMS)
ADB="${HIG_ADB_BIN:-/Users/ankityadav/Library/Android/sdk/platform-tools/adb}"
test -x "$ADB"
"$ADB" start-server
DEVICES="$("$ADB" devices)"
COUNT="$(printf '%s\n' "$DEVICES" | awk 'NR>1 && NF>=2 {n++} END {print n+0}')"
SERIAL="$(printf '%s\n' "$DEVICES" | awk 'NR>1 && $2=="device" {print $1}')"
test "$COUNT" = 1 && test -n "$SERIAL" || { echo 'Connect and authorize exactly one Android device.'; exit 1; }
for APP in staff_admin_app student_parent_app driver_gps_app; do
  if ! "$ADB" -s "$SERIAL" install -r "$OUT/$APP.apk"; then
    echo 'Install stopped. Do not uninstall or clear app data automatically. A signing mismatch requires a build with your existing local debug key.'
    exit 1
  fi
done
for PACKAGE in com.higautomation.higschool.staffadmin com.higautomation.higschool.studentparent com.higautomation.higschool.driver; do
  "$ADB" -s "$SERIAL" shell pm path "$PACKAGE"
done
echo "STAGING_ANDROID_APPS_INSTALLED=$EXPECTED"
