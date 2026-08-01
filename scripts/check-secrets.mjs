import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const patterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["GitHub token", /\bgh[opurs]_[A-Za-z0-9_]{30,}\b/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ["Stripe live secret", /\bsk_live_[A-Za-z0-9]{16,}\b/],
  ["Google API key", /\bAIza[A-Za-z0-9_-]{30,}\b/],
  ["generic assigned secret", /\b(?:api[_-]?key|client[_-]?secret|password|secret|token)\s*[:=]\s*["'][^"' \n]{20,}["']/i],
  ["static sales-demo credential", /(?:Company|School|Teacher|Student|Parent|Driver)@2026|demo_(?:company|school|staff|student|parent|driver)_2026/],
];

function trackedFiles() {
  try {
    return execFileSync("git", ["ls-files", "-z"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\0")
      .filter(Boolean);
  } catch {
    return execFileSync(
      "rg",
      [
        "--files",
        "-g", "!node_modules/**",
        "-g", "!release/**",
        "-g", "!dist/**",
        "-g", "!.next/**",
        "-g", "!.vinext/**",
        "-g", "!.wrangler/**",
        "-g", "!outputs/**",
        "-g", "!work/**",
        "-g", "!.data/**",
      ],
      { encoding: "utf8" },
    ).split("\n").filter(Boolean);
  }
}

const findings = [];

for (const file of trackedFiles()) {
  if (file === ".env.example" || file === ".env.staging.example" || file === "scripts/check-secrets.mjs" || file === "scripts/check-hostinger-bundle.mjs") {
    continue;
  }

  let value;
  try {
    value = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  if (value.includes("\0")) continue;

  for (const [name, pattern] of patterns) {
    if (pattern.test(value)) findings.push(`${file}: possible ${name}`);
  }
}

if (findings.length) {
  console.error("Secret scan failed:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log("Secret scan passed; no tracked real or static sales-demo secret was detected.");
