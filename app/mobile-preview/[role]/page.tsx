"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import styles from "./preview.module.css";

type DemoState = {
  version: number;
  updatedAt: string;
  user: { name: string; role: string };
  school: { name: string };
  modules: Array<{ key: string; label: string; enabled: boolean }>;
  students: Array<{ id: string; fullName: string; className: string; sectionName: string; rollNumber?: string; admissionNumber?: string }>;
  operations: {
    attendance: Array<{ studentId: string; studentName: string; attendanceDate: string; status: string; updatedAt: string }>;
    invoices: Array<{ studentId: string; studentName?: string; feeType: string; amountPaise: number; paidPaise: number; dueDate: string; status?: string }>;
    payments?: Array<{ amountPaise: number; method: string; paidOn: string }>;
  };
  records: Array<{ id: string; moduleKey: string; workflow: string; title: string; description: string; dueDate: string | null; status: string; updatedAt: string }>;
  notifications: Array<{ id: string; moduleKey: string; title: string; message: string; createdAt: string; read: boolean }>;
  driver: { vehicle: string; route: string; latitude: number; longitude: number; speedKph: number; heading: number; tripStatus: string; updatedAt: string };
};

type AppModule = { id: string; label: string; icon: string; tone: string; group: "quick" | "academic" | "service"; policy?: string };

const studentModules: AppModule[] = [
  { id: "attendance", label: "Attendance", icon: "▣", tone: "mint", group: "quick" },
  { id: "homework", label: "Homework", icon: "✓", tone: "lilac", group: "quick" },
  { id: "courses", label: "Courses", icon: "▤", tone: "blue", group: "quick", policy: "Academics" },
  { id: "reports", label: "CCO Reports", icon: "♙", tone: "cyan", group: "academic" },
  { id: "assessments", label: "Assessments", icon: "◇", tone: "purple", group: "academic", policy: "Assessment" },
  { id: "timetable", label: "Timetable", icon: "▦", tone: "amber", group: "academic" },
  { id: "classes", label: "Extended Classes", icon: "◉", tone: "rose", group: "academic", policy: "Live Classes" },
  { id: "lesson", label: "Lesson Planner", icon: "☷", tone: "green", group: "academic", policy: "Lesson Planner" },
  { id: "syllabus", label: "Syllabus", icon: "▧", tone: "emerald", group: "academic", policy: "Study Center" },
  { id: "fees", label: "Fees", icon: "₹", tone: "orange", group: "service", policy: "Finance & Fees" },
  { id: "library", label: "Library", icon: "▰", tone: "navy", group: "service", policy: "Library" },
  { id: "ptm", label: "PTM Meetings", icon: "◫", tone: "pink", group: "service", policy: "PTM Meetings" },
  { id: "transport", label: "Transport", icon: "▻", tone: "teal", group: "service", policy: "Transport" },
];

const parentModules: AppModule[] = [
  { id: "child", label: "Child Overview", icon: "♙", tone: "blue", group: "quick" },
  { id: "attendance", label: "Attendance", icon: "▣", tone: "mint", group: "quick" },
  { id: "homework", label: "Homework", icon: "✓", tone: "lilac", group: "quick" },
  { id: "timetable", label: "Timetable", icon: "▦", tone: "amber", group: "academic", policy: "Academics" },
  { id: "results", label: "Results", icon: "≋", tone: "purple", group: "academic", policy: "Assessment" },
  { id: "fees", label: "Fees & Payments", icon: "₹", tone: "orange", group: "academic", policy: "Finance & Fees" },
  { id: "notices", label: "Notices", icon: "◖", tone: "rose", group: "academic", policy: "Communicate" },
  { id: "ptm", label: "PTM Meetings", icon: "◫", tone: "pink", group: "academic", policy: "PTM Meetings" },
  { id: "leave-request", label: "Leave Request", icon: "◌", tone: "amber", group: "service" },
  { id: "transport", label: "Live Transport", icon: "▻", tone: "teal", group: "service", policy: "Transport" },
  { id: "library", label: "Library", icon: "▰", tone: "navy", group: "service", policy: "Library" },
  { id: "events", label: "School Events", icon: "✹", tone: "emerald", group: "service", policy: "Communicate" },
  { id: "contact", label: "Contact School", icon: "◉", tone: "cyan", group: "service", policy: "Communicate" },
];

