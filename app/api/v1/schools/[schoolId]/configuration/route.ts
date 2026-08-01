import { authorize,authErrorResponse } from "../../../../../../server/auth/authorization.ts";
import { policies } from "../../../../../../server/auth/policies.ts";
import { applyConfigurationAction, getConfiguration } from "../../../../../../server/configuration/repository";
import { configurationActionSchema } from "../../../../../../server/configuration/validation";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ schoolId: string }> };

export async function GET(_request: Request, context: Context) {
  const { schoolId } = await context.params;
  try{await authorize(_request,policies.configurationView,schoolId);}catch(error){return authErrorResponse(error);}
  try { return Response.json({ configuration: await getConfiguration(schoolId) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Configuration could not be loaded" }, { status: 404 }); }
}

export async function POST(request: Request, context: Context) {
  const { schoolId } = await context.params;
  let actor;try{actor=await authorize(request,policies.configurationManage,schoolId);}catch(error){return authErrorResponse(error);}
  const parsed = configurationActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid configuration details", issues: parsed.error.issues }, { status: 422 });
  try { return Response.json({ configuration: await applyConfigurationAction(schoolId, parsed.data, actor) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Configuration update failed" }, { status: 409 }); }
}
