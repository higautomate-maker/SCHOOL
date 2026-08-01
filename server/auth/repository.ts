import { repositoryBackend } from "../runtime/repository-backend.ts";
import type { AuthenticatedActor, SessionCreation } from "./types.ts";

export type LoginRecord = { userId: string; email: string; fullName: string; status: string; passwordHash: string; credentialVersion: number; disabled: boolean; eligible: boolean };
export type SessionMetadata = { ipHash: string | null; userAgentHash: string | null };

function implementation() {
  return repositoryBackend() === "postgres"
    ? import("./postgres-repository.ts")
    : import("./sqlite-repository.ts");
}

export async function findLoginRecord(email: string): Promise<LoginRecord | null> { return (await implementation()).findLoginRecord(email); }
export async function replacePassword(userId: string, passwordHash: string): Promise<void> { return (await implementation()).replacePassword(userId, passwordHash); }
export async function createSession(userId: string, credentialVersion: number, activeTenantId: string | null, metadata: SessionMetadata): Promise<SessionCreation> { return (await implementation()).createSession(userId, credentialVersion, activeTenantId, metadata); }
export async function resolveSession(token: string): Promise<AuthenticatedActor | null> { return (await implementation()).resolveSession(token); }
export async function rotateTenant(sessionId: string, userId: string, tenantId: string, metadata: SessionMetadata): Promise<SessionCreation> { return (await implementation()).rotateTenant(sessionId, userId, tenantId, metadata); }
export async function revokeSession(sessionId: string, reason: string): Promise<void> { return (await implementation()).revokeSession(sessionId, reason); }
export async function revokeUserSessions(userId: string, reason: string): Promise<void> { return (await implementation()).revokeUserSessions(userId, reason); }
export async function listSessions(userId: string): Promise<Array<{ id: string; issuedAt: string; lastSeenAt: string; current?: boolean }>> { return (await implementation()).listSessions(userId); }
export async function createReset(email: string, tokenHash: string, ipHash: string | null): Promise<{ userId: string; email: string } | null> { return (await implementation()).createReset(email, tokenHash, ipHash); }
export async function invalidateReset(tokenHash: string): Promise<void> { return (await implementation()).invalidateReset(tokenHash); }
export async function consumeReset(tokenHash: string, passwordHash: string, metadata: SessionMetadata = { ipHash: null, userAgentHash: null }): Promise<string | null> { return (await implementation()).consumeReset(tokenHash, passwordHash, metadata); }
export async function acceptInvitation(tokenHash: string, email: string, passwordHash: string, metadata: SessionMetadata = { ipHash: null, userAgentHash: null }): Promise<string | null> { return (await implementation()).acceptInvitation(tokenHash, email, passwordHash, metadata); }
export async function writeSecurityEvent(input: { tenantId?: string | null; actorId?: string | null; action: string; outcome: "success" | "failure"; ipHash?: string | null; metadata?: Record<string, unknown> }): Promise<void> { return (await implementation()).writeSecurityEvent(input); }
export async function bootstrapPlatformAdmin(input: { email: string; fullName: string; passwordHash: string }): Promise<void> { return (await implementation()).bootstrapPlatformAdmin(input); }
