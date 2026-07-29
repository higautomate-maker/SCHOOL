import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { createStudent, findStudentReplay, listStudents } from "../../../../../../server/students/repository";
import { createStudentSchema } from "../../../../../../server/students/validation";
import { validIdempotencyKey } from "../../../../../../server/http/idempotency";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ schoolId: string }> };

export async function GET(request: Request, context: Context) {
  const actor = await getChatGPTUser();
  if (!actor) return Response.json({ error: "Authentication required" }, { status: 401 });
  const { schoolId } = await context.params;
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  try { return Response.json({ students: await listStudents(schoolId, sessionId) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Students could not be loaded" }, { status: 404 }); }
}

export async function POST(request: Request, context: Context) {
  const actor = await getChatGPTUser();
  if (!actor) return Response.json({ error: "Authentication required" }, { status: 401 });
  const key = request.headers.get("idempotency-key");
  if (!validIdempotencyKey(key)) return Response.json({ error: "A valid Idempotency-Key header is required" }, { status: 400 });
  const replay = await findStudentReplay(key, actor.email.toLowerCase());
  if (replay) return Response.json({ student: replay, replayed: true });
  const parsed = createStudentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid student details", issues: parsed.error.issues }, { status: 422 });
  const { schoolId } = await context.params;
  try { return Response.json({ student: await createStudent(schoolId, parsed.data, actor, key), replayed: false }, { status: 201 }); }
  catch (error) { const message = error instanceof Error ? error.message : "Student admission failed"; return Response.json({ error: message.includes("UNIQUE") ? "Admission number already exists" : message }, { status: message.includes("not found") ? 404 : 409 }); }
}
