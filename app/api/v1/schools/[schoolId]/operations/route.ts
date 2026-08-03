import {
  actorCanAccessSchoolModule,
  assertSchoolModuleAccess,
  authorize,
  authErrorResponse,
} from "../../../../../../server/auth/authorization.ts";
import { policies } from "../../../../../../server/auth/policies.ts";
import { validIdempotencyKey } from "../../../../../../server/http/idempotency";
import { filterOperationsForActor } from "../../../../../../server/operations/access.ts";
import {
  applyOperation,
  getOperations,
} from "../../../../../../server/operations/repository";
import { operationActionSchema } from "../../../../../../server/operations/validation";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ schoolId: string }> };

export async function GET(request: Request, context: Context) {
  const { schoolId } = await context.params;
  try {
    const actor = await authorize(request, policies.operationsView, schoolId);
    const attendanceAllowed = actorCanAccessSchoolModule(actor, "attendance", "view");
    const feesAllowed = actorCanAccessSchoolModule(actor, "fees_finance", "view");
    if (!attendanceAllowed && !feesAllowed) {
      assertSchoolModuleAccess(actor, "attendance", "view");
    }
    const sessionId = new URL(request.url).searchParams.get("sessionId");
    return Response.json({
      operations: filterOperationsForActor(
        await getOperations(schoolId, sessionId),
        actor,
      ),
    });
  } catch (error) {
    try { return authErrorResponse(error); } catch {}
    return Response.json(
      { error: error instanceof Error ? error.message : "Operations could not be loaded" },
      { status: 404 },
    );
  }
}

export async function POST(request: Request, context: Context) {
  const { schoolId } = await context.params;
  let actor;
  try {
    actor = await authorize(request, policies.operationsManage, schoolId);
  } catch (error) {
    return authErrorResponse(error);
  }
  const suppliedKey = request.headers.get("idempotency-key");
  if (suppliedKey !== null && !validIdempotencyKey(suppliedKey)) {
    return Response.json(
      { error: "Idempotency-Key must be valid when supplied" },
      { status: 400 },
    );
  }
  const parsed = operationActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid operation details", issues: parsed.error.issues },
      { status: 422 },
    );
  }
  try {
    const moduleKey = parsed.data.action === "mark_attendance"
      ? "attendance"
      : "fees_finance";
    assertSchoolModuleAccess(actor, moduleKey, "manage");
    return Response.json({
      operations: filterOperationsForActor(
        await applyOperation(
          schoolId,
          parsed.data,
          actor,
          suppliedKey ?? crypto.randomUUID(),
        ),
        actor,
      ),
    });
  } catch (error) {
    try { return authErrorResponse(error); } catch {}
    const message = error instanceof Error ? error.message : "Operation failed";
    return Response.json(
      { error: message },
      { status: message.includes("not found") ? 404 : 409 },
    );
  }
}
