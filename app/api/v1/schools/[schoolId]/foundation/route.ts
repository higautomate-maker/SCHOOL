import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { applyFoundationAction, getFoundation } from "../../../../../../server/foundation/repository";
import { foundationActionSchema } from "../../../../../../server/foundation/validation";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ schoolId: string }> };

export async function GET(_request: Request, context: Context) {
  const actor = await getChatGPTUser(); if (!actor) return Response.json({ error: "Authentication required" }, { status: 401 });
  const { schoolId } = await context.params;
  try { return Response.json({ foundation: await getFoundation(schoolId) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Foundation could not be loaded" }, { status: 404 }); }
}

export async function POST(request: Request, context: Context) {
  const actor = await getChatGPTUser(); if (!actor) return Response.json({ error: "Authentication required" }, { status: 401 });
  const parsed = foundationActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid setup details", issues: parsed.error.issues }, { status: 422 });
  const { schoolId } = await context.params;
  try { return Response.json({ foundation: await applyFoundationAction(schoolId, parsed.data, actor) }); }
  catch (error) { const message = error instanceof Error ? error.message : "Setup update failed"; return Response.json({ error: message.includes("UNIQUE") ? "This record already exists" : message }, { status: message.includes("not found") ? 404 : 409 }); }
}
