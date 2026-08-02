import {
  assertSchoolModuleAccess,
  authorize,
  authErrorResponse,
} from "../../../../../../server/auth/authorization.ts";
import { policies } from "../../../../../../server/auth/policies.ts";
import {
  applyWorkspaceAction,
  getWorkspace,
  getWorkspaceRecordModuleKey,
} from "../../../../../../server/workspace/repository";
import { filterWorkspaceForActor } from "../../../../../../server/workspace/access.ts";
import {
  moduleKeys,
  workspaceActionSchema,
} from "../../../../../../server/workspace/validation";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ schoolId: string }> };

export async function GET(request: Request, context: Context) {
  const { schoolId } = await context.params;
  const url = new URL(request.url);
  const moduleKey = url.searchParams.get("moduleKey") ?? "Dashboard";
  const sessionId = url.searchParams.get("sessionId");
  if (!moduleKeys.includes(moduleKey as typeof moduleKeys[number])) {
    return Response.json({ error: "Unknown module" }, { status: 400 });
  }
  try {
    const actor = await authorize(request, policies.workspaceView, schoolId);
    assertSchoolModuleAccess(actor, moduleKey, "view");
    const workspace = await getWorkspace(schoolId, moduleKey, sessionId);
    return Response.json({
      workspace: moduleKey === "Dashboard" || moduleKey === "Reports & Analytics"
        ? filterWorkspaceForActor(workspace, actor)
        : workspace,
    });
  } catch (error) {
    try { return authErrorResponse(error); } catch {}
    return Response.json(
      { error: error instanceof Error ? error.message : "Workspace could not be loaded" },
      { status: 404 },
    );
  }
}

export async function POST(request: Request, context: Context) {
  const { schoolId } = await context.params;
  let actor;
  try {
    actor = await authorize(request, policies.workspaceManage, schoolId);
  } catch (error) {
    return authErrorResponse(error);
  }
  const parsed = workspaceActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid workflow details", issues: parsed.error.issues },
      { status: 422 },
    );
  }
  try {
    const moduleKey = parsed.data.action === "create_record"
      ? parsed.data.moduleKey
      : await getWorkspaceRecordModuleKey(schoolId, parsed.data.recordId);
    if (!moduleKey) return Response.json({ error: "Workspace record not found" }, { status: 404 });
    assertSchoolModuleAccess(actor, moduleKey, "manage");
    return Response.json({
      workspace: await applyWorkspaceAction(schoolId, parsed.data, actor),
    });
  } catch (error) {
    try { return authErrorResponse(error); } catch {}
    const message = error instanceof Error ? error.message : "Workflow update failed";
    return Response.json(
      { error: message },
      { status: message.includes("not found") ? 404 : 409 },
    );
  }
}
