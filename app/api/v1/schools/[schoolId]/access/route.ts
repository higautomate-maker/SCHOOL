import {
  authErrorResponse,
  authorize,
} from "../../../../../../server/auth/authorization.ts";
import { policies } from "../../../../../../server/auth/policies.ts";
import {
  applyCompanyAccessAction,
  getCompanyAccessConfiguration,
} from "../../../../../../server/access/company-policy-repository.ts";
import { companyAccessActionSchema } from "../../../../../../server/access/company-policy-validation.ts";
import { validIdempotencyKey } from "../../../../../../server/http/idempotency.ts";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ schoolId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    await authorize(request, policies.companyAccessView);
  } catch (error) {
    return authErrorResponse(error);
  }
  const { schoolId } = await context.params;
  try {
    const access = await getCompanyAccessConfiguration(schoolId);
    return access
      ? Response.json({ access })
      : Response.json({ error: "School not found" }, { status: 404 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Access configuration could not be loaded" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: Context) {
  let actor;
  try {
    actor = await authorize(request, policies.companyAccessManage);
  } catch (error) {
    return authErrorResponse(error);
  }

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!validIdempotencyKey(idempotencyKey)) {
    return Response.json(
      { error: "A valid Idempotency-Key header is required" },
      { status: 400 },
    );
  }
  const parsed = companyAccessActionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid access policy action", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { schoolId } = await context.params;
  try {
    const access = await applyCompanyAccessAction(
      schoolId,
      parsed.data,
      actor,
      idempotencyKey,
    );
    return Response.json({ access });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Access policy update failed";
    return Response.json(
      { error: message },
      { status: message === "School not found" ? 404 : 409 },
    );
  }
}
