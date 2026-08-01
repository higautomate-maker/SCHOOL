import { validateStagingEnvironment } from "../server/runtime/staging-environment.ts";

validateStagingEnvironment(process.env);
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
  process.env.HIG_LOAD_TENANT_ID ?? "",
)) {
  throw new Error("HIG_LOAD_TENANT_ID must identify the synthetic staging school");
}
await import("./test-postgres-load.ts");
console.log("Staging-safe bounded load and concurrency rehearsal passed.");
