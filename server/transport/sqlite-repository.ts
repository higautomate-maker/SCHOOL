import type { MobileAuthenticatedPrincipal } from "../mobile-auth/types.ts";
import type { TransportAction } from "./validation.ts";
import type {
  DriverTransportSnapshot,
  TransportAdminSnapshot,
} from "./types.ts";

export async function loadDriverTransportSnapshot(
  principal: MobileAuthenticatedPrincipal,
): Promise<DriverTransportSnapshot | null> {
  void principal;
  return null;
}

export async function listTransportAdminSnapshot(
  tenantId: string,
): Promise<TransportAdminSnapshot> {
  void tenantId;
  return {
    drivers: [],
    vehicles: [],
    routes: [],
    stops: [],
    driverAssignments: [],
    studentAssignments: [],
    trips: [],
    staffUsers: [],
    latestLocations: [],
    recentEvents: [],
  };
}

export async function applyTransportAction(
  tenantId: string,
  action: TransportAction,
): Promise<Record<string, unknown>> {
  void tenantId;
  void action;
  throw new Error("Transport master data requires the PostgreSQL backend");
}
