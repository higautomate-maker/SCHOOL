export type TransportStop = {
  id: string;
  name: string;
  sequence: number;
  latitude: number;
  longitude: number;
  pickupTime: string | null;
  dropTime: string | null;
  geofenceRadiusMeters: number;
  studentCount: number;
};

export type TransportStudent = {
  id: string;
  fullName: string;
  admissionNumber: string;
  className: string;
  sectionName: string;
  guardianName: string;
  guardianPhone: string;
  pickupStopId: string | null;
  pickupStopName: string | null;
  dropStopId: string | null;
  dropStopName: string | null;
};

export type DriverTransportSnapshot = {
  assignmentId: string;
  driver: {
    id: string;
    name: string;
    mobileNumber: string | null;
    licenseNumber: string;
  };
  vehicle: {
    id: string;
    number: string;
    registrationNumber: string;
    type: string;
    capacity: number;
  };
  route: {
    id: string;
    name: string;
    code: string;
    direction: string;
    shift: string;
  };
  trip: {
    id: string;
    serviceDate: string;
    direction: string;
    scheduledStartAt: string | null;
    status: string;
  } | null;
  stops: TransportStop[];
  students: TransportStudent[];
};

export type TransportAdminSnapshot = {
  staffUsers: Record<string, unknown>[];
  drivers: Record<string, unknown>[];
  vehicles: Record<string, unknown>[];
  routes: Record<string, unknown>[];
  stops: Record<string, unknown>[];
  driverAssignments: Record<string, unknown>[];
  studentAssignments: Record<string, unknown>[];
  trips: Record<string, unknown>[];
  latestLocations: Record<string, unknown>[];
  recentEvents: Record<string, unknown>[];
};
