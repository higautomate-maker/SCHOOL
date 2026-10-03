import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const approvedAudit = {
  metadata: { vulnerabilities: { high: 2 } },
  vulnerabilities: {
    "image-size": {
      severity: "high",
      isDirect: false,
      via: [
        { url: "https://github.com/advisories/GHSA-w3rx-r6r6-pgpr" },
        { url: "https://github.com/advisories/GHSA-5p2g-fcmc-qvqq" },
      ],
    },
    "@vercel/og": { severity: "moderate", isDirect: false, via: ["satori"] },
    vinext: {
      severity: "high",
      isDirect: true,
      via: ["@vercel/og", "image-size"],
    },
  },
};

const approvedLock = {
  packages: {
    "node_modules/image-size": { version: "2.0.2" },
    "node_modules/vinext": { version: "0.0.50" },
  },
};

const bracesChainAudit = {
  metadata: { vulnerabilities: { high: 6 } },
  vulnerabilities: {
    braces: {
      severity: "high",
      isDirect: false,
      via: [{
        url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
        severity: "high",
      }],
    },
    micromatch: { severity: "high", isDirect: false, via: ["braces"] },
    "fast-glob": { severity: "high", isDirect: false, via: ["micromatch"] },
    "vite-plugin-dynamic-import": {
      severity: "high",
      isDirect: false,
      via: ["fast-glob"],
    },
    "vite-plugin-commonjs": {
      severity: "high",
      isDirect: false,
      via: ["vite-plugin-dynamic-import"],
    },
    vinext: { severity: "high", isDirect: true, via: ["vite-plugin-commonjs"] },
  },
};

const bracesChainLock = {
  packages: {
    "node_modules/braces": { version: "3.0.3" },
    "node_modules/micromatch": { version: "4.0.8" },
    "node_modules/fast-glob": { version: "3.3.1" },
    "node_modules/vite-plugin-dynamic-import/node_modules/fast-glob": { version: "3.3.3" },
    "node_modules/vite-plugin-dynamic-import": { version: "1.6.0" },
    "node_modules/vite-plugin-commonjs": { version: "0.10.4" },
    "node_modules/vinext": { version: "0.0.50" },
  },
};

test("dependency audit policy accepts only the documented upstream exception", () => {
  const result = runPolicy(approvedAudit, approvedLock);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.report.approvedExceptions.sort(), ["image-size", "vinext"]);
});

test("dependency audit policy accepts npm's compact vinext dependency path", () => {
  const audit = structuredClone(approvedAudit);
  audit.vulnerabilities.vinext.via = ["image-size"];
  const result = runPolicy(audit, approvedLock);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.report.approvedExceptions.sort(), ["image-size", "vinext"]);
});

test("dependency audit policy rejects another high-severity finding", () => {
  const audit = structuredClone(approvedAudit);
  const vulnerabilities = audit.vulnerabilities as Record<string, unknown>;
  vulnerabilities["unexpected-package"] = {
    severity: "high",
    via: [{ url: "https://github.com/advisories/GHSA-xxxx-xxxx-xxxx" }],
  };
  const result = runPolicy(audit, approvedLock);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unexpected-package/);
});

test("dependency audit policy rejects an advisory-set change", () => {
  const audit = structuredClone(approvedAudit);
  audit.vulnerabilities["image-size"].via.pop();
  const result = runPolicy(audit, approvedLock);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /image-size/);
});

test("dependency audit policy rejects a new severe vinext path", () => {
  const audit = structuredClone(approvedAudit);
  audit.vulnerabilities["@vercel/og"].severity = "high";
  const result = runPolicy(audit, approvedLock);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /@vercel\/og/);
  assert.match(result.stderr, /vinext/);
});

test("dependency audit policy rejects locked-version drift", () => {
  const lock = structuredClone(approvedLock);
  lock.packages["node_modules/image-size"].version = "2.0.3";
  const result = runPolicy(approvedAudit, lock);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /image-size/);
});

test("dependency audit policy rejects severity escalation", () => {
  const audit = structuredClone(approvedAudit);
  audit.vulnerabilities["image-size"].severity = "critical";
  const result = runPolicy(audit, approvedLock);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /image-size/);
});

test("dependency audit policy accepts the pinned braces build-time chain", () => {
  const result = runPolicy(bracesChainAudit, bracesChainLock);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.report.approvedExceptions.sort(), [
    "braces",
    "fast-glob",
    "micromatch",
    "vinext",
    "vite-plugin-commonjs",
    "vite-plugin-dynamic-import",
  ]);
});

test("dependency audit policy rejects braces advisory drift", () => {
  const audit = structuredClone(bracesChainAudit);
  audit.vulnerabilities.braces.via[0].url = "https://github.com/advisories/GHSA-new";
  const result = runPolicy(audit, bracesChainLock);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /braces/);
});

test("dependency audit policy rejects braces-chain version drift", () => {
  const lock = structuredClone(bracesChainLock);
  lock.packages["node_modules/braces"].version = "3.0.4";
  const result = runPolicy(bracesChainAudit, lock);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /braces/);
});

test("dependency audit policy rejects an unexpected braces-chain path", () => {
  const audit = structuredClone(bracesChainAudit);
  audit.vulnerabilities.vinext.via.push("unexpected-package");
  const result = runPolicy(audit, bracesChainLock);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /vinext/);
});

function runPolicy(audit: object, lock: object) {
  const directory = mkdtempSync(join(tmpdir(), "hig-audit-policy-"));
  const auditFile = join(directory, "audit.json");
  const lockFile = join(directory, "package-lock.json");
  const reportFile = join(directory, "policy.json");
  writeFileSync(auditFile, JSON.stringify(audit));
  writeFileSync(lockFile, JSON.stringify(lock));
  const result = spawnSync(
    process.execPath,
    ["scripts/check-dependency-audit.mjs", "--audit-file", auditFile, "--lock-file", lockFile],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, HIG_DEPENDENCY_AUDIT_REPORT: reportFile },
    },
  );
  return {
    ...result,
    report: JSON.parse(readFileSync(reportFile, "utf8")),
  };
}
