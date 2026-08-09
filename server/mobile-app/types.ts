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
  "stop_arrived",
  "stop_departed",
  "stop_approaching",
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
  stopId: string | null;
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

export type ParentTransportStop = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  geofenceRadiusMeters: number;
};

export type ParentTransportTrackingChild = {
  student: {
    id: string;
    fullName: string;
    admissionNumber: string;
  };
  route: {
    id: string;
    name: string;
    code: string;
  } | null;
  vehicle: {
    id: string;
    number: string;
    type: string;
  } | null;
  trip: {
    id: string;
    status: string;
    direction: string;
    serviceDate: string;
  } | null;
  pickupStop: ParentTransportStop | null;
  dropStop: ParentTransportStop | null;
  journey: {
    status: "waiting" | "boarded" | "dropped";
    capturedAt: string | null;
  } | null;
  live: {
    latitude: number;
    longitude: number;
    accuracyMeters: number | null;
    speedKph: number | null;
    capturedAt: string;
    freshness: "online" | "delayed" | "offline";
    ageSeconds: number;
    targetStopType: "pickup" | "drop";
    targetStop: ParentTransportStop | null;
    distanceToStopMeters: number | null;
    etaMinutes: number | null;
  } | null;
};

export type ParentTransportTrackingSnapshot = {
  generatedAt: string;
  children: ParentTransportTrackingChild[];
  privacy: {
    scope: "linked_students_only";
    locationHistoryExposed: false;
    driverContactExposed: false;
    activeTripLocationOnly: true;
  };
};
