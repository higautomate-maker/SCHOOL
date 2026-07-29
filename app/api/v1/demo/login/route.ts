import { demoAccounts } from "../../../../../server/demo-store.ts";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { email?: string; password?: string } | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  const account = demoAccounts.find((item) => item.email === email && item.password === body?.password);
  if (!account) return Response.json({ error: "Incorrect demo email or password" }, { status: 401 });
  return Response.json(
    { user: { name: account.name, email: account.email, role: account.role }, token: account.token, destination: account.destination },
    { headers: { "set-cookie": `hig_demo_session=${account.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800` } },
  );
}
