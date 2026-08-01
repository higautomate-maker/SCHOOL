import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const audit = spawnSync("npm", ["audit", "--json"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
let report;
try {
  report = JSON.parse(audit.stdout);
} catch {
  console.error("npm audit did not return a JSON advisory report.");
  process.exit(2);
}
if (report.error || report.message) {
  console.error("npm audit advisory service is unavailable.");
  process.exit(2);
}

const productionTree = spawnSync("npm", ["ls", "--omit=dev", "--all", "--json"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
if (productionTree.status !== 0 && !productionTree.stdout) {
  console.error("Production dependency tree could not be inspected.");
  process.exit(2);
}
const productionNames = new Set();
collectNames(JSON.parse(productionTree.stdout), productionNames);
const findings = Object.values(report.vulnerabilities ?? {}).map((finding) => ({
  package: finding.name,
  severity: finding.severity,
  direct: Boolean(finding.isDirect),
  productionReachable: productionNames.has(finding.name),
  vulnerableRange: finding.range,
  advisorySources: (finding.via ?? []).map((item) =>
    typeof item === "string"
      ? item
      : { source: item.source, title: item.title, url: item.url }),
  fixAvailable: finding.fixAvailable,
  recommendation: productionNames.has(finding.name)
    ? "Review and test the smallest compatible patched dependency before staging approval."
    : "Schedule the compatible development-tool update before Stage 12 unless CI exposure requires earlier action.",
}));
const output = {
  generatedAt: new Date().toISOString(),
  metadata: report.metadata,
  findings,
};
const outputPath = process.env.HIG_DEPENDENCY_AUDIT_REPORT
  || "/tmp/hig-stage6-dependency-audit.json";
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({
  findingCount: findings.length,
  productionReachable: findings.filter((item) => item.productionReachable).length,
  severities: report.metadata?.vulnerabilities ?? {},
  report: outputPath,
}));
if (findings.some(
  (item) => item.productionReachable && ["critical", "high"].includes(item.severity),
)) {
  console.error("Production-reachable high or critical dependency findings require review.");
  process.exitCode = 1;
} else {
  console.log("Dependency audit review completed without production-reachable high/critical findings.");
}

function collectNames(node, names) {
  for (const [name, dependency] of Object.entries(node.dependencies ?? {})) {
    names.add(name);
    collectNames(dependency, names);
  }
}
