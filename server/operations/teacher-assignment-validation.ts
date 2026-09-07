import { z } from "zod";

const scope = {
  academicSessionId: z.string().uuid(),
  userId: z.string().uuid(),
  classId: z.string().uuid(),
  sectionId: z.string().uuid(),
  active: z.boolean(),
  reason: z.string().trim().min(3).max(240),
};

export const teacherAssignmentSchema = z.discriminatedUnion("kind", [
  z.object({ ...scope, kind: z.literal("class_teacher") }).strict(),
  z.object({ ...scope, kind: z.literal("subject_teacher"), subjectId: z.string().uuid() }).strict(),
]);
export type TeacherAssignmentInput = z.infer<typeof teacherAssignmentSchema>;

export function requireAssignmentAdministrator(principal: {
  principalType: string; roleKey: string | null;
}, canManageAcademics: boolean): void {
  if (principal.principalType !== "school" || principal.roleKey !== "school_admin" || !canManageAcademics) {
    throw new Error("Teacher assignment access denied");
  }
}
