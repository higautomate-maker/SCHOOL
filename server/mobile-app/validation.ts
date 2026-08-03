import { z } from "zod";
import { mobileTransportEventTypes } from "./types.ts";

export const mobileDeviceRegistrationSchema = z.object({
  platform: z.enum(["android", "ios"]),
  provider: z.enum(["firebase", "apns"]),
  token: z.string().trim().min(20).max(4096),
  appId: z.string().trim().min(3).max(200),
  appVersion: z.string().trim().min(1).max(64).nullable().optional(),
}).strict();

export const mobileTransportEventSchema = z.object({
  eventType: z.enum(mobileTransportEventTypes),
  tripId: z.string().uuid().nullable().optional(),
  studentId: z.string().uuid().nullable().optional(),
  latitude: z.number().finite().min(-90).max(90).nullable().optional(),
  longitude: z.number().finite().min(-180).max(180).nullable().optional(),
  accuracyMeters: z.number().finite().min(0).max(10000).nullable().optional(),
  speedKph: z.number().finite().min(0).max(400).nullable().optional(),
  headingDegrees: z.number().finite().min(0).max(360).nullable().optional(),
  capturedAt: z.string().datetime({ offset: true }),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict().superRefine((value, context) => {
  if (
    value.eventType === "location"
    && (value.latitude == null || value.longitude == null)
  ) {
    context.addIssue({
      code: "custom",
      path: ["latitude"],
      message: "Location events require latitude and longitude",
    });
  }
  if (
    (value.eventType === "student_boarded" || value.eventType === "student_dropped")
    && !value.studentId
  ) {
    context.addIssue({
      code: "custom",
      path: ["studentId"],
      message: "Boarding events require a student assignment",
    });
  }
});

export const mobileContentQuerySchema = z.object({
  featureKey: z.string().trim().min(1).max(100).optional(),
  moduleKey: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).refine((value) => Boolean(value.featureKey || value.moduleKey), {
  message: "featureKey or moduleKey is required",
});

export const mobileContentActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_record"),
    moduleKey: z.string().trim().min(1).max(100),
    workflow: z.string().trim().min(2).max(80),
    title: z.string().trim().min(2).max(140),
    description: z.string().trim().max(1200).default(""),
    recordDate: z.iso.date(),
    dueDate: z.union([z.iso.date(), z.literal("")]).default(""),
    amountPaise: z.number().int().min(0).max(1_000_000_000).nullable().default(null),
    assignee: z.string().trim().max(100).default("Schoolwide"),
    priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  }),
  z.object({
    action: z.literal("update_status"),
    recordId: z.string().uuid(),
    status: z.enum(["draft", "open", "in_progress", "completed", "cancelled"]),
  }),
  z.object({
    action: z.literal("parent_request"),
    requestType: z.enum(["leave_request", "contact_school", "ptm_request"]),
    studentId: z.string().uuid(),
    title: z.string().trim().min(2).max(140),
    description: z.string().trim().min(2).max(1200),
  }),
]);
