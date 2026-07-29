import { execFileSync } from "node:child_process";

const output = execFileSync("npm", ["query", "*", "--json"], {
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024,
});
const packages = JSON.parse(output);
const denied = /(?:^|[\s(])(?:AGPL(?:-|\s|$)|SSPL(?:-|\s|$)|BUSL(?:-|\s|$)|GPL-(?:1|2|3)\.0(?:-only)?(?:\s|$|\)))/i;
const findings = [];
const unknown = [];

for (const dependency of packages) {
  const name = `${dependency.name ?? "unknown"}@${dependency.version ?? "unknown"}`;
  const license = typeof dependency.license === "string" ? dependency.license : "";
  if (!license) unknown.push(name);
  if (denied.test(license)) findings.push(`${name}: ${license}`);
}

if (findings.length) {
  console.error("Dependency license policy failed:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`License policy passed for ${packages.length} installed dependency records.`);
if (unknown.length) {
  console.warn(`${unknown.length} records did not declare a machine-readable license and require SBOM review.`);
}
