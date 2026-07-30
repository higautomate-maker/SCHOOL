export async function GET() {
  return Response.json({
    status: "ok",
    service: "hig-school",
    timestamp: new Date().toISOString(),
  });
}
