import {
  evaluateReadiness,
  publicReadinessBody,
} from "../../../../server/runtime/readiness.ts";

export async function GET() {
  const result = await evaluateReadiness();
  return Response.json(
    publicReadinessBody(result.ready),
    { status: result.ready ? 200 : 503 },
  );
}
