import { authorize, authErrorResponse } from "../../../../../../server/auth/authorization.ts";
import { authRateLimit } from "../../../../../../server/auth/rate-limit.ts";
import { findLoginRecord, writeSecurityEvent } from "../../../../../../server/auth/repository.ts";
import { verifyPassword } from "../../../../../../server/auth/password.ts";
import { clientAddress, requestMetadata } from "../../../../../../server/auth/service.ts";
import { policies } from "../../../../../../server/auth/policies.ts";
import { applyRoleAction, listRoles, permissionCatalogue } from "../../../../../../server/access/repository";
import { roleActionSchema } from "../../../../../../server/access/validation";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ schoolId: string }> };

export async function GET(request: Request, context: Context) {
  const { schoolId } = await context.params;
  let actor;
  try {
    actor = await authorize(request, policies.rolesView, schoolId);
  } catch (error) {
    return authErrorResponse(error);
  }
  try {
    return Response.json({
      roles: await listRoles(schoolId, actor),
      permissions: permissionCatalogue,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Roles could not be loaded" },
      { status: 404 },
    );
  }
}

export async function POST(request: Request, context: Context) {
  const { schoolId } = await context.params;
  let actor;
  try {
    // Password verification below is the explicit step-up boundary. The
    // ordinary roles.manage authorization checks still run first.
    actor = await authorize(
      request,
      { ...policies.rolesManage, stepUp: false },
      schoolId,
    );
  } catch (error) {
    return authErrorResponse(error);
  }

  const body = await request.json().catch(() => null) as
    | (Record<string, unknown> & { stepUpPassword?: unknown })
    | null;
  const parsed = roleActionSchema.safeParse(body);
  const password = typeof body?.stepUpPassword === "string"
    ? body.stepUpPassword
    : "";
  if (!parsed.success || password.length < 1 || password.length > 128) {
    return Response.json({ error: "Invalid role action" }, { status: 422 });
  }

  let limit;
  try {
    limit = await authRateLimit(
      "sensitive",
      actor.email,
      clientAddress(request),
    );
  } catch {
    return Response.json(
      { error: "Step-up authentication service unavailable" },
      { status: 503 },
    );
  }
  if (!limit.allowed) {
    return Response.json(
      { error: "Step-up authentication failed" },
      {
        status: 429,
        headers: { "retry-after": String(limit.retryAfter) },
      },
    );
  }
  if (limit.delayMs) {
    await new Promise((resolve) => setTimeout(resolve, limit.delayMs));
  }

  const metadata = requestMetadata(request);
  let validPassword = false;
  try {
    const record = await findLoginRecord(actor.email);
    const comparison = record && record.userId === actor.userId
      ? await verifyPassword(record.passwordHash, password)
      : null;
    validPassword = Boolean(comparison?.valid);
  } catch {
    return Response.json(
      { error: "Step-up authentication service unavailable" },
      { status: 503 },
    );
  }
  if (!validPassword) {
    await writeSecurityEvent({
      actorId: actor.userId,
      tenantId: schoolId,
      action: "auth.step_up.role_management",
      outcome: "failure",
      ipHash: metadata.ipHash,
      metadata: { userAgentHash: metadata.userAgentHash },
    }).catch(() => undefined);
    return Response.json(
      { error: "Step-up authentication failed" },
      { status: 403 },
    );
  }

  try {
    // Record the successful reauthentication before the role transaction so a
    // later telemetry failure can never make a committed role change look lost.
    await writeSecurityEvent({
      actorId: actor.userId,
      tenantId: schoolId,
      action: "auth.step_up.role_management",
      outcome: "success",
      ipHash: metadata.ipHash,
      metadata: { userAgentHash: metadata.userAgentHash },
    });
    const roles = await applyRoleAction(schoolId, parsed.data, actor);
    return Response.json({ roles });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Role update failed";
    return Response.json(
      { error: message },
      {
        status: message.includes("not found")
          ? 404
          : message.includes("Company has not enabled")
            ? 403
            : 409,
      },
    );
  }
}
