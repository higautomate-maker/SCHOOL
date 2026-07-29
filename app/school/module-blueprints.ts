export type ModuleBlueprint = {
  title: string;
  subtitle: string;
  primary: string;
  stats: [string, string, string, string];
  panels: [string, string, string, string];
};

export type WorkflowBlueprint = {
  action: string;
  columns: string[];
  description: string;
};

const blueprints: Record<string, ModuleBlueprint> = {
  Accounts: {
    title: "Accounts & Bookkeeping",
    subtitle: "Track income, expenses, ledgers and maintain audit-ready books.",
    primary: "Add Voucher",
    stats: ["Today's Collection", "This Month Income", "This Month Expense", "Cash & Bank"],
    panels: ["Income vs Expense", "Recent Vouchers", "Bank Position", "Operations"],
  },
  "Front Office": {
    title: "Front Office",
    subtitle: "Manage enquiries, visitors, complaints and postal movement across the school.",
    primary: "Add Enquiry",
    stats: ["Open Enquiries", "Visitors Today", "Pending Complaints", "Postal Records"],
    panels: ["Admission Funnel", "Today's Visitors", "Pending Follow-ups", "Operations"],
  },
  "Lead Management": {
    title: "Lead Management",
    subtitle: "Capture admission leads, manage the pipeline and configure sources and stages.",
    primary: "Add Lead",
    stats: ["Open Leads", "New This Week", "Follow-ups Due", "Converted"],
    panels: ["Lead Pipeline", "Source Performance", "Upcoming Follow-ups", "Recent Activity"],
  },
  "Offline Examinations": {
    title: "Offline Examinations",
    subtitle: "Set up exams, schedule papers, enter marks and generate report cards.",
    primary: "Manage Exams",
    stats: ["Exams This Session", "Upcoming Exams", "Marks Entry", "Published Marksheets"],
    panels: ["Overall Marks Entry Progress", "Upcoming Exam Schedule", "Recent Exams", "Operations"],
  },
  "CBC Academics": {
    title: "CBC Academics",
    subtitle: "Manage outcomes, competencies, pathways and continuous assessment.",
    primary: "Add Assessment",
    stats: ["Learning Outcomes", "CBC Assessments", "Core Competencies", "Reports Ready"],
    panels: ["Outcome Coverage", "Assessment Progress", "Competency Distribution", "Operations"],
  },
  "Online Examinations": {
    title: "Online Examinations",
    subtitle: "Build question banks, schedule timed tests and publish digital results.",
    primary: "Create Online Exam",
    stats: ["Question Bank", "Scheduled Exams", "Active Attempts", "Published Results"],
    panels: ["Attempt Activity", "Upcoming Exams", "Recent Results", "Operations"],
  },
  "Human Resource": {
    title: "Human Resource",
    subtitle: "Manage staff, attendance, leaves, payroll, loans and performance.",
    primary: "Add Staff",
    stats: ["Total Staff", "Pending Leaves", "On Leave Today", "Active Loans"],
    panels: ["Staff by Department", "Pending Leave Requests", "Upcoming (30 days)", "Operations"],
  },
  "PTM Meetings": {
    title: "PTM Meetings",
    subtitle: "Schedule parent-teacher meetings, record attendance and track follow-ups.",
    primary: "Schedule Meeting",
    stats: ["Upcoming Meetings", "Appointments", "Attendance", "Open Follow-ups"],
    panels: ["Meeting Calendar", "Appointment Status", "Recent Remarks", "Operations"],
  },
  "Lesson Planner": {
    title: "Lesson Planner",
    subtitle: "Plan lessons, review submissions, approve delivery and monitor coverage.",
    primary: "Create Lesson Plan",
    stats: ["Plans This Week", "Pending Review", "Approved Plans", "Coverage"],
    panels: ["Weekly Coverage", "Pending Approvals", "Teacher Activity", "Operations"],
  },
  "OSM Module": {
    title: "OSM Module",
    subtitle: "Run structured observations, evaluations, moderation and reporting.",
    primary: "Start OSM Session",
    stats: ["Open Sessions", "Evaluations", "Pending Moderation", "Reports"],
    panels: ["Evaluation Progress", "Score Distribution", "Moderation Queue", "Operations"],
  },
  "QR Code Attendance": {
    title: "QR Code Attendance",
    subtitle: "Capture controlled QR attendance and review scan exceptions.",
    primary: "Start QR Session",
    stats: ["Scans Today", "Present", "Late", "Exceptions"],
    panels: ["Live Scan Activity", "Attendance by Class", "Exceptions", "Operations"],
  },
  Assessment: {
    title: "Assessment",
    subtitle: "Create assessments, collect evidence and analyse learner performance.",
    primary: "New Assessment",
    stats: ["Active Assessments", "Submissions", "Pending Review", "Reports"],
    panels: ["Assessment Calendar", "Submission Progress", "Performance Overview", "Operations"],
  },
  "Live Classes": {
    title: "Live Classes",
    subtitle: "Schedule virtual lessons and manage joining links and recordings.",
    primary: "Schedule Live Class",
    stats: ["Today's Classes", "Upcoming", "Completed", "Recordings"],
    panels: ["Today's Schedule", "Attendance", "Recent Recordings", "Operations"],
  },
  "Study Center": {
    title: "Study Center",
    subtitle: "Manage classwork, syllabus, resources, homework and assignments.",
    primary: "Add Learning Resource",
    stats: ["Resources", "Assignments", "Submissions", "Pending Grading"],
    panels: ["Syllabus Coverage", "Due Assignments", "Recent Resources", "Operations"],
  },
  Certificates: {
    title: "Certificates & Documents",
    subtitle: "Build templates and generate verified school documents.",
    primary: "Generate Document",
    stats: ["Templates", "Generated", "Awaiting Approval", "Printed"],
    panels: ["Document Types", "Recently Generated", "Approval Queue", "Operations"],
  },
  Communicate: {
    title: "Communication Center",
    subtitle: "Publish notices, events and targeted broadcasts to the school community.",
    primary: "Compose Broadcast",
    stats: ["Sent Today", "Scheduled", "Delivered", "Needs Attention"],
    panels: ["Delivery Performance", "Scheduled Messages", "Recent Broadcasts", "Operations"],
  },
  Library: {
    title: "Library Management",
    subtitle: "Monitor literary resources, circulation, requests and overdue returns.",
    primary: "New Acquisition",
    stats: ["Total Books", "Issued Books", "Overdue Returns", "New Acquisitions"],
    panels: ["Library Catalog", "Overdue Alerts", "Circulation Trends", "Recent Returns"],
  },
  Inventory: {
    title: "Inventory & Stock",
    subtitle: "Track items, stock levels, expiry, issuance, sales and suppliers.",
    primary: "Add Stock",
    stats: ["Total Items", "Low Stock", "Expired Items", "Stock Value"],
    panels: ["Items by Category", "Recent Activity", "Low-Stock Items", "Operations"],
  },
  Transport: {
    title: "Transport Management",
    subtitle: "Monitor vehicles, drivers, routes, student allocation and live operations.",
    primary: "Add New Vehicle",
    stats: ["Total Vehicles", "Active Routes", "Students Using Transport", "Vehicles on Duty"],
    panels: ["Vehicle Inventory & Status", "Upcoming Maintenance", "Live Fleet Tracking", "Recent Route Alerts"],
  },
  Hostel: {
    title: "Hostel Management",
    subtitle: "Manage hostels, rooms, occupancy and student allocation.",
    primary: "Allocate Student",
    stats: ["Total Capacity", "Occupied Beds", "Available Beds", "Open Requests"],
    panels: ["Occupancy by Hostel", "Recent Allocations", "Room Availability", "Operations"],
  },
  "Help Center": {
    title: "Help Center",
    subtitle: "Manage knowledge articles, support categories and guided assistance.",
    primary: "Create Article",
    stats: ["Articles", "Categories", "Open Requests", "Resolved"],
    panels: ["Knowledge Base", "Recent Requests", "Popular Articles", "Operations"],
  },
  "Asset Management": {
    title: "Asset Management",
    subtitle: "Register, tag, allocate, depreciate and maintain fixed assets.",
    primary: "Register Asset",
    stats: ["Total Assets", "Acquisition Value", "Current Book Value", "Under Maintenance"],
    panels: ["By Status", "Assets by Category", "Warranty Expiring", "Recent Activity"],
  },
  "Settings & Billing": {
    title: "Settings & Billing",
    subtitle: "Control school configuration, access, modules, subscription and audit history.",
    primary: "Open Settings",
    stats: ["Enabled Modules", "Custom Roles", "Audit Events", "Subscription Status"],
    panels: ["Configuration Health", "Access Controls", "Recent Audit Events", "Operations"],
  },
  "Apps Center": {
    title: "Apps Center",
    subtitle: "Find every enabled school module and workspace from one searchable catalog.",
    primary: "Browse Apps",
    stats: ["Modules", "Management Apps", "Learning Apps", "Administration Apps"],
    panels: ["Frequently Used", "Management", "Learning", "Administration"],
  },
  "Comms Wallet": {
    title: "Comms Wallet",
    subtitle: "Track messaging credits, channel usage and communication spend.",
    primary: "Add Credits",
    stats: ["Wallet Balance", "SMS Credits", "WhatsApp Credits", "Used This Month"],
    panels: ["Usage Trend", "Channel Breakdown", "Recent Transactions", "Operations"],
  },
};

