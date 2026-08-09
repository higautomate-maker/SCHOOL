import { repositoryBackend } from "../runtime/repository-backend.ts";
import type { MobileAuthenticatedPrincipal } from "../mobile-auth/types.ts";
import type {
  MobileDeviceRegistration,
  MobileTransportEvent,
  ParentTransportTrackingSnapshot,
} from "./types.ts";
import type {
  mobileDeviceRegistrationSchema,
  mobileTransportEventSchema,
} from "./validation.ts";
import type { z } from "zod";

export type RegisterMobileDeviceInput = z.infer<typeof mobileDeviceRegistrationSchema> & {
  tokenHash: string;
  tokenCiphertext: string;
};
export type RecordMobileTransportEventInput = z.infer<typeof mobileTransportEventSchema> & {
  idempotencyKey: string;
};

function implementation() {
  return repositoryBackend() === "postgres"
    ? import("./postgres-repository.ts")
    : import("./sqlite-repository.ts");
}

export async function registerMobileDevice(
  principal: MobileAuthenticatedPrincipal,
  input: RegisterMobileDeviceInput,
): Promise<MobileDeviceRegistration> {
  return (await implementation()).registerMobileDevice(principal, input);
}

export async function revokeMobileDevice(
  principal: MobileAuthenticatedPrincipal,
  tokenHash: string,
): Promise<boolean> {
  return (await implementation()).revokeMobileDevice(principal, tokenHash);
}

export async function recordMobileTransportEvent(
  principal: MobileAuthenticatedPrincipal,
  input: RecordMobileTransportEventInput,
): Promise<{ event: MobileTransportEvent; replayed: boolean }> {
  return (await implementation()).recordMobileTransportEvent(principal, input);
}

export async function listMobileTransportEvents(
  principal: MobileAuthenticatedPrincipal,
  limit = 50,
): Promise<MobileTransportEvent[]> {
  return (await implementation()).listMobileTransportEvents(principal, limit);
}

export async function loadParentTransportTracking(
  principal: MobileAuthenticatedPrincipal,
  studentIds: readonly string[],
): Promise<ParentTransportTrackingSnapshot> {
  return (await implementation()).loadParentTransportTracking(
    principal,
    studentIds,
  );
}
