import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../scripts/test-hostinger-container.mjs", import.meta.url),
  "utf8",
);

test("Hostinger harness waits for Docker and HTTP readiness before functional requests", () => {
  assert.match(source, /--format=\{\{json \.State\.Health\.Status\}\}/);
  assert.match(source, /const readinessTimeoutMs = 90_000/);
  assert.match(source, /const pollIntervalMs = 1_500/);
  assert.match(source, /ECONNREFUSED/);
  assert.match(source, /ECONNRESET/);
  assert.match(source, /response\.status !== 502 && response\.status !== 503/);
  assert.match(source, /server\.listen\(0, "127\.0\.0\.1"/);
  assert.match(source, /`127\.0\.0\.1:\$\{hostPort\}:3000`/);
  assert.doesNotMatch(source, /"127\.0\.0\.1::3000"/);
  assert.doesNotMatch(source, /\["port", container/);

  const dockerHealth = source.indexOf("await waitForDockerHealth();");
  const httpHealth = source.indexOf("await waitForHttpHealth(origin);");
  const login = source.indexOf("const login = await expectOk");
  assert.ok(dockerHealth > 0 && dockerHealth < httpHealth && httpHealth < login);
});

test("Hostinger harness prints diagnostics and always cleans up", () => {
  assert.match(source, /\["ps", "-a"\]/);
  assert.match(source, /\["inspect", container\]/);
  assert.match(source, /\["logs", container\]/);
  assert.match(source, /finally \{/);
  assert.match(source, /\["rm", "--force", container\]/);
  assert.match(source, /\["volume", "rm", "--force", volume\]/);
});
