import { demoAccounts } from "../../../../../server/demo-store.ts";
import { assertSalesDemoAllowed } from "../../../../../server/runtime/demo-mode.ts";

export async function POST(request: Request) {
  try { assertSalesDemoAllowed(process.env); }
  catch { return Response.json({ error: "Not found" }, { status: 404 }); }
  const body = await request.json().catch(() => null) as { email?: string; password?: string } | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  let accounts;try{accounts=demoAccounts();}catch{return Response.json({error:"Not found"},{status:404});}
  const account = accounts.find((item) => item.email === email && item.password === body?.password);
  if (!account) return Response.json({ error: "Incorrect demo email or password" }, { status: 401 });
  return Response.json(
    { user: { name: account.name, email: account.email, role: account.role }, token: account.token, destination: account.destination },
    { headers: { "set-cookie": `hig_demo_session=${account.token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800` } },
  );
}
