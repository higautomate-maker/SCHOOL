import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repositoryFiles = [
  "db/index.ts",
  "server/operations/repository.ts",
  "server/students/repository.ts",
  "server/schools/management-repository.ts",
  "server/schools/repository.ts",
  "server/foundation/repository.ts",
  "server/access/repository.ts",
  "server/configuration/repository.ts",
  "server/workspace/repository.ts",
];

test("application repositories depend on the database contract, not Cloudflare runtime", () => {
  for (const file of repositoryFiles) {
    const source = readFileSync(resolve(file), "utf8");
    assert.doesNotMatch(source, /cloudflare:workers/);
    assert.match(source, /@db-runtime/);
  }
  assert.match(
    readFileSync(resolve("db/adapters/cloudflare-d1.ts"), "utf8"),
    /cloudflare:workers/,
  );
});

test("Node SQLite adapter migrates and persists across processes", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "hig-node-adapter-"));
  const databasePath = resolve(directory, "hig-school.sqlite");
  const environment = {
    ...process.env,
    HIG_RUNTIME: "node",
    HIG_DEMO_DB_PATH: databasePath,
    HIG_SQLITE_MIGRATIONS_PATH: resolve("drizzle"),
  };
  const execute = (source: string) => spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e", source],
    { cwd: process.cwd(), env: environment, encoding: "utf8" },
  );

  const write = execute(`
    const { database } = await import("./db/adapters/node-sqlite.ts");
    await database.prepare("CREATE TABLE adapter_persistence (value TEXT NOT NULL)").run();
    await database.prepare("INSERT INTO adapter_persistence (value) VALUES (?)").bind("survived").run();
  `);
  assert.equal(write.status, 0, write.stderr);

  const read = execute(`
    const { database } = await import("./db/adapters/node-sqlite.ts");
    const row = await database.prepare("SELECT value FROM adapter_persistence LIMIT 1").first();
    process.stdout.write(JSON.stringify(row));
  `);
  assert.equal(read.status, 0, read.stderr);
  assert.deepEqual(JSON.parse(read.stdout), { value: "survived" });
});
