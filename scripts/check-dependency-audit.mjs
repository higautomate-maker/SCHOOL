import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const approvedException = {
  packages: {
    "image-size": "2.0.2",
    vinext: "0.0.50",
  },
  advisoryUrls: new Set([
    "https://github.com/advisories/GHSA-5p2g-fcmc-qvqq",
    "https://github.com/advisories/GHSA-w3rx-r6r6-pgpr",
  ]),
  vinextVia: new Set(["@vercel/og", "image-size"]),
  bracesAvailabilityRisk: {
    advisoryUrl: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
    packages: {
      braces: ["3.0.3"],
      micromatch: ["4.0.8"],
      "fast-glob": ["3.3.1", "3.3.3"],
      "vite-plugin-dynamic-import": ["1.6.0"],
      "vite-plugin-commonjs": ["0.10.4"],
      vinext: ["0.0.50"],
    },
    via: {
      braces: null,
      micromatch: ["braces"],
      "fast-glob": ["micromatch"],
      "vite-plugin-dynamic-import": ["fast-glob"],
      "vite-plugin-commonjs": ["vite-plugin-dynamic-import"],
      vinext: ["vite-plugin-commonjs"],
    },
  },
};

const args = process.argv.slice(2);
const auditFile = valueAfter("--audit-file");
const lockFile = valueAfter("--lock-file") || "package-lock.json";
const reportFile = process.env.HIG_DEPENDENCY_AUDIT_REPORT
  || "/tmp/hig-dependency-audit-policy.json";

let audit;
if (auditFile) {
  audit = JSON.parse(readFileSync(auditFile, "utf8"));
} else {
  const result = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    audit = JSON.parse(result.stdout);
  } catch {
    console.error("npm audit did not return a JSON advisory report.");
    process.exit(2);
  }
}

if (audit.error || audit.message) {
  console.error("npm audit advisory service is unavailable.");
  process.exit(2);
}

const lock = JSON.parse(readFileSync(lockFile, "utf8"));
const decision = evaluate(audit, lock);
writeFileSync(reportFile, `${JSON.stringify(decision, null, 2)}\n`, { mode: 0o600 });

if (!decision.passed) {
  console.error("Dependency audit policy failed.");
  for (const failure of decision.failures) console.error(`- ${failure}`);
  process.exit(1);
}

if (decision.approvedExceptions.length > 0) {
  console.log("Dependency audit passed with documented availability-risk exceptions.");
} else {
  console.log("Dependency audit passed with no high or critical findings.");
}
console.log(`Dependency audit policy report: ${reportFile}`);

function evaluate(report, packageLock) {
  const severe = Object.entries(report.vulnerabilities ?? {})
    .filter(([, finding]) => ["high", "critical"].includes(finding.severity));
  const failures = [];
  const approvedExceptions = [];

  for (const [name, finding] of severe) {
    if (name === "image-size" && approvedImageSizeFinding(finding, packageLock)) {
      approvedExceptions.push(name);
      continue;
    }
    if (name === "vinext" && approvedVinextFinding(finding, packageLock, report)) {
      approvedExceptions.push(name);
      continue;
    }
    if (approvedBracesChainFinding(name, finding, packageLock, report)) {
      approvedExceptions.push(name);
      continue;
    }
    failures.push(`${name}: unapproved ${finding.severity} dependency finding`);
  }

  return {
    passed: failures.length === 0,
    generatedAt: new Date().toISOString(),
    metadata: report.metadata,
    approvedExceptions,
    failures,
  };
}

function approvedBracesChainFinding(name, finding, packageLock, report) {
  const exception = approvedException.bracesAvailabilityRisk;
  if (!(name in exception.packages)) return false;
  if (finding.severity !== "high") return false;
  if (!sameValues(lockedVersions(packageLock, name), exception.packages[name])) {
    return false;
  }

  if (name === "braces") {
    if (finding.isDirect !== false) return false;
    const advisories = (finding.via ?? []).filter(
      (item) => item && typeof item === "object",
    );
    return advisories.length === 1
      && advisories[0].url === exception.advisoryUrl
      && advisories[0].severity === "high"
      && !(finding.via ?? []).some((item) => typeof item === "string");
  }

  if (name === "vinext" && finding.isDirect !== true) return false;
  if (name !== "vinext" && finding.isDirect !== false) return false;
  const expectedVia = exception.via[name];
  if (!sameValues(finding.via ?? [], expectedVia)) return false;
  return expectedVia.every(
    (dependency) => report.vulnerabilities?.[dependency]?.severity === "high",
  );
}

function approvedImageSizeFinding(finding, packageLock) {
  if (finding.severity !== "high" || finding.isDirect !== false) return false;
  if (lockedVersion(packageLock, "image-size") !== approvedException.packages["image-size"]) {
    return false;
  }
  const directAdvisories = (finding.via ?? []).filter(
    (item) => item && typeof item === "object",
  );
  if (directAdvisories.length !== approvedException.advisoryUrls.size) return false;
  if ((finding.via ?? []).some((item) => typeof item === "string")) return false;
  const urls = new Set(directAdvisories.map((item) => item.url));
  return urls.size === approvedException.advisoryUrls.size
    && [...approvedException.advisoryUrls].every((url) => urls.has(url));
}

function approvedVinextFinding(finding, packageLock, report) {
  if (finding.severity !== "high" || finding.isDirect !== true) return false;
  if (lockedVersion(packageLock, "vinext") !== approvedException.packages.vinext) {
    return false;
  }
  const via = new Set(finding.via ?? []);
  if (!via.has("image-size")) return false;
  if (![...via].every((name) => approvedException.vinextVia.has(name))) {
    return false;
  }
  return [...via]
    .filter((name) => name !== "image-size")
    .every((name) => !["high", "critical"].includes(
      report.vulnerabilities?.[name]?.severity,
    ));
}

function lockedVersion(packageLock, name) {
  return packageLock.packages?.[`node_modules/${name}`]?.version;
}

function lockedVersions(packageLock, name) {
  return Object.entries(packageLock.packages ?? {})
    .filter(([path]) => path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`))
    .map(([, value]) => value.version)
    .filter(Boolean)
    .sort();
}

function sameValues(actual, expected) {
  if (!Array.isArray(actual) || !Array.isArray(expected)) return false;
  const left = [...actual].sort();
  const right = [...expected].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}
