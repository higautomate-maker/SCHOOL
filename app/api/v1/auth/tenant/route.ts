import { z } from "zod";
import { assertSameOrigin, csrfCookie, noStoreHeaders, sessionCookie } from "../../../../../server/auth/cookies.ts";
import { authRateLimit } from "../../../../../server/auth/rate-limit.ts";
import { rotateTenant, writeSecurityEvent } from "../../../../../server/auth/repository.ts";
import { assertCsrf, authenticatedActor, clientAddress, requestMetadata } from "../../../../../server/auth/service.ts";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await authenticatedActor(request);
    if (!actor) return Response.json({ error: "Authentication required" }, { status: 401, headers: noStoreHeaders() });
    assertCsrf(actor, request);
    const ip = clientAddress(request);
    const limit = await authRateLimit("sensitive", actor.email, ip);
    if (!limit.allowed) return Response.json({ error: "Access denied" }, { status: 429, headers: noStoreHeaders({ "retry-after": String(limit.retryAfter) }) });
    const parsed = z.object({ tenantId: z.string().uuid() }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Invalid tenant" }, { status: 422, headers: noStoreHeaders() });
    const next = await rotateTenant(actor.sessionId, actor.userId, parsed.data.tenantId, requestMetadata(request));
    await writeSecurityEvent({ actorId: actor.userId, tenantId: parsed.data.tenantId, action: "auth.tenant_switch", outcome: "success", ipHash: requestMetadata(request).ipHash });
    const headers = new Headers(noStoreHeaders());
    headers.append("set-cookie", sessionCookie(next.token));
    headers.append("set-cookie", csrfCookie(next.csrfToken));
    return Response.json({ activeTenantId: parsed.data.tenantId }, { headers });
  } catch {
    return Response.json({ error: "Access denied" }, { status: 403, headers: noStoreHeaders() });
  }
}
