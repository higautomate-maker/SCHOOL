import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type DemoRole = "company" | "school_admin" | "staff" | "student" | "parent" | "driver";

export type DemoAccount = {
  email: string;
  password: string;
  role: DemoRole;
  name: string;
  token: string;
  destination: string;
};

type DemoStudent = { id: string; admissionNumber: string; rollNumber: string; firstName: string; lastName: string; fullName: string; gender: "female" | "male" | "other"; dateOfBirth: string; admissionDate: string; className: string; sectionName: string; guardianName: string; guardianPhone: string; status: "active" | "inactive" | "graduated"; createdAt: string };
type DemoRecord = { id: string; moduleKey: string; workflow: string; title: string; description: string; recordDate: string; dueDate: string | null; amountPaise: number | null; assignee: string; priority: string; status: string; createdAt: string; updatedAt: string };

export function demoAccounts(environment:Record<string,string|undefined>=process.env):DemoAccount[]{const encoded=environment.HIG_DEMO_ACCOUNTS_JSON;if(!encoded)throw new Error("Sales-demo accounts are not configured");let value:unknown;try{value=JSON.parse(encoded);}catch{throw new Error("Sales-demo accounts are invalid");}if(!Array.isArray(value))throw new Error("Sales-demo accounts are invalid");return value.map((entry)=>{if(!entry||typeof entry!=="object")throw new Error("Sales-demo accounts are invalid");const account=entry as Record<string,unknown>;if(typeof account.email!=="string"||typeof account.password!=="string"||typeof account.name!=="string"||typeof account.token!=="string"||typeof account.destination!=="string"||!(["company","school_admin","staff","student","parent","driver"] as const).includes(account.role as DemoRole)||account.password.length<12||account.token.length<32||!account.destination.startsWith("/")||account.destination.startsWith("//"))throw new Error("Sales-demo accounts are invalid");return account as DemoAccount;});}

export type DemoState = ReturnType<typeof createDemoState>;

const storeKey = Symbol.for("hig-school.demo-store.v2");
const databaseKey = Symbol.for("hig-school.demo-database.v1");
type DemoGlobal = typeof globalThis & { [storeKey]?: DemoState; [databaseKey]?: DatabaseSync };

