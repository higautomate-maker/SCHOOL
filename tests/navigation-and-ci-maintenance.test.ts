import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("authentication navigation uses the Next router instead of a document reload", () => {
  for (const path of [
    "app/login/page.tsx",
    "app/components/logout-button.tsx",
    "app/components/demo-logout-button.tsx",
  ]) {
    const contents = source(path);
    assert.match(contents, /useRouter/);
    assert.match(contents, /router\.(replace|push)\(/);
    assert.doesNotMatch(contents, /location\.assign\(/);
  }
});

test("GitHub workflows use Node 24 compatible official action majors", () => {
  for (const path of [
    ".github/workflows/ci.yml",
    ".github/workflows/security.yml",
    ".github/workflows/mobile-apk.yml",
  ]) {
    const contents = source(path);
    assert.doesNotMatch(contents, /actions\/checkout@v[1-4]\b/);
    assert.doesNotMatch(contents, /actions\/setup-node@v[1-4]\b/);
    assert.doesNotMatch(contents, /actions\/setup-java@v[1-4]\b/);
  }

  assert.match(source(".github/workflows/ci.yml"), /actions\/checkout@v7/);
  assert.match(source(".github/workflows/ci.yml"), /actions\/setup-node@v7/);
  assert.match(source(".github/workflows/mobile-apk.yml"), /actions\/setup-java@v6/);
});
