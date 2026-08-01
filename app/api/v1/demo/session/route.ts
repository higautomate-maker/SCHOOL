import { demoAccountFromRequest } from "../../../../../server/demo-store.ts";
import { assertSalesDemoAllowed } from "../../../../../server/runtime/demo-mode.ts";

export async function GET(request: Request) {
  try { assertSalesDemoAllowed(process.env); }
  catch { return Response.json({ error: "Not found" }, { status: 404 }); }
  const account = demoAccountFromRequest(request);
  if (!account) return Response.json({ authenticated: false }, { status: 401 });
  return Response.json({ authenticated: true, user: { name: account.name, email: account.email, role: account.role }, destination: account.destination });
}

export async function DELETE() {
  try { assertSalesDemoAllowed(process.env); }
  catch { return Response.json({ error: "Not found" }, { status: 404 }); }
  return Response.json({ authenticated: false }, { headers: { "set-cookie": "hig_demo_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0" } });
}
