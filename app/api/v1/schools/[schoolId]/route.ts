import { getChatGPTUser } from "../../../../chatgpt-auth";
import { getSchoolDetail, performSchoolAction } from "../../../../../server/schools/management-repository";
import { schoolActionSchema } from "../../../../../server/schools/management-validation";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ schoolId: string }> };

export async function GET(_request: Request, context: Context) {
  const actor = await getChatGPTUser();
  if (!actor) return Response.json({ error: "Authentication required" }, { status: 401 });
  const { schoolId } = await context.params;
  const school = await getSchoolDetail(schoolId);
  return school ? Response.json({ school }) : Response.json({ error: "School not found" }, { status: 404 });
}

export async function PATCH(request: Request, context: Context) {
  const actor = await getChatGPTUser();
  if (!actor) return Response.json({ error: "Authentication required" }, { status: 401 });
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 120) return Response.json({ error: "A valid Idempotency-Key header is required" }, { status: 400 });
  const parsed = schoolActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid school action" }, { status: 422 });
  const { schoolId } = await context.params;
  try {
    return Response.json({ school: await performSchoolAction(schoolId, parsed.data, actor, idempotencyKey) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "School update failed";
    return Response.json({ error: message }, { status: message === "School not found" ? 404 : 500 });
  }
}
