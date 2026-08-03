export type MobileDevicePlatform = "android" | "ios";
export type MobilePushProvider = "firebase" | "apns";

export type MobileDeviceRegistration = {
  id: string;
  tenantId: string;
  userId: string;
  mobileIdentityId: string | null;
  sessionId: string;
  platform: MobileDevicePlatform;
  provider: MobilePushProvider;
  appId: string;
  appVersion: string | null;
  status: "active" | "revoked";
  lastSeenAt: string;
};

export const mobileTransportEventTypes = [
  "trip_started",
  "trip_paused",
  "trip_completed",
  "location",
  "student_boarded",
  "student_dropped",
  "sos",
] as const;

export type MobileTransportEventType =
  (typeof mobileTransportEventTypes)[number];

export type MobileTransportEvent = {
  id: string;
  tenantId: string;
  mobileIdentityId: string;
  sessionId: string;
  tripId: string | null;
  studentId: string | null;
  eventType: MobileTransportEventType;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  speedKph: number | null;
  headingDegrees: number | null;
  capturedAt: string;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};
