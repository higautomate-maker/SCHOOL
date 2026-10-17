import { authorize, authErrorResponse } from "../../../../../server/auth/authorization.ts";
import { policies } from "../../../../../server/auth/policies.ts";
import { listCompanyAudit } from "../../../../../server/company/audit-repository.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try { await authorize(request, policies.companyAuditView); }
  catch (error) { return authErrorResponse(error); }

  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenantId") || undefined;
  if (tenantId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
    return Response.json({ error: "Invalid school" }, { status: 400 });
  }
  const requestedLimit = Number(url.searchParams.get("limit") ?? 50);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
    return Response.json({ error: "Invalid limit" }, { status: 400 });
  }
  try {
    return Response.json(await listCompanyAudit({
      tenantId,
      cursor: url.searchParams.get("cursor") || undefined,
      limit: requestedLimit,
    }));
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid audit cursor") {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
