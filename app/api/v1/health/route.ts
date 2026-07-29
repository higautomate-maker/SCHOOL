export async function GET() {
  return Response.json({ status: "ok", service: "hig-school", region: "india", timestamp: new Date().toISOString() });
}
