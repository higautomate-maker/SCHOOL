import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { applyConfigurationAction, getConfiguration } from "../../../../../../server/configuration/repository";
import { configurationActionSchema } from "../../../../../../server/configuration/validation";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ schoolId: string }> };

export async function GET(_request: Request, context: Context) {
  const actor = await getChatGPTUser(); if (!actor) return Response.json({ error: "Authentication required" }, { status: 401 });
  const { schoolId } = await context.params;
  try { return Response.json({ configuration: await getConfiguration(schoolId) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Configuration could not be loaded" }, { status: 404 }); }
}

export async function POST(request: Request, context: Context) {
  const actor = await getChatGPTUser(); if (!actor) return Response.json({ error: "Authentication required" }, { status: 401 });
  const parsed = configurationActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid configuration details", issues: parsed.error.issues }, { status: 422 });
  const { schoolId } = await context.params;
  try { return Response.json({ configuration: await applyConfigurationAction(schoolId, parsed.data, actor) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Configuration update failed" }, { status: 409 }); }
}
