import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("public privacy policy covers every mobile product and sensitive workflow", async () => {
  const policy = await readFile(new URL("app/privacy/page.tsx", root), "utf8");
  for (const required of [
    "HIGA Teacher",
    "HIGA Parent &amp; Student",
    "HIGA School Transport",
    "profile photos",
    "Razorpay",
    "precise location",
    "student information for targeted advertising",
    "info@higautomation.com",
  ]) assert.match(policy, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
});

test("public deletion page supports account and partial-data requests", async () => {
  const page = await readFile(new URL("app/account-deletion/page.tsx", root), "utf8");
  assert.match(page, /without reinstalling an app or signing in/i);
  assert.match(page, /profile photo/i);
  assert.match(page, /uninstalling alone does not delete school records/i);
  assert.match(page, /attendance and academic records/i);
  assert.match(page, /info@higautomation\.com/i);
});