function demoDatabase() {
  const target = globalThis as DemoGlobal;
  if (target[databaseKey]) return target[databaseKey];
  const configuredPath = process.env.HIG_DEMO_DB_PATH?.trim();
  const databasePath = configuredPath || resolve(process.cwd(), ".data", "hig-school-demo.sqlite");
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS demo_state (
      tenant_id TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      version INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  target[databaseKey] = database;
  return database;
}

function persistDemoState(state: DemoState) {
  demoDatabase().prepare(`
    INSERT INTO demo_state (tenant_id, state_json, version, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(tenant_id) DO UPDATE SET
      state_json = excluded.state_json,
      version = excluded.version,
      updated_at = excluded.updated_at
  `).run(state.school.tenantId, JSON.stringify(state), state.version, state.updatedAt);
}

function persistedDemoState(): DemoState | null {
  const row = demoDatabase().prepare("SELECT state_json FROM demo_state WHERE tenant_id = ?").get("demo-northfield") as { state_json?: string } | undefined;
  if (!row?.state_json) return null;
  try {
    const state = JSON.parse(row.state_json) as DemoState;
    state.notifications ??= [];
    return state;
  } catch {
    return null;
  }
}

function createDemoState() {
  const now = new Date().toISOString();
  return {
    version: 1,
    updatedAt: now,
    school: {
      tenantId: "demo-northfield",
      id: "HIG-DEMO-001",
      name: "Northfield Public School",
      code: "NPS",
      city: "New Delhi",
      location: "New Delhi",
      plan: "Enterprise",
      status: "active",
      adminEmail: "schooladmin@northfield.edu",
    },
    modules: [
      "Finance & Fees", "Accounts", "Student Information", "Academics", "Front Office",
      "Lead Management", "Offline Examinations", "CBC Academics", "Online Examinations",
      "Human Resource", "PTM Meetings", "Lesson Planner", "OSM Module", "QR Code Attendance",
      "Assessment", "Live Classes", "Study Center", "Certificates", "Communicate", "Library",
      "Inventory", "Transport", "Hostel", "Help Center", "Asset Management", "Reports & Analytics",
      "Settings & Billing", "Apps Center",
    ].map((label) => ({ key: label.toLowerCase().replace(/[^a-z0-9]+/g, "_"), label, enabled: true })),
    foundation: {
      sessions: [{ id: "demo-session-2026", name: "2026–27", startsOn: "2026-04-01", endsOn: "2027-03-31", status: "active" as const }],
      classes: [
        { id: "g6", name: "Grade 6", code: "G6", sections: [{ name: "A", capacity: 40 }, { name: "B", capacity: 40 }] },
        { id: "g7", name: "Grade 7", code: "G7", sections: [{ name: "A", capacity: 40 }, { name: "B", capacity: 40 }] },
        { id: "g8", name: "Grade 8", code: "G8", sections: [{ name: "A", capacity: 40 }, { name: "B", capacity: 40 }] },
        { id: "g9", name: "Grade 9", code: "G9", sections: [{ name: "A", capacity: 40 }, { name: "B", capacity: 40 }] },
      ],
      subjects: [
        { id: "math", name: "Mathematics", code: "MAT", type: "core" },
        { id: "eng", name: "English", code: "ENG", type: "core" },
        { id: "sci", name: "Science", code: "SCI", type: "core" },
        { id: "sst", name: "Social Studies", code: "SST", type: "core" },
      ],
      settings: { shortName: "NPS", email: "office@northfield.edu", phone: "+91 98765 43210", principalName: "Dr. Kavita Rao", address: "New Delhi, India", currencyCode: "INR", admissionPrefix: "NPS", receiptPrefix: "NPS-RCPT" },
      setup: { percent: 100, completed: ["School profile", "Academic session", "Classes & sections", "Subjects"], remaining: [] as string[] },
    },
    students: [
      { id: "student-aarav", admissionNumber: "NPS-2026-018", rollNumber: "18", firstName: "Aarav", lastName: "Sharma", fullName: "Aarav Sharma", gender: "male" as const, dateOfBirth: "2013-03-12", admissionDate: "2026-04-03", className: "Grade 8", sectionName: "A", guardianName: "Neha Sharma", guardianPhone: "98765 20184", status: "active" as const, createdAt: "2026-07-22T08:10:00Z" },
      { id: "student-meera", admissionNumber: "NPS-2026-017", rollNumber: "07", firstName: "Meera", lastName: "Iyer", fullName: "Meera Iyer", gender: "female" as const, dateOfBirth: "2014-08-22", admissionDate: "2026-04-02", className: "Grade 7", sectionName: "B", guardianName: "Kavita Iyer", guardianPhone: "98111 64209", status: "active" as const, createdAt: "2026-07-21T09:20:00Z" },
      { id: "student-kabir", admissionNumber: "NPS-2026-016", rollNumber: "23", firstName: "Kabir", lastName: "Khan", fullName: "Kabir Khan", gender: "male" as const, dateOfBirth: "2012-11-05", admissionDate: "2026-04-01", className: "Grade 9", sectionName: "A", guardianName: "Sana Khan", guardianPhone: "98990 22165", status: "active" as const, createdAt: "2026-07-20T10:45:00Z" },
      { id: "student-ananya", admissionNumber: "NPS-2026-015", rollNumber: "05", firstName: "Ananya", lastName: "Gupta", fullName: "Ananya Gupta", gender: "female" as const, dateOfBirth: "2013-06-19", admissionDate: "2026-04-01", className: "Grade 8", sectionName: "A", guardianName: "Rohit Gupta", guardianPhone: "98210 45781", status: "active" as const, createdAt: "2026-07-19T09:10:00Z" },
      { id: "student-vivaan", admissionNumber: "NPS-2026-014", rollNumber: "21", firstName: "Vivaan", lastName: "Malhotra", fullName: "Vivaan Malhotra", gender: "male" as const, dateOfBirth: "2013-10-02", admissionDate: "2026-04-01", className: "Grade 8", sectionName: "A", guardianName: "Karan Malhotra", guardianPhone: "98104 22319", status: "active" as const, createdAt: "2026-07-18T11:30:00Z" },
      { id: "student-isha", admissionNumber: "NPS-2026-013", rollNumber: "12", firstName: "Isha", lastName: "Verma", fullName: "Isha Verma", gender: "female" as const, dateOfBirth: "2013-01-28", admissionDate: "2026-04-01", className: "Grade 8", sectionName: "A", guardianName: "Deepak Verma", guardianPhone: "98711 63420", status: "active" as const, createdAt: "2026-07-17T08:45:00Z" },
      { id: "student-advait", admissionNumber: "NPS-2026-012", rollNumber: "03", firstName: "Advait", lastName: "Singh", fullName: "Advait Singh", gender: "male" as const, dateOfBirth: "2014-04-11", admissionDate: "2026-04-01", className: "Grade 7", sectionName: "B", guardianName: "Manpreet Singh", guardianPhone: "98912 70846", status: "active" as const, createdAt: "2026-07-16T10:15:00Z" },
      { id: "student-saanvi", admissionNumber: "NPS-2026-011", rollNumber: "28", firstName: "Saanvi", lastName: "Joshi", fullName: "Saanvi Joshi", gender: "female" as const, dateOfBirth: "2012-09-15", admissionDate: "2026-04-01", className: "Grade 9", sectionName: "A", guardianName: "Amit Joshi", guardianPhone: "98682 10254", status: "active" as const, createdAt: "2026-07-15T12:20:00Z" },
      { id: "student-reyansh", admissionNumber: "NPS-2026-010", rollNumber: "31", firstName: "Reyansh", lastName: "Arora", fullName: "Reyansh Arora", gender: "male" as const, dateOfBirth: "2015-02-07", admissionDate: "2026-04-01", className: "Grade 6", sectionName: "A", guardianName: "Shalini Arora", guardianPhone: "98188 30417", status: "active" as const, createdAt: "2026-07-14T09:35:00Z" },
    ] as DemoStudent[],
    attendance: [
      { id: "attendance-aarav", studentId: "student-aarav", studentName: "Aarav Sharma", className: "Grade 8", sectionName: "A", attendanceDate: "2026-07-26", status: "present", note: "Marked by Neha Kapoor", updatedAt: now },
      { id: "attendance-meera", studentId: "student-meera", studentName: "Meera Iyer", className: "Grade 7", sectionName: "B", attendanceDate: "2026-07-26", status: "late", note: "Bus delay", updatedAt: now },
      { id: "attendance-kabir", studentId: "student-kabir", studentName: "Kabir Khan", className: "Grade 9", sectionName: "A", attendanceDate: "2026-07-26", status: "present", note: "Marked by Imran Ali", updatedAt: now },
      { id: "attendance-ananya", studentId: "student-ananya", studentName: "Ananya Gupta", className: "Grade 8", sectionName: "A", attendanceDate: "2026-07-26", status: "present", note: "Marked by Neha Kapoor", updatedAt: now },
      { id: "attendance-vivaan", studentId: "student-vivaan", studentName: "Vivaan Malhotra", className: "Grade 8", sectionName: "A", attendanceDate: "2026-07-26", status: "absent", note: "Guardian informed", updatedAt: now },
      { id: "attendance-isha", studentId: "student-isha", studentName: "Isha Verma", className: "Grade 8", sectionName: "A", attendanceDate: "2026-07-26", status: "present", note: "Marked by Neha Kapoor", updatedAt: now },
      { id: "attendance-advait", studentId: "student-advait", studentName: "Advait Singh", className: "Grade 7", sectionName: "B", attendanceDate: "2026-07-26", status: "present", note: "Marked by Arjun Das", updatedAt: now },
      { id: "attendance-saanvi", studentId: "student-saanvi", studentName: "Saanvi Joshi", className: "Grade 9", sectionName: "A", attendanceDate: "2026-07-26", status: "present", note: "Marked by Imran Ali", updatedAt: now },
      { id: "attendance-reyansh", studentId: "student-reyansh", studentName: "Reyansh Arora", className: "Grade 6", sectionName: "A", attendanceDate: "2026-07-26", status: "excused", note: "Medical leave", updatedAt: now },
    ],
    invoices: [
      { id: "invoice-aarav", studentId: "student-aarav", studentName: "Aarav Sharma", admissionNumber: "NPS-2026-018", feeType: "Tuition Fee — Term 1", amountPaise: 450000, paidPaise: 300000, dueDate: "2026-08-10", status: "partial", createdAt: now },
      { id: "invoice-ananya", studentId: "student-ananya", studentName: "Ananya Gupta", admissionNumber: "NPS-2026-015", feeType: "Tuition Fee — Term 1", amountPaise: 450000, paidPaise: 450000, dueDate: "2026-08-10", status: "paid", createdAt: now },
      { id: "invoice-vivaan", studentId: "student-vivaan", studentName: "Vivaan Malhotra", admissionNumber: "NPS-2026-014", feeType: "Tuition + Transport", amountPaise: 620000, paidPaise: 0, dueDate: "2026-08-10", status: "due", createdAt: now },
      { id: "invoice-meera", studentId: "student-meera", studentName: "Meera Iyer", admissionNumber: "NPS-2026-017", feeType: "Tuition Fee — Term 1", amountPaise: 420000, paidPaise: 420000, dueDate: "2026-08-05", status: "paid", createdAt: now },
      { id: "invoice-kabir", studentId: "student-kabir", studentName: "Kabir Khan", admissionNumber: "NPS-2026-016", feeType: "Tuition + Lab Fee", amountPaise: 540000, paidPaise: 400000, dueDate: "2026-08-05", status: "partial", createdAt: now },
      { id: "invoice-isha", studentId: "student-isha", studentName: "Isha Verma", admissionNumber: "NPS-2026-013", feeType: "Tuition Fee — Term 1", amountPaise: 450000, paidPaise: 450000, dueDate: "2026-08-10", status: "paid", createdAt: now },
    ],
    payments: [
      { id: "payment-aarav", invoiceId: "invoice-aarav", studentName: "Aarav Sharma", amountPaise: 300000, method: "upi", reference: "UPI-DEMO-2407", paidOn: "2026-07-24" },
      { id: "payment-ananya", invoiceId: "invoice-ananya", studentName: "Ananya Gupta", amountPaise: 450000, method: "razorpay", reference: "PAY-DEMO-2408", paidOn: "2026-07-24" },
      { id: "payment-meera", invoiceId: "invoice-meera", studentName: "Meera Iyer", amountPaise: 420000, method: "bank_transfer", reference: "NEFT-DEMO-1182", paidOn: "2026-07-23" },
      { id: "payment-kabir", invoiceId: "invoice-kabir", studentName: "Kabir Khan", amountPaise: 400000, method: "cash", reference: "NPS-RCPT-1048", paidOn: "2026-07-22" },
      { id: "payment-isha", invoiceId: "invoice-isha", studentName: "Isha Verma", amountPaise: 450000, method: "upi", reference: "UPI-DEMO-2389", paidOn: "2026-07-21" },
    ],
    records: [
      { id: "notice-1", moduleKey: "Communicate", workflow: "Notice Board", title: "Independence Day rehearsal", description: "House-wise rehearsal starts Monday at 8:00 AM.", recordDate: "2026-07-26", dueDate: "2026-08-14", amountPaise: null, assignee: "All students", priority: "normal", status: "open", createdAt: now, updatedAt: now },
      { id: "notice-2", moduleKey: "Communicate", workflow: "Notice Board", title: "Monsoon uniform advisory", description: "Students may wear the approved school raincoat and black waterproof shoes.", recordDate: "2026-07-25", dueDate: null, amountPaise: null, assignee: "All parents", priority: "normal", status: "open", createdAt: now, updatedAt: now },
      { id: "notice-3", moduleKey: "Communicate", workflow: "Notice Board", title: "Science exhibition registrations", description: "Submit team names to the Science Department by Friday.", recordDate: "2026-07-24", dueDate: "2026-07-31", amountPaise: null, assignee: "Grades 7–9", priority: "normal", status: "open", createdAt: now, updatedAt: now },
      { id: "homework-1", moduleKey: "Study Center", workflow: "Homework & Assignments", title: "Mathematics: Linear Equations", description: "Complete exercises 4.1 and 4.2.", recordDate: "2026-07-26", dueDate: "2026-07-29", amountPaise: null, assignee: "Grade 8 A", priority: "normal", status: "open", createdAt: now, updatedAt: now },
      { id: "homework-2", moduleKey: "Study Center", workflow: "Homework & Assignments", title: "English: The Last Leaf", description: "Write a 250-word character sketch of Behrman.", recordDate: "2026-07-25", dueDate: "2026-07-30", amountPaise: null, assignee: "Grade 8 A", priority: "normal", status: "open", createdAt: now, updatedAt: now },
      { id: "homework-3", moduleKey: "Study Center", workflow: "Homework & Assignments", title: "Science: Force and Pressure", description: "Complete the observation table from today’s lab activity.", recordDate: "2026-07-24", dueDate: "2026-07-28", amountPaise: null, assignee: "Grade 8 A", priority: "normal", status: "in_progress", createdAt: now, updatedAt: now },
      { id: "ptm-1", moduleKey: "PTM Meetings", workflow: "PTM Schedule Meetings", title: "Grade 8 Parent–Teacher Meeting", description: "Term progress discussion in Room 204.", recordDate: "2026-07-26", dueDate: "2026-08-02", amountPaise: null, assignee: "Grade 8 A", priority: "normal", status: "open", createdAt: now, updatedAt: now },
      { id: "exam-1", moduleKey: "Offline Examinations", workflow: "Exam Schedule", title: "Term 1 Mathematics Examination", description: "80 marks · 3 hours · Hall A", recordDate: "2026-07-26", dueDate: "2026-08-18", amountPaise: null, assignee: "Grade 8", priority: "normal", status: "scheduled", createdAt: now, updatedAt: now },
      { id: "exam-2", moduleKey: "Online Examinations", workflow: "Question Bank", title: "Science chapter quiz", description: "25 questions · 30 minutes · two attempts", recordDate: "2026-07-26", dueDate: "2026-07-30", amountPaise: null, assignee: "Grade 8 A", priority: "normal", status: "open", createdAt: now, updatedAt: now },
      { id: "assessment-1", moduleKey: "Assessment", workflow: "Assessment Update", title: "Mathematics Unit Test", description: "Class average 78% · Aarav scored 42/50.", recordDate: "2026-07-23", dueDate: null, amountPaise: null, assignee: "Grade 8 A", priority: "normal", status: "completed", createdAt: now, updatedAt: now },
      { id: "lesson-1", moduleKey: "Lesson Planner", workflow: "Weekly Plan", title: "Mathematics — Linear Equations", description: "Learning outcomes, guided examples and group practice.", recordDate: "2026-07-26", dueDate: "2026-07-31", amountPaise: null, assignee: "Neha Kapoor", priority: "normal", status: "in_progress", createdAt: now, updatedAt: now },
      { id: "live-1", moduleKey: "Live Classes", workflow: "Live Class", title: "English doubt-clearing session", description: "Google Meet session for Grade 8 from 5:00–5:40 PM.", recordDate: "2026-07-26", dueDate: "2026-07-27", amountPaise: null, assignee: "Grade 8", priority: "normal", status: "scheduled", createdAt: now, updatedAt: now },
      { id: "library-1", moduleKey: "Library", workflow: "Book Issue", title: "The Discovery of India", description: "Issued to Aarav Sharma · Accession LIB-1948.", recordDate: "2026-07-24", dueDate: "2026-08-02", amountPaise: null, assignee: "Aarav Sharma", priority: "normal", status: "issued", createdAt: now, updatedAt: now },
      { id: "library-2", moduleKey: "Library", workflow: "Book Issue", title: "Mathematics Companion VIII", description: "Issued to Ananya Gupta · Accession LIB-2211.", recordDate: "2026-07-25", dueDate: "2026-08-03", amountPaise: null, assignee: "Ananya Gupta", priority: "normal", status: "issued", createdAt: now, updatedAt: now },
      { id: "transport-1", moduleKey: "Transport", workflow: "Route Assignment", title: "Route 4 — Dwarka", description: "18 students · 7 stops · vehicle DL 01 AB 4821.", recordDate: "2026-07-26", dueDate: null, amountPaise: 180000, assignee: "Ramesh Kumar", priority: "normal", status: "in_progress", createdAt: now, updatedAt: now },
      { id: "hr-1", moduleKey: "Human Resource", workflow: "Staff Leave", title: "Casual leave — Arjun Das", description: "One day leave requested for 29 July.", recordDate: "2026-07-26", dueDate: "2026-07-29", amountPaise: null, assignee: "School Admin", priority: "normal", status: "open", createdAt: now, updatedAt: now },
      { id: "frontoffice-1", moduleKey: "Front Office", workflow: "Visitor Log", title: "Prospective parent visit", description: "Campus tour scheduled with admissions counsellor.", recordDate: "2026-07-26", dueDate: "2026-07-27", amountPaise: null, assignee: "Reception", priority: "normal", status: "scheduled", createdAt: now, updatedAt: now },
      { id: "lead-1", moduleKey: "Lead Management", workflow: "Admission Enquiry", title: "Ritika Sood — Grade 6 enquiry", description: "Callback requested after 4 PM. Prospect source: website.", recordDate: "2026-07-26", dueDate: "2026-07-27", amountPaise: null, assignee: "Admissions Team", priority: "urgent", status: "open", createdAt: now, updatedAt: now },
      { id: "asset-1", moduleKey: "Asset Management", workflow: "Asset Register", title: "Epson classroom projector", description: "Asset NPS-AST-104 · Room 204 · warranty active.", recordDate: "2026-07-22", dueDate: null, amountPaise: 6850000, assignee: "IT Department", priority: "normal", status: "active", createdAt: now, updatedAt: now },
      { id: "inventory-1", moduleKey: "Inventory", workflow: "Stock Request", title: "Science lab consumables", description: "Gloves, litmus paper and glass slides for August practicals.", recordDate: "2026-07-25", dueDate: "2026-08-01", amountPaise: 245000, assignee: "Science Department", priority: "normal", status: "open", createdAt: now, updatedAt: now },
      { id: "certificate-1", moduleKey: "Certificates", workflow: "Certificate Request", title: "Bonafide certificate — Meera Iyer", description: "Requested by guardian for scholarship documentation.", recordDate: "2026-07-26", dueDate: "2026-07-28", amountPaise: null, assignee: "School Office", priority: "normal", status: "open", createdAt: now, updatedAt: now },
      { id: "health-1", moduleKey: "Student Information", workflow: "Health Record", title: "Annual health screening", description: "Grade 8 screening completed; follow-up advice shared with two parents.", recordDate: "2026-07-20", dueDate: null, amountPaise: null, assignee: "School Nurse", priority: "normal", status: "completed", createdAt: now, updatedAt: now },
      { id: "accounts-1", moduleKey: "Accounts", workflow: "Expense", title: "Laboratory equipment purchase", description: "Vendor: EduLab Supplies · invoice EL-2881.", recordDate: "2026-07-24", dueDate: null, amountPaise: 1285000, assignee: "Accounts Office", priority: "normal", status: "completed", createdAt: now, updatedAt: now },
    ] as DemoRecord[],
    notifications: [
      { id: "notification-1", audience: ["student", "parent"], studentId: "student-aarav", moduleKey: "Attendance", title: "Attendance marked", message: "Aarav Sharma is present today.", actionUrl: "/mobile-preview/student", createdAt: now, read: false },
      { id: "notification-2", audience: ["student", "parent"], studentId: "student-aarav", moduleKey: "Study Center", title: "New homework assigned", message: "Mathematics: Linear Equations is due on 29 July.", actionUrl: "/mobile-preview/student", createdAt: now, read: false },
      { id: "notification-3", audience: ["parent"], studentId: "student-aarav", moduleKey: "Finance & Fees", title: "Fee payment updated", message: "₹3,000 received for Aarav Sharma. ₹1,500 remains due.", actionUrl: "/mobile-preview/student", createdAt: now, read: false },
      { id: "notification-4", audience: ["student", "parent"], studentId: "student-aarav", moduleKey: "Transport", title: "School bus is on route", message: "Route 4 — Dwarka is currently in progress.", actionUrl: "/mobile-preview/student", createdAt: now, read: false },
    ],
    driver: {
      driverId: "driver-ramesh",
      name: "Ramesh Kumar",
      vehicle: "DL 01 AB 4821",
      route: "Route 4 — Dwarka",
      latitude: 28.5921,
      longitude: 77.0460,
      speedKph: 28,
      heading: 74,
      tripStatus: "in_progress",
      updatedAt: now,
    },
    audit: [
      { id: "audit-1", action: "demo.seeded", actor: "HIG Automation", occurredAt: now },
    ],
  };
}

export function getDemoState(): DemoState {
  const target = globalThis as DemoGlobal;
  if (!target[storeKey]) {
    target[storeKey] = persistedDemoState() ?? createDemoState();
    persistDemoState(target[storeKey]);
  }
  return target[storeKey];
}

export function touchDemoState(actor: string, action: string): DemoState {
  const state = getDemoState();
  state.version += 1;
  state.updatedAt = new Date().toISOString();
  state.audit.unshift({ id: crypto.randomUUID(), action, actor, occurredAt: state.updatedAt });
  state.audit.splice(20);
  persistDemoState(state);
  return state;
}

export function releaseDemoStateMemoryCache() {
  const target = globalThis as DemoGlobal;
  delete target[storeKey];
}

export function addDemoNotification(state: DemoState, input: {
  audience: DemoRole[];
  studentId?: string;
  moduleKey: string;
  title: string;
  message: string;
}) {
  state.notifications.unshift({
    id: crypto.randomUUID(),
    audience: input.audience,
    studentId: input.studentId ?? "",
    moduleKey: input.moduleKey,
    title: input.title,
    message: input.message,
    actionUrl: "/mobile-preview/student",
    createdAt: new Date().toISOString(),
    read: false,
  });
  state.notifications.splice(50);
}

export function demoAccountFromRequest(request: Request): DemoAccount | null {
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith("hig_demo_session="))?.split("=")[1];
  const token = bearer ?? cookie ?? "";
  try {
    return demoAccounts().find((account) => account.token === token) ?? null;
  } catch {
    // A sales-demo deployment without explicitly provisioned accounts must
    // remain inaccessible instead of falling back to embedded credentials.
    return null;
  }
}

