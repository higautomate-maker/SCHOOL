import { z } from "zod";

export const lessonAttendanceSchema = z.object({
  academicSessionId: z.string().uuid(),
  classId: z.string().uuid(),
  sectionId: z.string().uuid(),
  subjectId: z.string().uuid(),
  lessonId: z.string().trim().min(1).max(120),
  attendanceDate: z.iso.date(),
  entries: z.array(z.object({
    studentId: z.string().uuid(),
    status: z.enum(["present", "absent", "late", "excused"]),
    note: z.string().trim().max(240).default(""),
  }).strict()).min(1).max(100),
  overrideReason: z.string().trim().min(3).max(240).optional(),
}).strict().superRefine((value, context) => {
  const ids = value.entries.map((entry) => entry.studentId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", path: ["entries"], message: "Student entries must be unique" });
  }
});

export type LessonAttendanceInput = z.infer<typeof lessonAttendanceSchema>;
