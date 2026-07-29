import { z } from "zod";

export const createStudentSchema = z.object({
  admissionNumber: z.string().trim().min(2).max(30),
  rollNumber: z.string().trim().min(1).max(30),
  firstName: z.string().trim().min(2).max(60),
  lastName: z.string().trim().max(60).default(""),
  gender: z.enum(["female", "male", "other"]),
  dateOfBirth: z.iso.date(),
  admissionDate: z.iso.date(),
  className: z.string().trim().min(1).max(30),
  sectionName: z.string().trim().min(1).max(20),
  guardianName: z.string().trim().min(2).max(100),
  guardianPhone: z.string().trim().regex(/^\+?[0-9 -]{8,16}$/),
});

export type CreateStudentInput = z.infer<typeof createStudentSchema>;