const staffModules: AppModule[] = [
  { id: "my-attendance", label: "My Attendance", icon: "◷", tone: "rose", group: "quick" },
  { id: "academics", label: "Academics", icon: "▤", tone: "blue", group: "quick", policy: "Academics" },
  { id: "attendance", label: "Attendance", icon: "▣", tone: "mint", group: "quick" },
  { id: "marks", label: "Marks", icon: "≋", tone: "purple", group: "quick" },
  { id: "exams", label: "Exams", icon: "◇", tone: "lilac", group: "academic", policy: "Offline Examinations" },
  { id: "library", label: "Library", icon: "▰", tone: "navy", group: "academic", policy: "Library" },
  { id: "ptm", label: "PTM Meetings", icon: "◫", tone: "pink", group: "academic", policy: "PTM Meetings" },
  { id: "lesson", label: "Lesson Planner", icon: "☷", tone: "green", group: "academic", policy: "Lesson Planner" },
  { id: "assessments", label: "Assessments", icon: "✓", tone: "cyan", group: "academic", policy: "Assessment" },
  { id: "fees", label: "Fees Due", icon: "₹", tone: "orange", group: "academic", policy: "Finance & Fees" },
  { id: "homework", label: "Homework", icon: "✎", tone: "amber", group: "academic" },
  { id: "gradebook", label: "Gradebook", icon: "▥", tone: "emerald", group: "academic" },
  { id: "students", label: "Students", icon: "♟", tone: "blue", group: "service" },
  { id: "logs", label: "My Logs", icon: "≡", tone: "slate", group: "service" },
  { id: "leaves", label: "Leaves", icon: "◌", tone: "amber", group: "service" },
  { id: "payroll", label: "Payroll", icon: "₹", tone: "rose", group: "service", policy: "Human Resource" },
];

const schedule = [
  ["08:00", "Mathematics", "Room 204", "Ms. Neha Kapoor"],
  ["09:00", "English", "Room 204", "Mr. Arjun Das"],
  ["10:15", "Science", "Lab 2", "Ms. Riya Sen"],
  ["11:15", "Social Studies", "Room 204", "Mr. Imran Ali"],
];

function money(paise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100);
}

