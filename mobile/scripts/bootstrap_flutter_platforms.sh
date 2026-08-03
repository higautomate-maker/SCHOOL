#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
command -v flutter >/dev/null 2>&1 || { echo "Flutter is required. Install Flutter 3.24+ first."; exit 1; }

create_app() {
  local directory="$1"
  local bundle_id="$2"
  local location_mode="$3"
  local display_name="$4"
  local app_root="$ROOT/mobile/$directory"
  local backup
  backup="$(mktemp -d)"
  cp "$app_root/pubspec.yaml" "$backup/pubspec.yaml"
  cp "$app_root/lib/main.dart" "$backup/main.dart"

  (
    cd "$app_root"
    flutter create . --platforms=android,ios --org com.higautomation --overwrite
  )

  cp "$backup/pubspec.yaml" "$app_root/pubspec.yaml"
  cp "$backup/main.dart" "$app_root/lib/main.dart"
  rm -rf "$backup" "$app_root/test"

  python3 - "$app_root" "$bundle_id" "$location_mode" "$display_name" <<'PY'
from pathlib import Path
import html
import plistlib
import re
import sys

root = Path(sys.argv[1])
bundle_id = sys.argv[2]
location_mode = sys.argv[3]
display_name = sys.argv[4]
xml_display_name = html.escape(display_name, quote=True)

for gradle in [root / "android/app/build.gradle.kts", root / "android/app/build.gradle"]:
    if not gradle.exists():
        continue
    text = gradle.read_text()
    text = re.sub(r'namespace\s*=\s*"[^"]+"', f'namespace = "{bundle_id}"', text)
    text = re.sub(r'applicationId\s*=\s*"[^"]+"', f'applicationId = "{bundle_id}"', text)
    text = re.sub(r'applicationId\s+"[^"]+"', f'applicationId "{bundle_id}"', text)
    gradle.write_text(text)

manifest = root / "android/app/src/main/AndroidManifest.xml"
text = manifest.read_text()
text = re.sub(r'android:label="[^"]+"', f'android:label="{xml_display_name}"', text, count=1)
permissions = ['<uses-permission android:name="android.permission.INTERNET" />',
               '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />']
if location_mode == 'foreground':
    permissions += ['<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
                    '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />']
for permission in reversed(permissions):
    if permission not in text:
        text = text.replace('<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
                            '<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n    ' + permission,
                            1)
# Stage 9 must not request background location.
text = text.replace('<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />', '')
manifest.write_text(text)

plist_path = root / "ios/Runner/Info.plist"
with plist_path.open('rb') as handle:
    plist = plistlib.load(handle)
plist['CFBundleDisplayName'] = display_name
plist['CFBundleName'] = display_name
if location_mode == 'foreground':
    plist['NSLocationWhenInUseUsageDescription'] = 'Hig Driver uses location while an active trip is open.'
plist.pop('NSLocationAlwaysAndWhenInUseUsageDescription', None)
plist.pop('UIBackgroundModes', None)
with plist_path.open('wb') as handle:
    plistlib.dump(plist, handle, sort_keys=False)

project = root / "ios/Runner.xcodeproj/project.pbxproj"
project_text = project.read_text()
project_text = re.sub(r'PRODUCT_BUNDLE_IDENTIFIER = [^;]+;', f'PRODUCT_BUNDLE_IDENTIFIER = {bundle_id};', project_text)
project.write_text(project_text)
PY

  (cd "$app_root" && flutter pub get)
}

create_app "student_parent_app" "com.higautomation.higschool.studentparent" "none" "Hig Student & Parent"
create_app "staff_admin_app" "com.higautomation.higschool.staffadmin" "none" "Hig Staff & Admin"
create_app "driver_gps_app" "com.higautomation.higschool.driver" "foreground" "Hig Driver"

(cd "$ROOT/mobile/packages/hig_mobile_core" && flutter pub get)

echo "Flutter Android/iOS runners created. Firebase platform files and signing credentials remain external release inputs."
