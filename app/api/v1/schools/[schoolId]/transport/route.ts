import {
  authorize,
  authErrorResponse,
} from "../../../../../../server/auth/authorization.ts";
import { policies } from "../../../../../../server/auth/policies.ts";
import {
  applyTransportAction,
  listTransportAdminSnapshot,
} from "../../../../../../server/transport/repository.ts";
import { transportActionSchema } from "../../../../../../server/transport/validation.ts";

export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ schoolId: string }>;
};

export async function GET(request: Request, context: Context) {
  const { schoolId } = await context.params;
  try {
    await authorize(request, policies.transportView, schoolId);
  } catch (error) {
    return authErrorResponse(error);
  }

  try {
    return Response.json({
      transport: await listTransportAdminSnapshot(schoolId),
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error
          ? error.message
          : "Transport data could not be loaded",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: Context) {
  const { schoolId } = await context.params;
  try {
    await authorize(request, policies.transportManage, schoolId);
  } catch (error) {
    return authErrorResponse(error);
  }

  const parsed = transportActionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid transport details", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  try {
    return Response.json(
      { record: await applyTransportAction(schoolId, parsed.data) },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Transport operation failed";
    return Response.json(
      { error: message },
      { status: message.includes("duplicate") ? 409 : 500 },
    );
  }
}