export default function MobilePreviewPage() {
  const params = useParams<{ role: string }>();
  const routeRole = String(params.role ?? "student");
  const [state, setState] = useState<DemoState | null>(null);
  const [activeModule, setActiveModule] = useState<AppModule | null>(null);
  const [tab, setTab] = useState("Home");
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/v1/demo/state", { cache: "no-store" });
    if (response.status === 401) { globalThis.location.replace("/login"); return; }
    if (response.ok) setState(await response.json() as DemoState);
  }, []);

  useEffect(() => {
    const initial = globalThis.setTimeout(() => void load(), 0);
    const timer = globalThis.setInterval(load, 5000);
    return () => { globalThis.clearTimeout(initial); globalThis.clearInterval(timer); };
  }, [load]);

  async function action(payload: Record<string, unknown>, label: string) {
    setBusy(label);
    try {
      const response = await fetch("/api/v1/demo/action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Update failed");
      setToast(`${label} synchronized with Hig School`);
      await load();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Update failed");
    } finally {
      setBusy("");
      globalThis.setTimeout(() => setToast(""), 2600);
    }
  }

  function notify(message: string) {
    setToast(message);
    globalThis.setTimeout(() => setToast(""), 2600);
  }

  if (!state) return <main className={styles.loading}>Connecting securely to Hig School…</main>;
  if (routeRole === "driver") return <DriverApp state={state} busy={busy} toast={toast} action={action} notify={notify} />;

  const isStaff = routeRole === "staff";
  const isParent = state.user.role === "parent";
  const modules = (isStaff ? staffModules : isParent ? parentModules : studentModules).filter((module) => !module.policy || state.modules.find((policy) => policy.label === module.policy)?.enabled !== false);
  const roleLabel = isStaff ? "Teacher / Staff" : isParent ? "Parent" : "Student";

  function openModule(module: AppModule) {
    setActiveModule(module);
    setTab("Home");
    globalThis.scrollTo({ top: 0, behavior: "smooth" });
  }

  function chooseTab(next: string) {
    setTab(next);
    setActiveModule(next === "Home" ? null : { id: next.toLowerCase(), label: next, icon: next === "Profile" ? "♙" : next === "Notices" ? "◖" : "▦", tone: "orange", group: "service" });
    globalThis.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className={styles.app}>
      {activeModule ? (
        <ModuleScreen module={activeModule} state={state} isStaff={isStaff} busy={busy} onBack={() => { setActiveModule(null); setTab("Home"); }} onAction={action} onNotify={notify} />
      ) : (
        <>
          <AppHeader roleLabel={roleLabel} notificationCount={state.notifications.length} onNotify={notify} />
          <section className={styles.hero}>
            <div><span>{isStaff ? "FACULTY ID · NPS-T-014" : state.user.role === "parent" ? "AARAV SHARMA · GRADE 8 A" : "GRADE 8 · SECTION A"}</span><h1>Good morning, {state.user.name.split(" ")[0]}</h1><p>{state.school.name} · Monday, 26 July 2026</p></div>
            <i>{state.user.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2)}</i>
          </section>
          <section className={styles.summary}>
            <article><i className={styles.summaryIcon}>▣</i><p><b>{isStaff ? "4" : "92%"}</b><span>{isStaff ? "Classes" : "Attendance"}</span></p></article>
            <article><i className={styles.summaryIcon}>♟</i><p><b>{isStaff ? state.students.length : "18"}</b><span>{isStaff ? "Students" : "Class rank"}</span></p></article>
          </section>
          <ModuleGroup title="Quick access" modules={modules.filter((module) => module.group === "quick")} onOpen={openModule} />
          <ModuleGroup title="Academics" modules={modules.filter((module) => module.group === "academic")} onOpen={openModule} />
          <ModuleGroup title={isStaff ? "Management" : "School services"} modules={modules.filter((module) => module.group === "service")} onOpen={openModule} />
          <section className={styles.homeNotifications}>
            <ListCard title="Live notifications" items={state.notifications.slice(0, 4).map((item) => [item.title, item.message, new Date(item.createdAt).toLocaleTimeString("en-IN")])} empty="No new notifications." />
          </section>
          <section className={styles.todayCard}>
            <header><div><span>UP NEXT</span><h2>{schedule[0][1]}</h2></div><b>{schedule[0][0]}</b></header>
            <p>{schedule[0][2]} · {schedule[0][3]}</p>
            <button onClick={() => openModule({ id: "timetable", label: "Timetable", icon: "▦", tone: "amber", group: "academic" })}>View today&apos;s timetable →</button>
          </section>
          <div className={styles.syncLine}><i /> Live data · version {state.version} · {new Date(state.updatedAt).toLocaleTimeString("en-IN")}</div>
        </>
      )}
      <BottomNav active={tab} onActive={chooseTab} />
      {toast && <Toast text={toast} />}
    </main>
  );
}

function AppHeader({ roleLabel, notificationCount, onNotify }: { roleLabel: string; notificationCount: number; onNotify: (message: string) => void }) {
  return <header className={styles.header}><button aria-label="Open app menu" onClick={() => onNotify("All modules are available on this home screen")}>☰</button><div><i>H</i><span><b>Hig School</b><small>{roleLabel} app</small></span></div><nav><button aria-label="Search" onClick={() => onNotify("Search is ready for students, records and learning content")}>⌕</button><button aria-label={`Notifications ${notificationCount}`} onClick={() => onNotify(`${notificationCount} synchronized school notifications are available below`)}>♢{notificationCount > 0 && <em>{notificationCount > 9 ? "9+" : notificationCount}</em>}</button><a href="/login?logout=1" aria-label="Sign out">↗</a></nav></header>;
}

function ModuleGroup({ title, modules, onOpen }: { title: string; modules: AppModule[]; onOpen: (module: AppModule) => void }) {
  if (!modules.length) return null;
  return <section className={styles.moduleSection}><h2>{title}</h2><div className={styles.moduleGrid}>{modules.map((module) => <button data-testid={`module-${module.id}`} aria-label={`Open ${module.label}`} key={module.id} onClick={() => onOpen(module)}><i className={styles[module.tone]}>{module.icon}</i><span>{module.label}</span></button>)}</div></section>;
}