const columns: Record<string, string[]> = {
  Accounts: ["Voucher", "Date", "Head", "Reference", "Amount", "Status", "Actions"],
  "Front Office": ["Reference", "Name / Subject", "Contact", "Date", "Assigned To", "Status", "Actions"],
  "Lead Management": ["Lead", "Contact", "Source", "Stage", "Assigned To", "Follow-up", "Actions"],
  "Offline Examinations": ["Exam", "Class", "Subject", "Schedule", "Max Marks", "Status", "Actions"],
  "CBC Academics": ["Strand / Outcome", "Class", "Term", "Teacher", "Progress", "Status", "Actions"],
  "Online Examinations": ["Exam", "Class", "Questions", "Duration", "Attempts", "Status", "Actions"],
  "Human Resource": ["Staff ID", "Name", "Department", "Designation", "Contact", "Status", "Actions"],
  "PTM Meetings": ["Meeting", "Class", "Teacher", "Date", "Appointments", "Status", "Actions"],
  "Lesson Planner": ["Lesson", "Class", "Subject", "Teacher", "Delivery Date", "Status", "Actions"],
  "OSM Module": ["Session", "Class", "Observer", "Date", "Score", "Status", "Actions"],
  "QR Code Attendance": ["Session", "Class", "Date", "Scans", "Exceptions", "Status", "Actions"],
  Assessment: ["Assessment", "Class", "Subject", "Date", "Submissions", "Status", "Actions"],
  "Live Classes": ["Class", "Subject", "Teacher", "Starts", "Join Link", "Status", "Actions"],
  "Study Center": ["Title", "Class", "Subject", "Due Date", "Created By", "Status", "Actions"],
  Certificates: ["Document", "Recipient", "Number", "Issued", "Template", "Status", "Actions"],
  Communicate: ["Title", "Channel", "Audience", "Scheduled", "Delivery", "Status", "Actions"],
  Library: ["Accession", "Book", "Author", "Category", "Availability", "Actions"],
  Inventory: ["SKU", "Item", "Category", "Quantity", "Unit", "Stock Status", "Actions"],
  Transport: ["Vehicle", "Driver", "Route", "Capacity", "Status", "Actions"],
  Hostel: ["Hostel", "Room", "Type", "Capacity", "Occupied", "Status", "Actions"],
  "Help Center": ["Reference", "Subject", "Requester", "Priority", "Updated", "Status", "Actions"],
  "Asset Management": ["Tag", "Asset", "Category", "Assigned To", "Book Value", "Status", "Actions"],
  "Settings & Billing": ["Setting", "Value", "Scope", "Updated By", "Status", "Actions"],
};

