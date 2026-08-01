import { assertSameOrigin, noStoreHeaders } from "../../../../../../server/auth/cookies.ts";
import { authRateLimit } from "../../../../../../server/auth/rate-limit.ts";
import { listSessions, revokeSession, writeSecurityEvent } from "../../../../../../server/auth/repository.ts";
import { assertCsrf, authenticatedActor, clientAddress, requestMetadata } from "../../../../../../server/auth/service.ts";

export async function DELETE(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await authenticatedActor(request);
    if (!actor) return Response.json({ error: "Authentication required" }, { status: 401, headers: noStoreHeaders() });
    assertCsrf(actor, request);
    const ip = clientAddress(request);
    const limit = await authRateLimit("sensitive", actor.email, ip);
    if (!limit.allowed) return Response.json({ error: "Request rejected" }, { status: 429, headers: noStoreHeaders({ "retry-after": String(limit.retryAfter) }) });
    const { sessionId } = await context.params;
    if (!(await listSessions(actor.userId)).some((session) => session.id === sessionId)) {
      return Response.json({ error: "Session not found" }, { status: 404, headers: noStoreHeaders() });
    }
    await revokeSession(sessionId, "user_revoked");
    await writeSecurityEvent({ actorId: actor.userId, tenantId: actor.activeTenantId, action: "auth.session.revoke", outcome: "success", ipHash: requestMetadata(request).ipHash, metadata: { self: sessionId === actor.sessionId } });
    return Response.json({ revoked: true }, { headers: noStoreHeaders() });
  } catch {
    return Response.json({ error: "Request rejected" }, { status: 403, headers: noStoreHeaders() });
  }
}
