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

test("Add New Class opens its dedicated tenant-scoped creation form", () => {
  const page = readFileSync("app/school/page.tsx", "utf8");
  assert.match(page, /onAddClass=\{\(\)=>setClassOpen\(true\)\}/);
  assert.match(page, /function ReferenceClassModal/);
  assert.match(page, /action:"create_class"/);
  assert.doesNotMatch(page, /onClick=\{onSettings\}>＋ Add New Class/);
});

test("Academic creation buttons open dedicated tenant-scoped forms", () => {
  const page = readFileSync("app/school/page.tsx", "utf8");
  const validation = readFileSync("server/foundation/validation.ts", "utf8");
  const postgres = readFileSync("server/foundation/postgres-repository.ts", "utf8");
  assert.match(page, /onAddSession=\{\(\)=>setSessionOpen\(true\)\}/);
  assert.match(page, /onAddSection=\{\(\)=>setSectionOpen\(true\)\}/);
  assert.match(page, /onAddSubject=\{\(\)=>setSubjectOpen\(true\)\}/);
  assert.match(page, /function ReferenceSessionModal/);
  assert.match(page, /function ReferenceSectionModal/);
  assert.match(page, /function ReferenceSubjectModal/);
  assert.match(page, /action:"create_session"/);
  assert.match(page, /action:"create_section"/);
  assert.match(page, /action:"create_subject"/);
  assert.match(validation, /z\.literal\("create_section"\)/);
  assert.match(postgres, /WHERE tenant_id = \$1[\s\S]*AND id = \$2[\s\S]*AND active = true/);
  assert.doesNotMatch(page, /action="Add New Session"[\s\S]{0,300}onAdd=\{onSettings\}/);
  assert.doesNotMatch(page, /action="Add New Section"[\s\S]{0,300}onAdd=\{onSettings\}/);
  assert.doesNotMatch(page, /action="Add New Subject"[\s\S]{0,300}onAdd=\{onSettings\}/);
});
