import { authorize,authErrorResponse } from "../../../../../server/auth/authorization.ts";
import { policies } from "../../../../../server/auth/policies.ts";
import { getSchoolDetail, performSchoolAction } from "../../../../../server/schools/management-repository";
import { schoolActionSchema } from "../../../../../server/schools/management-validation";
import { validIdempotencyKey } from "../../../../../server/http/idempotency";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ schoolId: string }> };

export async function GET(_request: Request, context: Context) {
  try { await authorize(_request,policies.schoolsList); } catch(error){return authErrorResponse(error);}
  const { schoolId } = await context.params;
  const school = await getSchoolDetail(schoolId);
  return school ? Response.json({ school }) : Response.json({ error: "School not found" }, { status: 404 });
}

export async function PATCH(request: Request, context: Context) {
  let actor; try { actor=await authorize(request,policies.schoolsManage); } catch(error){return authErrorResponse(error);}
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!validIdempotencyKey(idempotencyKey)) return Response.json({ error: "A valid Idempotency-Key header is required" }, { status: 400 });
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