const actionForPage = (page: string) => {
  const lower = page.toLowerCase();
  if (lower.includes("dashboard") || lower === "overview") return "Quick Setup";
  if (lower.includes("report") || lower.includes("history")) return "Export Report";
  if (lower.includes("setting")) return "Save Settings";
  if (lower.includes("attendance")) return "Mark Attendance";
  if (lower.includes("marks")) return "Enter Marks";
  if (lower.includes("payment") || lower.includes("income")) return "Record Payment";
  if (lower.includes("expense")) return "Add Expense";
  if (lower.includes("issue")) return "Issue Item";
  if (lower.includes("assign")) return "New Assignment";
  if (lower.includes("schedule") || lower.includes("timetable")) return "Create Schedule";
  if (lower.includes("generate")) return "Generate";
  if (lower.includes("upload")) return "Upload File";
  if (lower.includes("guide")) return "Start Guided Setup";
  return `Add ${page.replace(/manage /i, "")}`;
};

export function getModuleBlueprint(module: string): ModuleBlueprint {
  return blueprints[module] ?? {
    title: module,
    subtitle: `Manage ${module.toLowerCase()} operations for the selected academic session.`,
    primary: `Add ${module}`,
    stats: ["Total Records", "Open", "In Progress", "Completed"],
    panels: ["Overview", "Recent Activity", "Needs Attention", "Operations"],
  };
}

export function getWorkflowBlueprint(module: string, page: string): WorkflowBlueprint {
  return {
    action: actionForPage(page),
    columns: columns[module] ?? ["Reference", "Title", "Date", "Owner", "Priority", "Status", "Actions"],
    description: `${page} records for the selected school and academic session.`,
  };
}
