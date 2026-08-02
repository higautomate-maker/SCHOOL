import {
  authorize,
  authErrorResponse,
} from "../../../../../../server/auth/authorization.ts";
import { policies } from "../../../../../../server/auth/policies.ts";
import { appAudiences, type AppAudience } from "../../../../../../server/access/catalogue.ts";
import { getCompanyAccessConfiguration } from "../../../../../../server/access/company-policy-repository.ts";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ schoolId: string }> };

export async function GET(request: Request, context: Context) {
  const { schoolId } = await context.params;
  try {
    await authorize(request, policies.schoolAppAccessView, schoolId);
  } catch (error) {
    return authErrorResponse(error);
  }
  const audience = new URL(request.url).searchParams.get("audience");
  if (audience && !appAudiences.includes(audience as AppAudience)) {
    return Response.json({ error: "Unknown app audience" }, { status: 400 });
  }
  try {
    const access = await getCompanyAccessConfiguration(schoolId);
    if (!access) return Response.json({ error: "School not found" }, { status: 404 });
    const audiences = audience ? [audience as AppAudience] : appAudiences;
    return Response.json({
      tenantId: schoolId,
      schoolName: access.schoolName,
      relationshipRequired: true,
      features: Object.fromEntries(
        audiences.map((persona) => [persona, access.appFeatures[persona]]),
      ),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "App access could not be loaded" },
      { status: 500 },
    );
  }
}
