import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createServer } from "node:net";

const suffix = `${process.pid}-${Date.now()}`;
const image = `hig-school-hostinger-test:${suffix}`;
const container = `hig-school-hostinger-${suffix}`;
const volume = `hig-school-hostinger-data-${suffix}`;
const readinessTimeoutMs = 90_000;
const pollIntervalMs = 1_500;
const timings = {};

async function measured(label, operation) {
  const started = performance.now();
  const result = await operation();
  timings[label] = Math.round((performance.now() - started) * 100) / 100;
  console.log(`Stage 5 timing ${label}: ${timings[label]} ms`);
  return result;
}

function docker(args, options = {}) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error?.code === "ENOENT") throw new Error("Docker is required for the Hostinger container test.");
  if (result.status !== 0) {
    const detail = options.capture ? `${result.stdout}\n${result.stderr}`.trim() : "";
    throw new Error(`docker ${args.join(" ")} failed${detail ? `:\n${detail}` : ""}`);
  }
  return result.stdout?.trim() ?? "";
}

let diagnosticsPrinted = false;

function printDiagnostics() {
  if (diagnosticsPrinted || !containerCreated) return;
  diagnosticsPrinted = true;
  for (const [title, args] of [
    ["docker ps -a", ["ps", "-a"]],
    [`docker inspect ${container}`, ["inspect", container]],
    [`docker logs ${container}`, ["logs", container]],
  ]) {
    const result = spawnSync("docker", args, { encoding: "utf8" });
    console.error(`\n===== ${title} =====`);
    console.error(`${result.stdout ?? ""}${result.stderr ?? ""}`.trim() || "(no output)");
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function selectAvailableHostPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not select an available localhost port."));
        return;
      }
      const port = address.port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForDockerHealth(timeoutMs = readinessTimeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = "unknown";
  while (Date.now() < deadline) {
    const rawStatus = docker(
      ["inspect", "--format={{json .State.Health.Status}}", container],
      { capture: true },
    );
    lastStatus = JSON.parse(rawStatus);
    if (lastStatus === "healthy") return;
    if (lastStatus === "unhealthy") {
      printDiagnostics();
      throw new Error("Container health status became unhealthy.");
    }
    await delay(pollIntervalMs);
  }
  printDiagnostics();
  throw new Error(`Timed out after ${timeoutMs}ms waiting for Docker health; last status: ${lastStatus}.`);
}

function retryableFetchError(error) {
  const code = error?.cause?.code ?? error?.code;
  return code === "ECONNREFUSED"
    || code === "ECONNRESET"
    || code === "UND_ERR_SOCKET"
    || error?.name === "TimeoutError"
    || error?.name === "AbortError";
}

async function waitForHttpHealth(origin, timeoutMs = readinessTimeoutMs) {
  const url = `${origin}/api/v1/health`;
  const deadline = Date.now() + timeoutMs;
  let lastFailure = "no response";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (response.status === 200) {
        const body = await response.json();
        if (body.status !== "ok") throw new Error("Health endpoint returned an unexpected body.");
        return;
      }
      lastFailure = `HTTP ${response.status}`;
      await response.arrayBuffer();
      if (response.status !== 502 && response.status !== 503) {
        printDiagnostics();
        throw new Error(`GET ${url} returned non-retryable HTTP ${response.status}.`);
      }
    } catch (error) {
      if (!retryableFetchError(error)) throw error;
      lastFailure = error?.cause?.code ?? error?.code ?? error?.name ?? String(error);
    }
    await delay(pollIntervalMs);
  }

  printDiagnostics();
  throw new Error(`Timed out after ${timeoutMs}ms waiting for HTTP health; last failure: ${lastFailure}.`);
}

async function expectOk(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${init?.method ?? "GET"} ${url} returned HTTP ${response.status}`);
  return response;
}

let volumeCreated = false;
let containerCreated = false;

try {
  await measured("hostingerImageBuild", async () => docker(["build", "--tag", image, "."]));
  docker(["volume", "create", volume]);
  volumeCreated = true;
  const hostPort = await selectAvailableHostPort();
  let origin;
  await measured("hostingerContainerStartup", async () => {
    docker([
      "run", "--detach",
      "--name", container,
      "--mount", `source=${volume},target=/data`,
      "--publish", `127.0.0.1:${hostPort}:3000`,
      "--env", "HIG_DEPLOYMENT_ENV=sales-demo",
      "--env", "HIG_SALES_DEMO=true",
      image,
    ]);
    containerCreated = true;
    origin = `http://127.0.0.1:${hostPort}`;
    await waitForDockerHealth();
    await waitForHttpHealth(origin);
  });

  const persistenceTitle = `Container persistence ${suffix}`;
  await measured("hostingerSmokeTests", async () => {
    const login = await expectOk(`${origin}/login`);
    if (!(await login.text()).includes("Hig School")) throw new Error("Login page did not contain the Hig School identity.");
    await expectOk(`${origin}/api/v1/demo/action`, {
      method: "POST",
      headers: {
        authorization: "Bearer demo_school_2026",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "create_record",
        moduleKey: "Communicate",
        workflow: "Notice Board",
        title: persistenceTitle,
        description: "Created by the Hostinger container integration test.",
        recordDate: "2026-07-29",
        dueDate: null,
        amountPaise: null,
        assignee: "All users",
        priority: "normal",
      }),
    });
  });

  await measured("hostingerRestartPersistence", async () => {
    docker(["restart", container]);
    await waitForDockerHealth();
    await waitForHttpHealth(origin);
    const state = await expectOk(`${origin}/api/v1/demo/state`, {
      headers: { authorization: "Bearer demo_school_2026" },
    });
    const stateBody = await state.json();
    if (!stateBody.records?.some((record) => record.title === persistenceTitle)) {
      throw new Error("Demo mutation did not survive the container restart.");
    }
  });

  writeFileSync(
    "/tmp/hig-stage5-hostinger-timings.json",
    `${JSON.stringify(timings, null, 2)}\n`,
    { mode: 0o600 },
  );
  console.log("Hostinger image, health, login, and restart-persistence checks passed.");
} catch (error) {
  printDiagnostics();
  throw error;
} finally {
  if (containerCreated) spawnSync("docker", ["rm", "--force", container], { stdio: "ignore" });
  if (volumeCreated) spawnSync("docker", ["volume", "rm", "--force", volume], { stdio: "ignore" });
  spawnSync("docker", ["image", "rm", "--force", image], { stdio: "ignore" });
}