function ModuleScreen({ module, state, isStaff, busy, onBack, onAction, onNotify }: { module: AppModule; state: DemoState; isStaff: boolean; busy: string; onBack: () => void; onAction: (payload: Record<string, unknown>, label: string) => void; onNotify: (message: string) => void }) {
  const aarav = state.students.find((student) => student.fullName === "Aarav Sharma") ?? state.students[0];
  const attendance = state.operations.attendance.find((entry) => entry.studentId === aarav?.id);
  const homework = state.records.filter((record) => record.workflow === "Homework & Assignments");
  const notices = state.records.filter((record) => record.workflow === "Notice Board");
  const invoice = state.operations.invoices.find((item) => item.studentId === aarav?.id) ?? state.operations.invoices[0];

  function createHomework(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onAction({ action: "create_record", moduleKey: "Study Center", workflow: "Homework & Assignments", title: String(data.get("title")), description: String(data.get("description")), recordDate: "2026-07-26", dueDate: String(data.get("dueDate")), assignee: "Grade 8 A", priority: "normal" }, "Homework");
    event.currentTarget.reset();
  }

  return <section className={styles.screen} data-testid={`screen-${module.id}`}>
    <header><button aria-label={`Back from ${module.label}`} onClick={onBack}>‹</button><div><small>HIG SCHOOL</small><h1>{module.label}</h1></div><button aria-label={`${module.label} options`} onClick={() => onNotify(`${module.label} filters and export options opened`)}>•••</button></header>
    <div className={styles.screenBody}>
      {module.id === "attendance" && isStaff && <AttendanceRegister state={state} busy={busy} onAction={onAction} />}
      {module.id === "attendance" && !isStaff && <><StatusHero label="Today" value={attendance?.status ?? "Not marked"} note={`Updated ${attendance ? new Date(attendance.updatedAt).toLocaleTimeString("en-IN") : "—"}`} /><CalendarCard /></>}
      {module.id === "homework" && <><ListCard title="Assignments" items={homework.map((item) => [item.title, item.description, item.dueDate ? `Due ${item.dueDate}` : item.status])} empty="No assignments published." />{isStaff && <form className={styles.actionForm} onSubmit={createHomework}><h2>Publish homework</h2><input name="title" required placeholder="Assignment title" /><textarea name="description" required placeholder="Instructions" /><input name="dueDate" type="date" required defaultValue="2026-07-30" /><button type="submit" disabled={Boolean(busy)}>Publish to Grade 8 A</button></form>}</>}
      {(module.id === "timetable" || module.id === "academics") && <ScheduleCard />}
      {(module.id === "courses" || module.id === "syllabus" || module.id === "lesson") && <ProgressCards title={module.label} />}
      {(module.id === "assessments" || module.id === "exams" || module.id === "marks" || module.id === "gradebook" || module.id === "reports") && <AssessmentCard title={module.label} isStaff={isStaff} onAction={() => onAction({ action: "create_record", moduleKey: "Assessment", workflow: "Assessment Update", title: `${module.label} draft`, description: "Saved from Staff app", recordDate: "2026-07-26", dueDate: null, assignee: "Grade 8 A", priority: "normal" }, `${module.label} draft`)} />}
      {module.id === "fees" && <><StatusHero label="Outstanding balance" value={invoice ? money(invoice.amountPaise - invoice.paidPaise) : money(0)} note={invoice ? `${invoice.feeType} · due ${invoice.dueDate}` : "No outstanding fees"} /><ListCard title="Fee statement" items={state.operations.invoices.map((item) => [item.feeType, `${money(item.paidPaise)} paid of ${money(item.amountPaise)}`, item.status ?? "active"])} empty="No fee records." /></>}
      {module.id === "child" && <><StatusHero label="Aarav Sharma · Grade 8 A" value="On track" note="Attendance 92% · academic performance 84%" /><ListCard title="Child snapshot" items={[["Class teacher","Neha Kapoor","Mathematics"],["Attendance",attendance?.status ?? "Not marked","Updated by school"],["Outstanding fee",invoice ? money(invoice.amountPaise - invoice.paidPaise) : money(0),invoice?.dueDate ?? "No dues"]]} empty="No child linked." /></>}
      {module.id === "results" && <AssessmentCard title="Published results" isStaff={false} onAction={() => undefined} />}
      {module.id === "students" && <ListCard title="My students" items={state.students.map((item) => [item.fullName, `${item.className} · Section ${item.sectionName}`, item.admissionNumber ?? "Active"])} empty="No students assigned." />}
      {module.id === "notices" && <ListCard title="Notifications & notices" items={[...state.notifications.map((item) => [item.title, item.message, new Date(item.createdAt).toLocaleString("en-IN")]), ...notices.map((item) => [item.title, item.description, item.dueDate ?? item.status])]} empty="No notifications or notices available." />}
      {(module.id === "classes" || module.id === "ptm") && <ListCard title={module.label} items={state.records.filter((record) => module.id === "ptm" ? record.workflow.includes("PTM") : true).map((item) => [item.title, item.description, item.dueDate ?? item.status])} empty={`No ${module.label.toLowerCase()} available.`} />}
      {module.id === "events" && <ListCard title="School events" items={state.records.filter((record) => record.moduleKey === "Communicate").map((item) => [item.title, item.description, item.dueDate ?? item.status])} empty="No events announced." />}
      {module.id === "library" && <ListCard title="Issued books" items={[["The Discovery of India", "Jawaharlal Nehru", "Return by 02 Aug"], ["Mathematics Companion VIII", "Academic reference", "Issued today"]]} empty="No books issued." />}
      {module.id === "transport" && <TransportCard state={state} />}
      {module.id === "my-attendance" && <><StatusHero label="July attendance" value="96%" note="22 present · 1 leave" /><CalendarCard /></>}
      {module.id === "logs" && <ListCard title="Activity log" items={[["Attendance submitted", "Grade 8 A", "08:42 AM"], ["Lesson plan updated", "Mathematics · Chapter 4", "Yesterday"], ["Homework published", "Linear Equations", "Yesterday"]]} empty="No activity." />}
      {module.id === "leaves" && <ActionCard title="Leave balance" value="8 days" button="Apply for leave" onClick={() => onAction({ action: "create_record", moduleKey: "Human Resource", workflow: "Staff Leave", title: "Casual leave request", description: "Demo leave request", recordDate: "2026-07-26", dueDate: "2026-07-29", assignee: state.user.name, priority: "normal" }, "Leave request")} />}
      {module.id === "payroll" && <ActionCard title="July salary" value="₹58,400" button="Download payslip" onClick={() => onAction({ action: "create_record", moduleKey: "Human Resource", workflow: "Payroll", title: "July payslip viewed", description: "Employee accessed payslip", recordDate: "2026-07-26", dueDate: null, assignee: state.user.name, priority: "normal" }, "Payslip")} />}
      {module.id === "leave-request" && <ActionCard title="Student leave" value="New request" button="Send leave request" onClick={() => onAction({ action: "parent_request", requestType: "Student Leave", title: "Aarav Sharma leave request", description: "Parent requested one day of leave for a family commitment.", dueDate: "2026-07-29" }, "Leave request")} />}
      {module.id === "contact" && <ActionCard title="School support" value="+91 98765 43210" button="Send callback request" onClick={() => onAction({ action: "parent_request", requestType: "Callback", title: "Parent callback request", description: "Please call Neha Sharma regarding Aarav Sharma.", dueDate: "2026-07-27" }, "Callback request")} />}
      {module.id === "profile" && <ProfileCard state={state} />}
      {!["attendance","homework","timetable","academics","courses","syllabus","lesson","assessments","exams","marks","gradebook","reports","fees","child","results","students","notices","classes","ptm","events","library","transport","my-attendance","logs","leaves","payroll","leave-request","contact","profile"].includes(module.id) && <ListCard title={module.label} items={schedule.slice(0, 3).map((item) => [item[1], item[2], item[0]])} empty="No records." />}
    </div>
  </section>;
}

