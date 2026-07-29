import { env } from "cloudflare:workers";
import type { DatabaseAdapter } from "./database";

if (!env.DB) {
  throw new Error("Cloudflare D1 binding `DB` is unavailable.");
}

export const database = env.DB as unknown as DatabaseAdapter;
export type { DatabaseAdapter, DatabasePreparedStatement } from "./database";
