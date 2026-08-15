// Staff self-attendance "punch" safeguards (PURE, security-critical).
//
// This module contains NO data access. It validates a staff punch attempt using
// server-trusted inputs so the future endpoint (see docs/proposals/STAFF_PUNCH.md)
// can enforce them consistently. All rejection reasons are safe, generic strings
// (no internal detail, no location leakage).

export type GeoPoint = { latitude: number; longitude: number };

export type Geofence = {
  center: GeoPoint;
  radiusMeters: number;
};

export type StaffPunchAttempt = {
  deviceLocation: GeoPoint | null;
  geofence: Geofence | null;
  // Epoch milliseconds. `serverTime` is authoritative; `deviceTime` is untrusted.
  deviceTimeMs: number | null;
  serverTimeMs: number;
  // Last recorded punch for this staff member today, if any.
  lastPunchType: "in" | "out" | null;
  requestedType: "in" | "out";
};

export type StaffPunchDecision = {
  accepted: boolean;
  reason: string;
  withinGeofence: boolean;
  distanceMeters: number | null;
  clockSkewSeconds: number | null;
};

// Maximum tolerated difference between the untrusted device clock and the
// authoritative server clock. Beyond this we reject to prevent spoofed times.
export const MAX_CLOCK_SKEW_SECONDS = 120;

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function evaluateStaffPunch(attempt: StaffPunchAttempt): StaffPunchDecision {
  const base: StaffPunchDecision = {
    accepted: false,
    reason: "",
    withinGeofence: false,
    distanceMeters: null,
    clockSkewSeconds: null,
  };

  // 1) Ordering: cannot punch the same state twice in a row.
  if (attempt.lastPunchType === attempt.requestedType) {
    return { ...base, reason: `You are already punched ${attempt.requestedType}.` };
  }
  if (attempt.requestedType === "out" && attempt.lastPunchType === null) {
    return { ...base, reason: "Please punch in before punching out." };
  }

  // 2) Device-clock skew (device time is untrusted).
  if (attempt.deviceTimeMs === null) {
    return { ...base, reason: "We couldn’t confirm your device time. Please try again." };
  }
  const skewSeconds = Math.round(Math.abs(attempt.serverTimeMs - attempt.deviceTimeMs) / 1000);
  if (skewSeconds > MAX_CLOCK_SKEW_SECONDS) {
    return {
      ...base,
      clockSkewSeconds: skewSeconds,
      reason: "Your device clock looks incorrect. Please enable automatic date & time and try again.",
    };
  }

  // 3) Geofence.
  if (!attempt.geofence || !attempt.deviceLocation) {
    return { ...base, clockSkewSeconds: skewSeconds, reason: "Location is required to record attendance." };
  }
  const distanceMeters = Math.round(haversineMeters(attempt.deviceLocation, attempt.geofence.center));
  const withinGeofence = distanceMeters <= attempt.geofence.radiusMeters;
  if (!withinGeofence) {
    return {
      ...base,
      clockSkewSeconds: skewSeconds,
      distanceMeters,
      reason: "You must be on the school premises to record attendance.",
    };
  }

  return {
    accepted: true,
    reason: "OK",
    withinGeofence: true,
    distanceMeters,
    clockSkewSeconds: skewSeconds,
  };
}
