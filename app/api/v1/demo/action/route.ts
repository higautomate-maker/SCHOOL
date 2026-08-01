import { addDemoNotification, demoAccountFromRequest, demoOperations, demoWorkspace, getDemoState, touchDemoState } from "../../../../../server/demo-store.ts";
import { assertSalesDemoAllowed } from "../../../../../server/runtime/demo-mode.ts";

const writeRoles = new Set(["company", "school_admin", "staff", "parent", "driver"]);

export async function POST(request: Request) {
  try { assertSalesDemoAllowed(process.env); }
  catch { return Response.json({ error: "Not found" }, { status: 404 }); }
  const account = demoAccountFromRequest(request);
  if (!account) return Response.json({ error: "Authentication required" }, { status: 401 });
  if (!writeRoles.has(account.role)) return Response.json({ error: "This demo role is read-only" }, { status: 403 });
  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!input || typeof input.action !== "string") return Response.json({ error: "Invalid action" }, { status: 422 });
  const state = getDemoState();

  if (input.action === "set_module" && account.role === "company") {
    const modulePolicy = state.modules.find((item) => item.key === input.moduleKey || item.label === input.moduleKey);
    if (!modulePolicy) return Response.json({ error: "Unknown module" }, { status: 404 });
    modulePolicy.enabled = Boolean(input.enabled);
  } else if (input.action === "parent_request" && account.role === "parent") {
    const title = String(input.title ?? "").trim();
    if (title.length < 3) return Response.json({ error: "Request title is required" }, { status: 422 });
    const now = new Date().toISOString();
    state.records.unshift({
      id: crypto.randomUUID(),
      moduleKey: "Communicate",
      workflow: String(input.requestType ?? "Parent Request"),
      title,
      description: String(input.description ?? ""),
      recordDate: now.slice(0, 10),
      dueDate: input.dueDate ? String(input.dueDate) : null,
      amountPaise: null,
      assignee: "School Office",
      priority: "normal",
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
    addDemoNotification(state, { audience: ["school_admin", "staff"], studentId: "student-aarav", moduleKey: "Communicate", title: `Parent request: ${title}`, message: String(input.description ?? "A parent sent a new request.") });
  } else if (input.action === "mark_attendance" && (account.role === "school_admin" || account.role === "staff")) {
    const student = state.students.find((item) => item.id === input.studentId);
    if (!student || !["present", "absent", "late", "excused"].includes(String(input.status))) return Response.json({ error: "Invalid attendance entry" }, { status: 422 });
    const attendanceDate = String(input.attendanceDate || new Date().toISOString().slice(0, 10));
    const existing = state.attendance.find((item) => item.studentId === student.id && item.attendanceDate === attendanceDate);
    const entry = { id: existing?.id ?? crypto.randomUUID(), studentId: student.id, studentName: student.fullName, className: student.className, sectionName: student.sectionName, attendanceDate, status: String(input.status), note: String(input.note ?? `Marked by ${account.name}`), updatedAt: new Date().toISOString() };
    if (existing) Object.assign(existing, entry); else state.attendance.unshift(entry);
    addDemoNotification(state, { audience: ["student", "parent"], studentId: student.id, moduleKey: "Attendance", title: "Attendance updated", message: `${student.fullName} was marked ${entry.status} by ${account.name}.` });
  } else if (input.action === "add_student" && account.role === "school_admin") {
    const firstName = String(input.firstName ?? "").trim(), lastName = String(input.lastName ?? "").trim();
    if (firstName.length < 2 || !input.admissionNumber) return Response.json({ error: "Admission number and student name are required" }, { status: 422 });
    const now = new Date().toISOString();
    state.students.unshift({ id: crypto.randomUUID(), admissionNumber: String(input.admissionNumber), rollNumber: String(input.rollNumber ?? ""), firstName, lastName, fullName: `${firstName} ${lastName}`.trim(), gender: (["female", "male", "other"].includes(String(input.gender)) ? String(input.gender) : "other") as "female" | "male" | "other", dateOfBirth: String(input.dateOfBirth), admissionDate: String(input.admissionDate), className: String(input.className), sectionName: String(input.sectionName), guardianName: String(input.guardianName), guardianPhone: String(input.guardianPhone), status: "active", createdAt: now });
  } else if (input.action === "create_invoice" && account.role === "school_admin") {
    const student = state.students.find((item) => item.id === input.studentId);
    if (!student || Number(input.amountPaise) <= 0) return Response.json({ error: "Student and fee amount are required" }, { status: 422 });
    const now = new Date().toISOString();
    state.invoices.unshift({ id: crypto.randomUUID(), studentId: student.id, studentName: student.fullName, admissionNumber: student.admissionNumber, feeType: String(input.feeType), amountPaise: Number(input.amountPaise), paidPaise: 0, dueDate: String(input.dueDate), status: "due", createdAt: now });
  } else if (input.action === "record_payment" && account.role === "school_admin") {
    const invoice = state.invoices.find((item) => item.id === input.invoiceId);
    const amount = Number(input.amountPaise);
    if (!invoice || amount <= 0) return Response.json({ error: "Invoice and payment amount are required" }, { status: 422 });
    invoice.paidPaise = Math.min(invoice.amountPaise, invoice.paidPaise + amount);
    invoice.status = invoice.paidPaise >= invoice.amountPaise ? "paid" : "partial";
    state.payments.unshift({ id: crypto.randomUUID(), invoiceId: invoice.id, studentName: invoice.studentName, amountPaise: amount, method: String(input.method ?? "upi"), reference: String(input.reference ?? ""), paidOn: String(input.paidOn ?? new Date().toISOString().slice(0, 10)) });
    addDemoNotification(state, { audience: ["parent"], studentId: invoice.studentId, moduleKey: "Finance & Fees", title: "Fee payment received", message: `Payment of ₹${(amount / 100).toLocaleString("en-IN")} was recorded for ${invoice.studentName}.` });
  } else if (input.action === "create_record" && (account.role === "school_admin" || account.role === "staff")) {
    const moduleKey = String(input.moduleKey ?? "");
    const workflow = String(input.workflow ?? "");
    const title = String(input.title ?? "").trim();
    if (!moduleKey || !workflow || title.length < 2) return Response.json({ error: "Module, workflow and title are required" }, { status: 422 });
    const now = new Date().toISOString();
    state.records.unshift({ id: crypto.randomUUID(), moduleKey, workflow, title, description: String(input.description ?? ""), recordDate: String(input.recordDate ?? now.slice(0, 10)), dueDate: input.dueDate ? String(input.dueDate) : null, amountPaise: typeof input.amountPaise === "number" ? input.amountPaise : null, assignee: String(input.assignee ?? ""), priority: String(input.priority ?? "normal"), status: "open", createdAt: now, updatedAt: now });
    if (workflow === "Homework & Assignments") addDemoNotification(state, { audience: ["student", "parent"], studentId: "student-aarav", moduleKey, title: "New homework assigned", message: `${title}${input.dueDate ? ` is due on ${String(input.dueDate)}` : " was published"}.` });
    if (workflow === "Notice Board") addDemoNotification(state, { audience: ["student", "parent"], moduleKey, title: "New school notice", message: title });
  } else if (input.action === "update_status" && (account.role === "school_admin" || account.role === "staff")) {
    const record = state.records.find((item) => item.id === input.recordId);
    if (!record) return Response.json({ error: "Record not found" }, { status: 404 });
    record.status = String(input.status ?? "open");
    record.updatedAt = new Date().toISOString();
  } else if (input.action === "update_gps" && account.role === "driver") {
    state.driver.latitude = Number(input.latitude);
    state.driver.longitude = Number(input.longitude);
    state.driver.speedKph = Math.max(0, Number(input.speedKph) || 0);
    state.driver.heading = Number(input.heading) || 0;
    state.driver.tripStatus = String(input.tripStatus ?? state.driver.tripStatus);
    state.driver.updatedAt = new Date().toISOString();
    addDemoNotification(state, { audience: ["student", "parent"], studentId: "student-aarav", moduleKey: "Transport", title: input.tripStatus === "completed" ? "School bus trip completed" : "School bus location updated", message: `${state.driver.route} · ${state.driver.speedKph} km/h.` });
  } else {
    return Response.json({ error: "Action is not allowed for this role" }, { status: 403 });
  }

  touchDemoState(account.email, input.action);
  const moduleKey = String(input.moduleKey ?? "Dashboard");
  const latestStudent = input.action === "add_student" ? state.students[0] : undefined;
  return Response.json({ version: state.version, modules: state.modules, student: latestStudent, students: state.students, operations: demoOperations(state), workspace: demoWorkspace(moduleKey, state), records: state.records, notifications: state.notifications, driver: state.driver, audit: state.audit });
}