export function demoOperations(state = getDemoState()) {
  const present = state.attendance.filter((entry) => entry.status === "present").length;
  const absent = state.attendance.filter((entry) => entry.status === "absent").length;
  const late = state.attendance.filter((entry) => entry.status === "late").length;
  const invoicedPaise = state.invoices.reduce((sum, invoice) => sum + invoice.amountPaise, 0);
  const collectedPaise = state.payments.reduce((sum, payment) => sum + payment.amountPaise, 0);
  return {
    attendance: state.attendance,
    invoices: state.invoices,
    payments: state.payments,
    metrics: { present, absent, late, attendanceMarked: state.attendance.length, invoicedPaise, collectedPaise, outstandingPaise: invoicedPaise - collectedPaise },
  };
}

export function demoWorkspace(moduleKey: string, state = getDemoState()) {
  const records = state.records.filter((record) => moduleKey === "Dashboard" || moduleKey === "Reports & Analytics" || record.moduleKey === moduleKey);
  const breakdown = state.modules.map((module) => {
    const entries = state.records.filter((record) => record.moduleKey === module.label);
    return { moduleKey: module.label, total: entries.length, openCount: entries.filter((record) => record.status === "open").length, completedCount: entries.filter((record) => record.status === "completed").length };
  });
  return {
    records,
    breakdown,
    metrics: {
      total: records.length,
      open: records.filter((record) => record.status === "open").length,
      inProgress: records.filter((record) => record.status === "in_progress").length,
      completed: records.filter((record) => record.status === "completed").length,
      urgent: records.filter((record) => record.priority === "urgent").length,
      overdue: records.filter((record) => record.dueDate && record.dueDate < new Date().toISOString().slice(0, 10) && record.status !== "completed").length,
      amountPaise: records.reduce((sum, record) => sum + (record.amountPaise ?? 0), 0),
    },
  };
}
