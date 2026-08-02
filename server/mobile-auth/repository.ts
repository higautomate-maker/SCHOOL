import {
  repositoryBackend,
} from "../runtime/repository-backend.ts";
import type {
  MobileAssignment,
  MobileAuthenticatedPrincipal,
  MobileLoginRecord,
  MobilePrincipalType,
  MobileRefreshResult,
  MobileSessionCreation,
  MobileSessionMetadata,
} from "./types.ts";

export type FindMobileLoginInput = {
  email: string;
  tenantId: string;
  principalType: MobilePrincipalType;
};

export type CreateMobileSessionInput = {
  login: MobileLoginRecord;
  metadata: MobileSessionMetadata;
  issuedAt?: Date;
};

function implementation() {
  if (repositoryBackend() === "postgres") {
    throw new Error(
      "Mobile PostgreSQL repository is not implemented",
    );
  }

  return import("./sqlite-repository.ts");
}

export async function findMobileLoginRecord(
  input: FindMobileLoginInput,
): Promise<MobileLoginRecord | null> {
  return (await implementation())
    .findMobileLoginRecord(input);
}

export async function createMobileSession(
  input: CreateMobileSessionInput,
): Promise<MobileSessionCreation> {
  return (await implementation())
    .createMobileSession(input);
}

export async function resolveMobileAccessToken(
  accessToken: string,
): Promise<MobileAuthenticatedPrincipal | null> {
  return (await implementation())
    .resolveMobileAccessToken(accessToken);
}

export async function rotateMobileRefreshToken(
  refreshToken: string,
  metadata: MobileSessionMetadata,
): Promise<MobileRefreshResult> {
  return (await implementation())
    .rotateMobileRefreshToken(refreshToken, metadata);
}

export async function revokeMobileSession(
  sessionId: string,
  reason: string,
): Promise<void> {
  return (await implementation())
    .revokeMobileSession(sessionId, reason);
}

export async function revokeMobileSessionByAccessToken(
  accessToken: string,
  reason: string,
): Promise<void> {
  return (await implementation())
    .revokeMobileSessionByAccessToken(accessToken, reason);
}

export async function revokeMobileUserSessions(
  userId: string,
  reason: string,
): Promise<void> {
  return (await implementation())
    .revokeMobileUserSessions(userId, reason);
}

export async function listActiveMobileAssignments(
  tenantId: string,
  mobileIdentityId: string,
): Promise<MobileAssignment[]> {
  return (await implementation())
    .listActiveMobileAssignments(
      tenantId,
      mobileIdentityId,
    );
}
