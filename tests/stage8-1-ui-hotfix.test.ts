import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { permissionAllowedByModuleEntitlements } from "../server/access/catalogue.ts";

test("Company policy cards expose a real full-card input hit target",()=>{
  const css=readFileSync("app/globals.css","utf8");
  assert.match(css,/\.toggle-list input \{ position:absolute; inset:0; z-index:2; width:100%; height:100%/);
  assert.match(css,/\.policy-module input\{position:absolute;inset:0;z-index:2;width:100%;height:100%/);
  assert.match(css,/\.app-policy input\{position:absolute;inset:0;z-index:2;width:100%;height:100%/);
  assert.doesNotMatch(css,/\.policy-module input\{position:absolute;opacity:0;pointer-events:none\}/);
});

test("School portal refreshes entitlements and enforces changed direct routes",()=>{
  const page=readFileSync("app/school/page.tsx","utf8");
  assert.match(page,/loadSchoolAccess=useCallback/);
  assert.match(page,/setTimeout\(\(\)=>\{void loadSchoolAccess\(\);\},0\)/);
  assert.doesNotMatch(page,/useEffect\(\(\)=>\{void loadSchoolAccess\(\);\},\[loadSchoolAccess\]\)/);
  assert.match(page,/addEventListener\("focus",refresh\)/);
  assert.match(page,/addEventListener\("visibilitychange",visibility\)/);
  assert.match(page,/setInterval\(refresh,15000\)/);
  assert.match(page,/history\.replaceState\(\{\},"","\/school\/dashboard"\)/);
});

test("Role editor requires password step-up and Company-enabled permissions",()=>{
  const page=readFileSync("app/school/page.tsx","utf8");
  const route=readFileSync("app/api/v1/schools/[schoolId]/roles/route.ts","utf8");
  assert.match(page,/Current administrator password/);
  assert.match(page,/permissionAllowedByModuleEntitlements/);
  assert.match(route,/verifyPassword/);
  assert.match(route,/auth\.step_up\.role_management/);
});

test("permission boundary maps role grants to Company modules",()=>{
  const enabled=new Set(["student_information","access_control"]);
  assert.equal(permissionAllowedByModuleEntitlements("students.view",enabled),true);
  assert.equal(permissionAllowedByModuleEntitlements("roles.manage",enabled),true);
  assert.equal(permissionAllowedByModuleEntitlements("fees.collect",enabled),false);
  assert.equal(permissionAllowedByModuleEntitlements("workspace.view",enabled),true);
});
