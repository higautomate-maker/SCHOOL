import { z } from "zod";

const uuid = z.string().uuid();

export const transportActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_vehicle"),
    vehicleNumber: z.string().min(1).max(80),
    registrationNumber: z.string().min(1).max(80),
    vehicleType: z.string().min(1).max(50).default("school_bus"),
    capacity: z.number().int().min(1).max(200),
    gpsDeviceId: z.string().max(120).nullable().optional(),
  }),
  z.object({
    action: z.literal("create_driver"),
    userId: uuid,
    employeeCode: z.string().max(50).nullable().optional(),
    mobileNumber: z.string().max(30).nullable().optional(),
    licenseNumber: z.string().min(1).max(80),
    licenseExpiry: z.string().date().nullable().optional(),
  }),
  z.object({
    action: z.literal("create_route"),
    routeName: z.string().min(1).max(120),
    routeCode: z.string().min(1).max(40),
    direction: z.enum(["pickup", "drop", "both"]),
    shift: z.enum(["morning", "afternoon", "evening", "custom"]),
  }),
  z.object({
    action: z.literal("create_stop"),
    routeId: uuid,
    stopName: z.string().min(1).max(120),
    sequenceNumber: z.number().int().min(1),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    pickupTime: z.string().nullable().optional(),
    dropTime: z.string().nullable().optional(),
    geofenceRadiusMeters: z.number().int().min(25).max(5000).default(200),
  }),
  z.object({
    action: z.literal("assign_driver"),
    driverId: uuid,
    vehicleId: uuid,
    routeId: uuid,
    effectiveFrom: z.string().date(),
  }),
  z.object({
    action: z.literal("assign_student"),
    studentId: uuid,
    routeId: uuid,
    pickupStopId: uuid.nullable().optional(),
    dropStopId: uuid.nullable().optional(),
    effectiveFrom: z.string().date(),
  }),
  z.object({
    action: z.literal("schedule_trip"),
    driverAssignmentId: uuid,
    routeId: uuid,
    serviceDate: z.string().date(),
    direction: z.enum(["pickup", "drop"]),
    scheduledStartAt: z.string().datetime().nullable().optional(),
  }),
]);

export type TransportAction = z.infer<typeof transportActionSchema>;
