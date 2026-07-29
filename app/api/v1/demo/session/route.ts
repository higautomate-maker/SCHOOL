import { demoAccountFromRequest } from "../../../../../server/demo-store.ts";

export async function GET(request: Request) {
  const account = demoAccountFromRequest(request);
  if (!account) return Response.json({ authenticated: false }, { status: 401 });
  return Response.json({ authenticated: true, user: { name: account.name, email: account.email, role: account.role }, destination: account.destination });
}

export async function DELETE() {
  return Response.json({ authenticated: false }, { headers: { "set-cookie": "hig_demo_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" } });
}
