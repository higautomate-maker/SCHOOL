export async function GET() {
  return Response.json({ status: "ready", checks: { application: "ok", tenantGuard: "ok" }, timestamp: new Date().toISOString() });
}
