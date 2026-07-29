export type NavGroup = {
  label: string;
  icon: string;
  category: "MAIN NAVIGATION" | "MANAGEMENT" | "MODULES" | "ADMINISTRATION";
  items: string[];
};

export const navigation: NavGroup[] = [
  { label: "Dashboard", icon: "⌂", category: "MAIN NAVIGATION", items: ["Dashboard"] },

  { label: "Finance & Fees", icon: "₹", category: "MANAGEMENT", items: ["Fees Dashboard", "Collect Fees", "Search Due Fees", "All Transactions", "Online Transactions", "Fee Challans", "Assign Fees", "Fees Carry Forward", "Fee Groups", "Fees Discount", "Fee Types", "Generate Due Slip", "Due Slip History", "Fee Data Audit"] },
  { label: "Accounts", icon: "▣", category: "MANAGEMENT", items: ["Accounts Dashboard", "Income", "Expense", "Income Heads", "Expense Heads", "Bank Accounts"] },
  { label: "Student Information", icon: "♙", category: "MANAGEMENT", items: ["Student Dashboard", "Student Admission", "Student List", "Parents & Guardians", "Student Attendance", "Behavior Records", "Student Houses", "Student Categories", "Disabled Students", "Health Records"] },
  { label: "Academics", icon: "▰", category: "MANAGEMENT", items: ["Academic Dashboard", "Academic Sessions", "Classes", "Sections", "Subjects", "Assign Subjects", "Assign Electives", "Assign Class Teacher", "Manage Periods", "Class Timetable", "Promote Students"] },
  { label: "Front Office", icon: "◫", category: "MANAGEMENT", items: ["Front Office Dashboard", "Admission Enquiries", "Visitor Book", "Complaints", "Postal Records"] },
  { label: "Lead Management", icon: "◎", category: "MANAGEMENT", items: ["Lead Dashboard", "Lead Pipeline Board", "Lead Sources & Stages"] },
  { label: "Offline Examinations", icon: "◇", category: "MANAGEMENT", items: ["Exam Dashboard", "Manage Offline Exams", "Exam Types", "Schedule & Marks Setup", "Enter Marks", "Cocurricular Areas", "Cocurricular Grades", "Manage Grades", "Report Card Setups", "Generate Marksheet", "Upload Marksheet", "Manage Uploads", "Teacher Remarks"] },
  { label: "CBC Academics", icon: "◈", category: "MANAGEMENT", items: ["CBC Dashboard", "Strands & Outcomes", "CBC Assessments", "Core Competencies", "Pathways & Tracks", "CBC Reports"] },
  { label: "Online Examinations", icon: "▱", category: "MANAGEMENT", items: ["Manage Online Exams", "Question Bank"] },
  { label: "Human Resource", icon: "♧", category: "MANAGEMENT", items: ["HR Dashboard", "Staff Directory", "Staff Attendance", "Payroll", "Set Salary", "Approve Leave", "Leave Types", "Departments", "Designations", "Staff ID Card", "HR Settings", "Manage Staff Loans", "Salary Templates", "Appraisal Cycles", "Appraisal Criteria", "Appraisals"] },
  { label: "PTM Meetings", icon: "◉", category: "MANAGEMENT", items: ["PTM Dashboard", "PTM Schedule Meetings", "PTM Guide", "PTM Attendance & Remarks", "PTM Follow-ups", "PTM Reports"] },
  { label: "Lesson Planner", icon: "▤", category: "MANAGEMENT", items: ["Lesson Planner Dashboard", "Lesson Plans", "Lesson Planner Guide", "Lesson Plan Review", "Lesson Plan Approvals", "Lesson Plan Coverage", "Lesson Plan Reports", "Lesson Planner Settings"] },
  { label: "OSM Module", icon: "✎", category: "MANAGEMENT", items: ["OSM Dashboard", "OSM Sessions", "OSM Evaluate", "OSM Reports", "OSM Guide", "OSM Moderation"] },
  { label: "QR Code Attendance", icon: "⌗", category: "MANAGEMENT", items: ["QR Attendance", "QR Attendance Setting", "QR Attendance Report"] },
  { label: "Assessment", icon: "✓", category: "MANAGEMENT", items: ["Assessment Dashboard", "Assessments", "Assessment Guide", "Assessment Reports"] },

  { label: "Live Classes", icon: "▸", category: "MODULES", items: ["Manage Live Classes", "Live Class Settings"] },
  { label: "Study Center", icon: "▥", category: "MODULES", items: ["Dashboard", "Classwork & Logbook", "Manage Syllabus", "Manage Resources", "Homework & Assignments"] },
  { label: "Certificates", icon: "✹", category: "MODULES", items: ["Certificate Templates", "Generate Document"] },
  { label: "Communicate", icon: "◁", category: "MODULES", items: ["Notice Board", "Events & Holidays", "Compose Broadcast", "Broadcast History", "Image Gallery", "Comms Wallet"] },
  { label: "Library", icon: "▥", category: "MODULES", items: ["Library Dashboard", "Issue/Return Book", "Manage Books", "Book Categories"] },
  { label: "Inventory", icon: "□", category: "MODULES", items: ["Inventory Dashboard", "Issue Item", "Add Stock", "Item List", "Item Categories", "Suppliers", "Point of Sale", "Sales History", "Purchase Orders", "Goods Receipts", "Supplier Payments"] },
  { label: "Transport", icon: "▱", category: "MODULES", items: ["Transport Dashboard", "Manage Vehicles", "Manage Routes", "Live Vehicle Tracking"] },
  { label: "Hostel", icon: "▦", category: "MODULES", items: ["Hostel Dashboard", "Student Allocation", "Manage Rooms", "Room Types", "Manage Hostels"] },
  { label: "Help Center", icon: "?", category: "MODULES", items: ["Manage Categories", "Browse Articles", "AI Chatbot"] },
  { label: "Asset Management", icon: "◆", category: "MODULES", items: ["Asset Dashboard", "Asset Register", "Asset Categories", "Asset Assignments", "Asset Depreciation", "Asset Maintenance", "Asset Disposals", "Asset Audits", "Asset Reports"] },

  { label: "Reports & Analytics", icon: "↗", category: "ADMINISTRATION", items: ["Reports & Analytics"] },
  { label: "Settings & Billing", icon: "⚙", category: "ADMINISTRATION", items: ["School Settings", "Backup Management", "Custom Fields", "Roles & Permissions", "Payment Gateway", "Notification Settings", "Telegram Settings", "Social Media Settings", "Admission Settings", "Audit Trail", "Subscription", "Subscription History", "Module Settings", "Biometric Devices", "Website Builder", "Website (Full HTML)"] },
  { label: "Apps Center", icon: "▦", category: "ADMINISTRATION", items: ["Apps Center"] },
];

export const navigationItems = navigation.flatMap((group) =>
  group.items.map((item) => ({ group: group.label, item, icon: group.icon })),
);

export const navigationCount = navigation.reduce((total, group) => total + group.items.length + 1, 0);
