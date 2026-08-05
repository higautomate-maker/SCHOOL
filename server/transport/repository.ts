import { repositoryBackend } from "../runtime/repository-backend.ts";
import type { MobileAuthenticatedPrincipal } from "../mobile-auth/types.ts";
import type { TransportAction } from "./validation.ts";
import type {
  DriverTransportSnapshot,
  TransportAdminSnapshot,
} from "./types.ts";

function implementation() {
  return repositoryBackend() === "postgres"
    ? import("./postgres-repository.ts")
    : import("./sqlite-repository.ts");
}

export async function loadDriverTransportSnapshot(
  principal: MobileAuthenticatedPrincipal,
): Promise<DriverTransportSnapshot | null> {
  return (await implementation()).loadDriverTransportSnapshot(principal);
}

export async function listTransportAdminSnapshot(
  tenantId: string,
): Promise<TransportAdminSnapshot> {
  return (await implementation()).listTransportAdminSnapshot(tenantId);
}

export async function applyTransportAction(
  tenantId: string,
  action: TransportAction,
): Promise<Record<string, unknown>> {
  return (await implementation()).applyTransportAction(tenantId, action);
}
