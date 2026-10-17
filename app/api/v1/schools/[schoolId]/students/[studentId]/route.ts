import { z } from "zod";
import { authErrorResponse, authorize } from "../../../../../../../server/auth/authorization.ts";
import { policies } from "../../../../../../../server/auth/policies.ts";
import { validIdempotencyKey } from "../../../../../../../server/http/idempotency.ts";
import { updateStudent } from "../../../../../../../server/students/repository.ts";
import { updateStudentSchema } from "../../../../../../../server/students/validation.ts";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ schoolId: string; studentId: string }> };

export async function PATCH(request: Request, context: Context) {
  const { schoolId, studentId } = await context.params;
  let actor;
  try {
    actor = await authorize(request, policies.studentsManage, schoolId);
  } catch (error) {
    return authErrorResponse(error);
  }
  if (!z.uuid().safeParse(studentId).success) {
    return Response.json({ error: "Invalid student ID" }, { status: 400 });
  }
  const key = request.headers.get("idempotency-key");
  if (!validIdempotencyKey(key)) {
    return Response.json({ error: "A valid Idempotency-Key header is required" }, { status: 400 });
  }
  const parsed = updateStudentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid student details", issues: parsed.error.issues }, { status: 422 });
  }
  try {
    const student = await updateStudent(schoolId, studentId, parsed.data, actor, key);
    return student
      ? Response.json({ student })
      : Response.json({ error: "Student not found" }, { status: 404 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Student update failed" },
      { status: 409 },
    );
  }
}
