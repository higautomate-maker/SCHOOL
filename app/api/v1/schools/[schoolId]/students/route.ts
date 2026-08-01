import { authorize,authErrorResponse } from "../../../../../../server/auth/authorization.ts";
import { policies } from "../../../../../../server/auth/policies.ts";
import { createStudent, findStudentReplay, listStudents } from "../../../../../../server/students/repository.ts";
import { createStudentSchema } from "../../../../../../server/students/validation.ts";
import { validIdempotencyKey } from "../../../../../../server/http/idempotency.ts";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ schoolId: string }> };

export async function GET(request: Request, context: Context) {
  const { schoolId } = await context.params;
  try{await authorize(request,policies.studentsView,schoolId);}catch(error){return authErrorResponse(error);}
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  try { return Response.json({ students: await listStudents(schoolId, sessionId) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Students could not be loaded" }, { status: 404 }); }
}

export async function POST(request: Request, context: Context) {
  const { schoolId } = await context.params;
  let actor;try{actor=await authorize(request,policies.studentsManage,schoolId);}catch(error){return authErrorResponse(error);}
  const key = request.headers.get("idempotency-key");
  if (!validIdempotencyKey(key)) return Response.json({ error: "A valid Idempotency-Key header is required" }, { status: 400 });
  const replay = await findStudentReplay(key, actor.email.toLowerCase(), schoolId);
  if (replay) return Response.json({ student: replay, replayed: true });
  const parsed = createStudentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid student details", issues: parsed.error.issues }, { status: 422 });
  try { return Response.json({ student: await createStudent(schoolId, parsed.data, actor, key), replayed: false }, { status: 201 }); }
  catch (error) { const message = error instanceof Error ? error.message : "Student admission failed"; return Response.json({ error: message.includes("UNIQUE") ? "Admission number already exists" : message }, { status: message.includes("not found") ? 404 : 409 }); }
}
