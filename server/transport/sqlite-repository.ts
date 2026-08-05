import type { MobileAuthenticatedPrincipal } from "../mobile-auth/types.ts";
import type { TransportAction } from "./validation.ts";
import type {
  DriverTransportSnapshot,
  TransportAdminSnapshot,
} from "./types.ts";

export async function loadDriverTransportSnapshot(
  _principal: MobileAuthenticatedPrincipal,
): Promise<DriverTransportSnapshot | null> {
  return null;
}

export async function listTransportAdminSnapshot(
  _tenantId: string,
): Promise<TransportAdminSnapshot> {
  return {
    drivers: [],
    vehicles: [],
    routes: [],
    stops: [],
    driverAssignments: [],
    studentAssignments: [],
    trips: [],
  };
}

export async function applyTransportAction(
  _tenantId: string,
  _action: TransportAction,
): Promise<Record<string, unknown>> {
  throw new Error("Transport master data requires the PostgreSQL backend");
}
