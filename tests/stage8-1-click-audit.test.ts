import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Company portal exposes working sections and marks unavailable actions as disabled", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  assert.match(page, /type CompanySection = "Overview" \| "Schools" \| "Modules" \| "Access control"/);
  assert.match(page, /disabledReason: "Platform-wide billing/);
  assert.match(page, /disabledReason: "Platform-wide audit search/);
  assert.match(page, /active === "Schools"/);
  assert.match(page, /LIVE TENANT DATA/);
  assert.doesNotMatch(page, /Monthly revenue/);
  assert.doesNotMatch(page, /Sunrise Academy/);
  assert.doesNotMatch(page, /onClick=\{\(\) => setNotice\("HIG School support center is ready"\)\}/);
});

test("School portal has no known silent click handlers", () => {
  const page = readFileSync("app/school/page.tsx", "utf8");
  assert.doesNotMatch(page, /onClick=\{\(\)=>undefined\}/);
  assert.match(page, /activityFilter/);
  assert.match(page, /setActivityFilter\("Fees"\)/);
  assert.match(page, /Cross-session browsing is planned/);
  assert.match(page, /Result analytics requires the reporting aggregation API/);
});