function AttendanceRegister({ state, busy, onAction }: { state: DemoState; busy: string; onAction: (payload: Record<string, unknown>, label: string) => void }) {
  return <section className={styles.register}><header><div><small>GRADE 8 · SECTION A</small><h2>Today&apos;s register</h2></div><b>{state.operations.attendance.length}/{state.students.length} marked</b></header>{state.students.map((student) => { const current = state.operations.attendance.find((entry) => entry.studentId === student.id)?.status; return <article key={student.id}><i>{student.fullName.split(/\s+/).map((part) => part[0]).join("")}</i><p><b>{student.fullName}</b><span>Roll {student.rollNumber ?? "—"} · {student.className}</span></p><div>{["present","late","absent"].map((status) => <button aria-label={`Mark ${student.fullName} ${status}`} className={current === status ? styles[`mark_${status}`] : ""} disabled={Boolean(busy)} key={status} onClick={() => onAction({ action: "mark_attendance", studentId: student.id, attendanceDate: "2026-07-26", status, note: `Marked in Staff app by ${state.user.name}` }, `${student.fullName} attendance`)}>{status[0].toUpperCase()}</button>)}</div></article>})}</section>;
}

function StatusHero({ label, value, note }: { label: string; value: string; note: string }) { return <article className={styles.statusHero}><span>{label}</span><b>{value}</b><small>{note}</small></article>; }
function CalendarCard() { return <section className={styles.calendar}><header><h2>July 2026</h2><span>92% overall</span></header><div>{["M","T","W","T","F","S","S",...Array.from({ length: 31 },(_,i)=>String(i+1))].map((day,index) => <i className={index > 6 && index % 9 === 0 ? styles.absentDay : index > 6 ? styles.presentDay : ""} key={`${day}-${index}`}>{day}</i>)}</div></section>; }
function ListCard({ title, items, empty }: { title: string; items: string[][]; empty: string }) { const [open,setOpen]=useState(-1); return <section className={styles.listCard}><header><h2>{title}</h2><span>{items.length} records</span></header>{items.length ? items.map((item,index)=><article className={open===index?styles.rowOpen:""} key={`${item[0]}-${index}`}><i>{item[0].slice(0,2).toUpperCase()}</i><p><b>{item[0]}</b><span>{item[1]}</span><small>{item[2]}</small>{open===index&&<em>Record details opened · synchronized with the School portal.</em>}</p><button aria-expanded={open===index} aria-label={`${open===index?"Close":"Open"} ${item[0]}`} onClick={()=>setOpen(open===index?-1:index)}>›</button></article>) : <p className={styles.empty}>{empty}</p>}</section>; }
function ScheduleCard() { return <ListCard title="Monday timetable" items={schedule.map((item) => [item[1], `${item[0]} · ${item[2]}`, item[3]])} empty="No periods scheduled." />; }
function ProgressCards({ title }: { title: string }) { return <><StatusHero label={`${title} progress`} value="72%" note="Academic session 2026–27" /><ListCard title="Current learning" items={[["Linear Equations","Mathematics · Chapter 4","8 of 12 lessons"],["The Last Leaf","English · Unit 3","5 of 8 lessons"],["Force and Pressure","Science · Chapter 7","3 of 10 lessons"]]} empty="No learning content." /></>; }
function AssessmentCard({ title, isStaff, onAction }: { title: string; isStaff: boolean; onAction: () => void }) { return <><StatusHero label="Term performance" value="84%" note="Up 4% from previous term" /><ListCard title={title} items={[["Mathematics Unit Test","42 / 50","A · Excellent"],["Science Practical","18 / 20","A+ · Outstanding"],["English Assessment","39 / 50","B+ · Very good"]]} empty="No assessment records." />{isStaff && <button className={styles.primaryAction} onClick={onAction}>Save marks draft</button>}</>; }
function TransportCard({ state }: { state: DemoState }) { return <><section className={styles.map}><div /><i>BUS</i><p><b>{state.driver.route}</b><span>{state.driver.vehicle} · {state.driver.speedKph} km/h</span></p></section><ListCard title="Trip details" items={[["Next stop","Dwarka Sector 10","4 minutes"],["Driver","Ramesh Kumar","Verified"],["Live location",`${state.driver.latitude.toFixed(4)}, ${state.driver.longitude.toFixed(4)}`,new Date(state.driver.updatedAt).toLocaleTimeString("en-IN")]]} empty="No trip." /></>; }
function ActionCard({ title, value, button, onClick }: { title: string; value: string; button: string; onClick: () => void }) { return <article className={styles.actionCard}><span>{title}</span><b>{value}</b><p>Updated from the connected School ERP.</p><button onClick={onClick}>{button}</button></article>; }
function ProfileCard({ state }: { state: DemoState }) { return <section className={styles.profile}><i>{state.user.name.split(/\s+/).map((part)=>part[0]).join("").slice(0,2)}</i><h2>{state.user.name}</h2><p>{state.user.role.replace("_"," ")} · {state.school.name}</p><dl><div><dt>Email</dt><dd>demo@northfield.edu</dd></div><div><dt>School session</dt><dd>2026–27</dd></div><div><dt>Data sync</dt><dd>Live · v{state.version}</dd></div></dl><a href="/login?logout=1">Sign out</a></section>; }

