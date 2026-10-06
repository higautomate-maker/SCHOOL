import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

for (const [directory, packageName, testLabel] of [
  ["student_parent_app", "studentparent", "HIGA Parent Test"],
  ["staff_admin_app", "staffadmin", "HIGA Teacher Test"],
  ["driver_gps_app", "driver", "HIGA Transport Test"],
] as const) {
  test(`${directory} phone audit uses a separate package only with the explicit build flag`, () => {
    const gradle = readFileSync(`mobile/${directory}/android/app/build.gradle.kts`, "utf8");
    const manifest = readFileSync(`mobile/${directory}/android/app/src/main/AndroidManifest.xml`, "utf8");
    assert.ok(gradle.includes(`applicationId = "com.higautomation.higschool.${packageName}"`));
    assert.match(gradle, /System\.getenv\("HIG_ANDROID_AUDIT_BUILD"\) == "true"/);
    assert.match(gradle, /applicationIdSuffix = "\.audit"/);
    assert.ok(gradle.includes(`manifestPlaceholders["higAppLabel"] = "${testLabel}"`));
    assert.match(manifest, /android:label="\$\{higAppLabel\}"/);
  });
}
