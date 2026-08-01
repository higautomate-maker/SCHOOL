import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "dist");
const forbidden = [
  "cloudflare:workers",
  "cloudflare:",
  "oai-authenticated-user-email",
  "oai-authenticated-user-full-name",
  "Teacher@2026",
  "Student@2026",
  "Parent@2026",
  "Driver@2026",
  "demo_staff_2026",
  "demo_student_2026",
  "demo_parent_2026",
  "demo_driver_2026",
];
const matches = [];

function scan(directory) {
  for (const name of readdirSync(directory)) {
    const path = resolve(directory, name);
    if (statSync(path).isDirectory()) {
      scan(path);
      continue;
    }
    const contents = readFileSync(path);
    if (contents.includes(0)) continue;
    const text = contents.toString("utf8");
    for (const token of forbidden) {
      if (text.includes(token)) matches.push(`${path.slice(root.length + 1)} contains ${token}`);
    }
  }
}

scan(root);
if (matches.length) {
  console.error("Hostinger bundle contains Cloudflare-only runtime references:");
  for (const match of matches) console.error(`- ${match}`);
  process.exit(1);
}

console.log("Hostinger bundle is free of Cloudflare runtime imports, legacy identity trust, and static demo credentials.");