function BottomNav({ active, onActive }: { active: string; onActive: (item: string) => void }) {
  const items = [["Home","⌂"],["Timetable","▦"],["Notices","◖"],["Profile","♙"]];
  return <nav className={styles.bottomNav}>{items.map(([label,icon])=><button data-testid={`nav-${label.toLowerCase()}`} className={active===label?styles.navActive:""} key={label} onClick={()=>onActive(label)}><i>{icon}</i><span>{label}</span></button>)}</nav>;
}

function DriverApp({ state, busy, toast, action, notify }: { state: DemoState; busy: string; toast: string; action: (payload: Record<string, unknown>, label: string) => void; notify: (message: string) => void }) {
  const [view,setView]=useState("Live trip");
  return <main className={`${styles.app} ${styles.driver}`}><AppHeader roleLabel="Driver" notificationCount={state.notifications.length} onNotify={notify} /><section className={styles.driverHero}><span>LIVE ROUTE</span><h1>{state.driver.route}</h1><p>{state.driver.vehicle}</p><div><b>{state.driver.speedKph}<small> km/h</small></b><i>{state.driver.tripStatus.replace("_"," ")}</i></div></section>{view==="Live trip"&&<><TransportCard state={state}/><div className={styles.driverActions}><button disabled={Boolean(busy)} onClick={()=>action({action:"update_gps",latitude:state.driver.latitude+.0012,longitude:state.driver.longitude+.001,speedKph:32,heading:82,tripStatus:"in_progress"},"Live location")}>Update location</button><button disabled={Boolean(busy)} onClick={()=>action({action:"update_gps",latitude:state.driver.latitude,longitude:state.driver.longitude,speedKph:0,heading:state.driver.heading,tripStatus:state.driver.tripStatus==="completed"?"in_progress":"completed"},"Trip status")}>{state.driver.tripStatus==="completed"?"Start trip":"Complete trip"}</button><button className={styles.sos} disabled={Boolean(busy)} onClick={()=>action({action:"update_gps",latitude:state.driver.latitude,longitude:state.driver.longitude,speedKph:0,heading:state.driver.heading,tripStatus:"sos"},"Emergency SOS")}>SOS</button></div></>}{view==="Students"&&<ListCard title="Route students" items={state.students.map((student)=>[student.fullName,`${student.className} · ${student.sectionName}`,"Boarding confirmed"])} empty="No students."/>}{view==="History"&&<ListCard title="Trip history" items={[["Morning trip","26 Jul · 07:05–08:10","Completed"],["Afternoon trip","25 Jul · 14:10–15:22","Completed"]]} empty="No trips."/>}{view==="Profile"&&<ProfileCard state={state}/>}<nav className={styles.bottomNav}>{[["Live trip","⌖"],["Students","♟"],["History","◷"],["Profile","♙"]].map(([label,icon])=><button className={view===label?styles.navActive:""} data-testid={`driver-nav-${label.toLowerCase().replace(" ","-")}`} key={label} onClick={()=>setView(label)}><i>{icon}</i><span>{label}</span></button>)}</nav>{toast&&<Toast text={toast}/>}</main>;
}

function Toast({ text }: { text: string }) { return <div className={styles.toast}>✓ {text}</div>; }
