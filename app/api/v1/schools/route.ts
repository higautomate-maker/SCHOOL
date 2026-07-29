import { getChatGPTUser } from "../../../chatgpt-auth";
import { createSchool, findIdempotentResponse, listSchoolPage } from "../../../../server/schools/repository";
import { createSchoolSchema } from "../../../../server/schools/validation";
import { validIdempotencyKey } from "../../../../server/http/idempotency";

export const dynamic = "force-dynamic";

export async function GET(request?: Request) {
  const actor = await getChatGPTUser();
  if (!actor) return Response.json({ error: "Authentication required" }, { status: 401 });
  const url = request ? new URL(request.url) : null;
  const requestedLimit = Number(url?.searchParams.get("limit") ?? 50);
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
  const cursor = url?.searchParams.get("cursor") || undefined;
  try {
    const page = await listSchoolPage({ limit, cursor });
    return Response.json({
      ...page,
      actor: { displayName: actor.displayName, email: actor.email },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid school pagination cursor") {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

export async function POST(request: Request) {
  const actor = await getChatGPTUser();
  if (!actor) return Response.json({ error: "Authentication required" }, { status: 401 });
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!validIdempotencyKey(idempotencyKey)) {
    return Response.json({ error: "A valid Idempotency-Key header is required" }, { status: 400 });
  }

  const existing = await findIdempotentResponse(idempotencyKey, actor.email.toLowerCase());
  if (existing) return Response.json({ school: existing, replayed: true });

  const parsed = createSchoolSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid school details", issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) }, { status: 422 });
  }

  try {
    return Response.json({ school: await createSchool(parsed.data, actor, idempotencyKey), replayed: false }, { status: 201 });
  } catch (error) {
    const replay = await findIdempotentResponse(idempotencyKey, actor.email.toLowerCase());
    if (replay) return Response.json({ school: replay, replayed: true });
    console.error("School onboarding failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "School onboarding could not be completed" }, { status: 500 });
  }
}
