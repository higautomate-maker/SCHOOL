import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { applyRoleAction, listRoles, permissionCatalogue } from "../../../../../../server/access/repository";
import { roleActionSchema } from "../../../../../../server/access/validation";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ schoolId: string }> };

export async function GET(_request: Request, context: Context) {
  const actor = await getChatGPTUser();
  if (!actor) return Response.json({ error: "Authentication required" }, { status: 401 });
  const { schoolId } = await context.params;
  try { return Response.json({ roles: await listRoles(schoolId, actor), permissions: permissionCatalogue }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Roles could not be loaded" }, { status: 404 }); }
}

export async function POST(request: Request, context: Context) {
  const actor = await getChatGPTUser();
  if (!actor) return Response.json({ error: "Authentication required" }, { status: 401 });
  const parsed = roleActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid role action" }, { status: 422 });
  const { schoolId } = await context.params;
  try { return Response.json({ roles: await applyRoleAction(schoolId, parsed.data, actor) }); }
  catch (error) { const message = error instanceof Error ? error.message : "Role update failed"; return Response.json({ error: message }, { status: message.includes("not found") ? 404 : 409 }); }
}
