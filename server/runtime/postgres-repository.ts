import type { PoolClient } from "pg";
import type { ChatGPTUser } from "../../app/chatgpt-auth";

type IdRow = { id: string };

export async function ensurePostgresActor(
  client: PoolClient,
  actor: ChatGPTUser,
): Promise<string> {
  const result = await client.query<IdRow>(
    `INSERT INTO users (id, email, full_name, status, mfa_enabled)
     VALUES (gen_random_uuid(), $1, $2, 'active', true)
     ON CONFLICT ((lower(email))) DO UPDATE
       SET full_name = EXCLUDED.full_name,
           status = 'active',
           updated_at = now()
     RETURNING id`,
    [
      actor.email.trim().toLowerCase(),
      actor.fullName ?? actor.displayName,
    ],
  );
  const actorId = result.rows[0]?.id;
  if (!actorId) throw new Error("Actor could not be resolved");
  return actorId;
}

export async function requirePostgresSchool(
  client: PoolClient,
  tenantId: string,
): Promise<void> {
  const result = await client.query<IdRow>(
    `SELECT id
     FROM tenants
     WHERE id = $1
       AND status <> 'archived'
     LIMIT 1`,
    [tenantId],
  );
  if (!result.rows[0]) throw new Error("School not found");
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  ).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function timestampString(value: Date | string): string {
  return new Date(value).toISOString();
}

export function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function isPostgresUniqueViolation(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === "object"
    && "code" in error
    && error.code === "23505",
  );
}
