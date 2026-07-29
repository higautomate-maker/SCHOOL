import { demoAccountFromRequest, demoOperations, demoWorkspace, getDemoState } from "../../../../../server/demo-store.ts";

export async function GET(request: Request) {
  const account = demoAccountFromRequest(request);
  if (!account) return Response.json({ error: "Authentication required" }, { status: 401 });
  const state = getDemoState();
  const moduleKey = new URL(request.url).searchParams.get("moduleKey") ?? "Dashboard";
  const notifications = account.role === "student" || account.role === "parent"
    ? state.notifications.filter((notification) => notification.audience.includes(account.role) && (!notification.studentId || notification.studentId === "student-aarav"))
    : state.notifications;
  return Response.json({
    version: state.version,
    updatedAt: state.updatedAt,
    user: { name: account.name, email: account.email, role: account.role },
    school: state.school,
    modules: state.modules,
    foundation: state.foundation,
    students: state.students,
    operations: demoOperations(state),
    workspace: demoWorkspace(moduleKey, state),
    records: state.records,
    notifications,
    driver: state.driver,
    audit: state.audit,
  });
}
