import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Parent phone audit uses a separate package only with the explicit build flag", () => {
  const gradle = readFileSync("mobile/student_parent_app/android/app/build.gradle.kts", "utf8");
  const manifest = readFileSync("mobile/student_parent_app/android/app/src/main/AndroidManifest.xml", "utf8");
  assert.match(gradle, /applicationId = "com\.higautomation\.higschool\.studentparent"/);
  assert.match(gradle, /System\.getenv\("HIG_ANDROID_AUDIT_BUILD"\) == "true"/);
  assert.match(gradle, /applicationIdSuffix = "\.audit"/);
  assert.match(gradle, /manifestPlaceholders\["higAppLabel"\] = "HIGA Parent Test"/);
  assert.match(manifest, /android:label="\$\{higAppLabel\}"/);
});
