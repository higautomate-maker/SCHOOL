import { authorize,authErrorResponse } from "../../../../../../server/auth/authorization.ts";
import { policies } from "../../../../../../server/auth/policies.ts";
import { applyRoleAction, listRoles, permissionCatalogue } from "../../../../../../server/access/repository";
import { roleActionSchema } from "../../../../../../server/access/validation";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ schoolId: string }> };

export async function GET(_request: Request, context: Context) {
  const { schoolId } = await context.params;
  let actor;try{actor=await authorize(_request,policies.rolesView,schoolId);}catch(error){return authErrorResponse(error);}
  try { return Response.json({ roles: await listRoles(schoolId, actor), permissions: permissionCatalogue }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Roles could not be loaded" }, { status: 404 }); }
}

export async function POST(request: Request, context: Context) {
  const { schoolId } = await context.params;
  let actor;try{actor=await authorize(request,policies.rolesManage,schoolId);}catch(error){return authErrorResponse(error);}
  const parsed = roleActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid role action" }, { status: 422 });
  try { return Response.json({ roles: await applyRoleAction(schoolId, parsed.data, actor) }); }
  catch (error) { const message = error instanceof Error ? error.message : "Role update failed"; return Response.json({ error: message }, { status: message.includes("not found") ? 404 : 409 }); }
}
