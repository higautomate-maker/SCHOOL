"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type SchoolStatus = "Active" | "Trial" | "Attention";

type School = {
  tenantId?: string;
  id: string;
  name: string;
  code: string;
  location: string;
  students: number;
  plan: string;
  status: SchoolStatus;
  renewal: string;
  color: string;
  invitation?: "Pending" | "Accepted";
};

type SchoolDetail = {
  tenantId: string; name: string; city: string; plan: string; status: string;
  adminEmail: string | null; invitationStatus: string | null; invitationExpiresAt: string | null;
  modules: Array<{ key: string; label: string; enabled: boolean }>;
  audit: Array<{ id: string; action: string; occurredAt: string }>;
};
type AccessRole = { id: string; name: string; key: string; system: boolean; description: string; permissions: string[] };

const navItems = [
  ["Overview", "⌂"],
  ["Schools", "▦"],
  ["Plans & billing", "₹"],
  ["Modules", "◫"],
  ["Access control", "◇"],
  ["Audit log", "≡"],
] as const;

const initialSchools: School[] = [
  { tenantId: "demo-northfield", id: "HIG-001", name: "Northfield Public School", code: "NPS", location: "New Delhi", students: 1842, plan: "Enterprise", status: "Active", renewal: "12 Aug 2026", color: "mint", invitation: "Accepted" },
  { id: "HIG-002", name: "Riverdale International", code: "RI", location: "Bengaluru", students: 1256, plan: "Enterprise", status: "Active", renewal: "28 Aug 2026", color: "peach" },
  { id: "HIG-003", name: "Sunrise Academy", code: "SA", location: "Jaipur", students: 684, plan: "Starter", status: "Trial", renewal: "Trial · 8 days", color: "lilac" },
  { id: "HIG-004", name: "Starlight Senior School", code: "SS", location: "Pune", students: 2190, plan: "Growth", status: "Attention", renewal: "Payment due", color: "yellow" },
];

const metrics = [
  { label: "Active schools", value: "94", delta: "+6.8%", note: "of 112 total", tone: "green", spark: [24, 30, 28, 40, 39, 52, 56, 68] },
  { label: "Students managed", value: "86,420", delta: "+4.2%", note: "across 182 campuses", tone: "navy", spark: [25, 31, 35, 37, 45, 43, 51, 59] },
  { label: "Monthly revenue", value: "₹28.4L", delta: "+12.4%", note: "ARR ₹3.41 Cr", tone: "orange", spark: [20, 26, 23, 38, 35, 44, 47, 64] },
  { label: "Platform health", value: "99.98%", delta: "Healthy", note: "All systems operational", tone: "teal", spark: [52, 54, 51, 55, 53, 55, 54, 58] },
];

const modules = [
  ["Student Information", "112 schools", "100%"],
  ["Fees & Finance", "98 schools", "87%"],
  ["Attendance", "104 schools", "93%"],
  ["Examinations", "89 schools", "79%"],
  ["Transport", "61 schools", "54%"],
];

const demoPermissionCatalogue: Array<[string, string, string]> = [
  ["students.view", "View students", "Students"], ["students.manage", "Manage admissions", "Students"],
  ["attendance.manage", "Take attendance", "Attendance"], ["fees.manage", "Manage fees", "Finance"],
  ["academics.manage", "Manage academics", "Academics"], ["reports.view", "View reports", "Reports"],
  ["roles.manage", "Manage roles", "Administration"],
];

const demoRoles: AccessRole[] = [
  { id: "demo-role-admin", name: "School Admin", key: "school_admin", system: true, description: "Complete school access", permissions: demoPermissionCatalogue.map(([permission]) => permission) },
  { id: "demo-role-teacher", name: "Teacher", key: "teacher", system: false, description: "Teaching and attendance", permissions: ["students.view", "attendance.manage", "academics.manage"] },
  { id: "demo-role-accountant", name: "Accountant", key: "accountant", system: false, description: "Fees and reports", permissions: ["fees.manage", "reports.view"] },
];

function Sparkline({ points, tone }: { points: number[]; tone: string }) {
  return <div className={`spark spark-${tone}`} aria-hidden="true">{points.map((point, index) => <i key={index} style={{ height: `${point}%` }} />)}</div>;
}

const moduleIcons: Record<string, string> = {
  "Finance & Fees": "₹", Accounts: "▤", "Student Information": "♟", Academics: "▥",
  "Front Office": "▣", "Lead Management": "◎", "Offline Examinations": "◇",
  "CBC Academics": "⬡", "Online Examinations": "▱", "Human Resource": "♣",
  "PTM Meetings": "◫", "Lesson Planner": "☷", "OSM Module": "✎",
  "QR Code Attendance": "▦", Assessment: "✓", "Live Classes": "◉",
  "Study Center": "▧", Certificates: "✹", Communicate: "◖", Library: "▰",
  Inventory: "▩", Transport: "▻", Hostel: "▥", "Help Center": "?",
  "Asset Management": "⬢", "Reports & Analytics": "⌁", "Settings & Billing": "⚙",
  "Apps Center": "••",
};

export default function Home() {
  const pathname = usePathname();
  const [active, setActive] = useState("Overview");
  const [schools, setSchools] = useState(initialSchools);
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("3 schools need your attention");
  const [submitting, setSubmitting] = useState(false);
  const [actorName, setActorName] = useState("Ankit Yadav");
  const [selectedSchool, setSelectedSchool] = useState<SchoolDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [schoolActionPending, setSchoolActionPending] = useState(false);
  const [roles, setRoles] = useState<AccessRole[]>([]);
  const [permissionCatalogue, setPermissionCatalogue] = useState<Array<[string, string, string]>>([]);
  const [activeRoleId, setActiveRoleId] = useState<string | null>(null);
  const [rolePending, setRolePending] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [companyPolicies, setCompanyPolicies] = useState<SchoolDetail["modules"]>([]);
  const [policyPending, setPolicyPending] = useState("");

  useEffect(() => {
    if (pathname === "/") {
      globalThis.location.replace("/login");
      return;
    }
    let activeRequest = true;
    fetch("/api/v1/schools", { headers: { accept: "application/json" } })
      .then(async (response) => response.ok ? response.json() as Promise<{ schools: School[]; actor: { displayName: string } }> : null)
      .then((data) => {
        if (!activeRequest || !data) return;
        setActorName(data.actor.displayName);
        if (data.schools.length) {
          const persistentIds = new Set(data.schools.map((school) => school.id));
          setSchools([...data.schools, ...initialSchools.filter((school) => !persistentIds.has(school.id))]);
        }
      })
      .catch(() => undefined);
    return () => { activeRequest = false; };
  }, [pathname]);

  useEffect(() => {
    if (active !== "Modules") return;
    let live = true;
    fetch("/api/v1/demo/state", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<{ modules: SchoolDetail["modules"] }> : null)
      .then((data) => { if (live && data) setCompanyPolicies(data.modules); })
      .catch(() => setNotice("Module policies could not be refreshed."));
    return () => { live = false; };
  }, [active]);

  const filteredSchools = useMemo(
    () => schools.filter((school) => `${school.name} ${school.location} ${school.plan}`.toLowerCase().includes(query.toLowerCase())),
    [schools, query],
  );

  async function addSchool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = { name: String(data.get("name") || ""), city: String(data.get("city") || ""), plan: String(data.get("plan") || "Growth"), adminEmail: String(data.get("adminEmail") || "") };
    setSubmitting(true);
    try {
      const response = await fetch("/api/v1/schools", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify(payload) });
      const result = await response.json() as { school?: School; error?: string };
      if (!response.ok || !result.school) throw new Error(result.error || "Onboarding failed");
      setSchools((items) => [result.school as School, ...items.filter((school) => school.id !== result.school?.id)]);
      setModalOpen(false);
      setActive("Schools");
      setNotice(`${result.school.name} was securely created · School Admin invitation pending`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "School onboarding could not be completed");
    } finally {
      setSubmitting(false);
    }
  }

  async function openSchool(school: School) {
    if (!school.tenantId) {
      setNotice("This seeded example is read-only. Add a school to manage live tenant settings.");
      return;
    }
    setDrawerLoading(true);
    try {
      if (school.tenantId === "demo-northfield") {
        const response = await fetch("/api/v1/demo/state");
        const demo = await response.json() as { school: { tenantId: string; name: string; city: string; plan: string; status: string; adminEmail: string }; modules: SchoolDetail["modules"]; audit: Array<{ id: string; action: string; occurredAt: string }> };
        if (!response.ok) throw new Error("Demo school could not be loaded");
        setSelectedSchool({ ...demo.school, invitationStatus: "accepted", invitationExpiresAt: "2027-03-31T23:59:59Z", modules: demo.modules, audit: demo.audit });
        setRoles(demoRoles);
        setPermissionCatalogue(demoPermissionCatalogue);
        setActiveRoleId(demoRoles[0].id);
        return;
      }
      const [detailResponse, rolesResponse] = await Promise.all([fetch(`/api/v1/schools/${encodeURIComponent(school.tenantId)}`), fetch(`/api/v1/schools/${encodeURIComponent(school.tenantId)}/roles`)]);
      const result = await detailResponse.json() as { school?: SchoolDetail; error?: string };
      const roleResult = await rolesResponse.json() as { roles?: AccessRole[]; permissions?: Array<[string, string, string]>; error?: string };
      if (!detailResponse.ok || !result.school) throw new Error(result.error || "School details could not be loaded");
      if (!rolesResponse.ok || !roleResult.roles || !roleResult.permissions) throw new Error(roleResult.error || "Roles could not be loaded");
      setSelectedSchool(result.school); setRoles(roleResult.roles); setPermissionCatalogue(roleResult.permissions); setActiveRoleId(roleResult.roles[0]?.id ?? null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "School details could not be loaded");
    } finally {
      setDrawerLoading(false);
    }
  }

  async function manageSchool(action: Record<string, unknown>) {
    if (!selectedSchool) return;
    setSchoolActionPending(true);
    try {
      if (selectedSchool.tenantId === "demo-northfield") {
        if (action.action === "update_plan") {
          const plan = String(action.plan);
          setSelectedSchool((current) => current ? { ...current, plan, audit: [{ id: crypto.randomUUID(), action: "subscription.plan_updated", occurredAt: new Date().toISOString() }, ...current.audit] } : current);
          setSchools((items) => items.map((school) => school.tenantId === "demo-northfield" ? { ...school, plan } : school));
          setNotice(`Northfield Public School plan changed to ${plan}`);
          return;
        }
        if (action.action === "set_module") {
          const response = await fetch("/api/v1/demo/action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(action) });
          const result = await response.json() as { modules?: SchoolDetail["modules"]; error?: string; audit?: SchoolDetail["audit"] };
          if (!response.ok || !result.modules) throw new Error(result.error || "Module access update failed");
          setSelectedSchool((current) => current ? { ...current, modules: result.modules!, audit: result.audit ?? current.audit } : current);
          setNotice("Module access updated. The School workspace will reflect it immediately.");
          return;
        }
      }
      const response = await fetch(`/api/v1/schools/${encodeURIComponent(selectedSchool.tenantId)}`, { method: "PATCH", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify(action) });
      const result = await response.json() as { school?: SchoolDetail; error?: string };
      if (!response.ok || !result.school) throw new Error(result.error || "School update failed");
      const updatedSchool = result.school;
      setSelectedSchool(updatedSchool);
      setSchools((items) => items.map((school) => school.tenantId === updatedSchool.tenantId ? { ...school, plan: updatedSchool.plan, invitation: updatedSchool.invitationStatus === "accepted" ? "Accepted" : "Pending" } : school));
      setNotice(`${updatedSchool.name} settings updated and audited`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "School update failed");
    } finally {
      setSchoolActionPending(false);
    }
  }

  async function manageRole(action: Record<string, unknown>) {
    if (!selectedSchool) return;
    setRolePending(true);
    try {
      if (selectedSchool.tenantId === "demo-northfield") {
        if (action.action === "create") {
          const role: AccessRole = { id: crypto.randomUUID(), name: String(action.name), key: String(action.name).toLowerCase().replace(/[^a-z0-9]+/g, "_"), system: false, description: "Demo custom role", permissions: Array.isArray(action.permissions) ? action.permissions as string[] : [] };
          setRoles((items) => [...items, role]); setActiveRoleId(role.id); setNewRoleName("");
        } else if (action.action === "update_permissions") {
          setRoles((items) => items.map((role) => role.id === action.roleId ? { ...role, permissions: action.permissions as string[] } : role));
        }
        setNotice("Demo role permissions updated.");
        return;
      }
      const response = await fetch(`/api/v1/schools/${encodeURIComponent(selectedSchool.tenantId)}/roles`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(action) });
      const result = await response.json() as { roles?: AccessRole[]; error?: string };
      if (!response.ok || !result.roles) throw new Error(result.error || "Role update failed");
      setRoles(result.roles);
      if (action.action === "create") { const created = result.roles.find((role) => role.name === action.name); setActiveRoleId(created?.id ?? activeRoleId); setNewRoleName(""); }
      setNotice(`${selectedSchool.name} role permissions updated and audited`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Role update failed"); }
    finally { setRolePending(false); }
  }

  async function updateCompanyPolicy(moduleKey: string, enabled: boolean) {
    setPolicyPending(moduleKey);
    try {
      const response = await fetch("/api/v1/demo/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "set_module", moduleKey, enabled }),
      });
      const result = await response.json() as { modules?: SchoolDetail["modules"]; error?: string };
      if (!response.ok || !result.modules) throw new Error(result.error || "Module policy update failed");
      setCompanyPolicies(result.modules);
      setSelectedSchool((school) => school?.tenantId === "demo-northfield" ? { ...school, modules: result.modules! } : school);
      const label = result.modules.find((module) => module.key === moduleKey)?.label ?? "Module";
      setNotice(`${label} ${enabled ? "enabled" : "disabled"} for Northfield Public School. School access synchronized.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Module policy update failed");
    } finally {
      setPolicyPending("");
    }
  }

  const activeRole = roles.find((role) => role.id === activeRoleId) ?? null;

  const displayTitle = active === "Overview" ? "Good morning, Ankit." : active;
  const displaySubtitle = active === "Overview" ? "Here’s what’s happening across your school network today." : `Manage ${active.toLowerCase()} across every tenant from one secure workspace.`;

  return (
    <main className="app-shell">
      <aside className={menuOpen ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <div className="brand-mark" aria-hidden="true"><span>H</span></div>
          <div><strong>Hig School</strong><small>COMMAND CENTER</small></div>
        </div>

        <nav aria-label="Primary navigation">
          <p className="nav-label">WORKSPACE</p>
          {navItems.map(([label, icon]) => (
            <button key={label} className={active === label ? "nav-item active" : "nav-item"} onClick={() => { setActive(label); setMenuOpen(false); }}>
              <span className="nav-icon">{icon}</span>{label}
              {label === "Schools" && <span className="nav-count">{schools.length}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="signal-card">
            <div className="signal-top"><span className="pulse-dot" /> All systems operational</div>
            <div className="signal-meta"><span>Last check</span><b>just now</b></div>
          </div>
          <button className="profile-button" onClick={() => setNotice("Profile controls are ready for secure identity integration")}>
            <span className="avatar">{actorName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><span><b>{actorName}</b><small>Platform Super Admin</small></span><span className="more">•••</span>
          </button>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <button className="menu-button" aria-label="Toggle navigation" onClick={() => setMenuOpen((value) => !value)}>☰</button>
          <label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search schools, students, invoices…" /><kbd>⌘ K</kbd></label>
          <div className="top-actions">
            <Link className="workspace-link" href="/school">School workspace <span>→</span></Link>
            <Link className="workspace-link" href="/login?logout=1">Sign out</Link>
            <button className="icon-button" aria-label="Help" onClick={() => setNotice("Hig School support center is ready")}>?</button>
            <button className="icon-button notification" aria-label="Notifications" onClick={() => setNotice("No new critical security alerts")}>♢<span /></button>
            <button className="primary-button compact" onClick={() => setModalOpen(true)}><span>＋</span> Add school</button>
          </div>
        </header>

        <div className="content">
          <div className="heading-row">
            <div><p className="eyebrow">22 JULY 2026 · PLATFORM OVERVIEW</p><h1>{displayTitle}</h1><p>{displaySubtitle}</p></div>
            <div className="period-switch"><button className="selected" onClick={() => setNotice("Dashboard period set to this month")}>This month</button><button onClick={() => setNotice("Dashboard period set to this year")}>This year</button></div>
          </div>

          <div className="notice-bar"><span className="notice-symbol">!</span><p><b>{notice}</b><small> Review billing, trial and security events to keep every school running smoothly.</small></p><button onClick={() => setActive("Schools")}>Review now <span>→</span></button></div>

          {active === "Modules" && (
            <section className="policy-workspace" aria-label="School module access control">
              <div className="policy-hero">
                <div><p className="eyebrow">LIVE TENANT POLICY</p><h2>Control what each school can use</h2><p>Company access is the source of truth. Disabled modules disappear from the School workspace and remain blocked for its users.</p></div>
                <div className="policy-school"><small>SELECTED SCHOOL</small><b><span>NPS</span> Northfield Public School</b><em>Enterprise · Active</em></div>
              </div>
              <div className="policy-summary">
                <article><span>Enabled</span><b>{companyPolicies.filter((module) => module.enabled).length}</b><small>of {companyPolicies.length} modules</small></article>
                <article><span>Disabled</span><b>{companyPolicies.filter((module) => !module.enabled).length}</b><small>hidden from school</small></article>
                <article><span>Synchronization</span><b className="policy-live"><i /> Live</b><small>applies immediately</small></article>
                <article><span>Policy changes</span><b>Audited</b><small>company administrator</small></article>
              </div>
              <div className="policy-card">
                <header><div><h3>Module access</h3><p>Toggle optional capabilities for Northfield Public School.</p></div><button onClick={() => openSchool(initialSchools[0])}>Advanced tenant settings →</button></header>
                <div className="policy-grid">
                  {companyPolicies.map((module) => (
                    <label className={module.enabled ? "policy-module enabled" : "policy-module"} key={module.key} data-testid={`company-module-${module.key}`}>
                      <span className="policy-icon">{moduleIcons[module.label] ?? "◫"}</span>
                      <span><b>{module.label}</b><small>{module.enabled ? "Available in School portal" : "Hidden and blocked"}</small></span>
                      <input type="checkbox" checked={module.enabled} disabled={Boolean(policyPending)} aria-label={`${module.enabled ? "Disable" : "Enable"} ${module.label} for Northfield Public School`} onChange={(event) => updateCompanyPolicy(module.key, event.target.checked)} />
                      <i className="policy-switch" />
                    </label>
                  ))}
                </div>
              </div>
              <div className="policy-explainer"><span>COMPANY</span><i>selects school & modules</i><b>→</b><span>SCHOOL PORTAL</span><i>shows enabled modules</i><b>→</b><span>USERS</span><i>follow role permissions</i></div>
            </section>
          )}

          {active !== "Modules" && <>
          <section className="metrics-grid" aria-label="Platform metrics">
              {metrics.map((metric) => <article className="metric-card" key={metric.label}><div className="metric-copy"><p>{metric.label}</p><strong>{metric.value}</strong><div><span className={`delta ${metric.tone}`}>{metric.delta}</span><small>{metric.note}</small></div></div><Sparkline points={metric.spark} tone={metric.tone} /></article>)}
          </section>

          <section className="dashboard-grid">
            <article className="card school-card">
              <div className="card-heading"><div><h2>Schools at a glance</h2><p>Recent tenant activity and subscription status.</p></div><button onClick={() => setActive("Schools")}>View all schools <span>→</span></button></div>
              <div className="school-table" role="table" aria-label="Recent schools">
                <div className="school-row school-header" role="row"><span>SCHOOL</span><span>STUDENTS</span><span>PLAN</span><span>STATUS</span><span>RENEWAL</span><span /></div>
                {filteredSchools.slice(0, active === "Schools" ? 8 : 4).map((school) => (
                  <div className="school-row" role="row" key={school.id}>
                    <div className="school-name"><span className={`school-badge ${school.color}`}>{school.code}</span><span><b>{school.name}</b><small>{school.location} · {school.id}</small></span></div>
                    <span className="numeric">{school.students.toLocaleString("en-IN")}</span><span className="plan">{school.plan}</span><span><i className={`status-dot ${school.status.toLowerCase()}`} />{school.status}</span><span className={school.status === "Attention" ? "renewal warning" : "renewal"}>{school.renewal}</span><button className="row-action" disabled={drawerLoading} aria-label={`Open ${school.name}`} onClick={() => openSchool(school)}>›</button>
                  </div>
                ))}
              </div>
            </article>

            <article className="card module-card">
              <div className="card-heading"><div><h2>Module adoption</h2><p>Usage across active schools.</p></div><button className="dots" aria-label="Module options" onClick={() => setActive("Modules")}>•••</button></div>
              <div className="module-list">{modules.map(([name, count, value]) => <div className="module-row" key={name}><div><b>{name}</b><span>{count}</span></div><div className="progress"><i style={{ width: value }} /></div><strong>{value}</strong></div>)}</div>
              <button className="secondary-button" onClick={() => setActive("Modules")}>Manage module policies</button>
            </article>

            <article className="card revenue-card">
              <div className="card-heading"><div><h2>Revenue trajectory</h2><p>Recurring revenue for the last 6 months.</p></div><span className="live-pill"><i /> LIVE</span></div>
              <div className="revenue-summary"><div><small>CURRENT MRR</small><strong>₹28.4L</strong></div><div><small>NET GROWTH</small><strong className="positive">+₹3.1L</strong></div><div><small>FAILED PAYMENTS</small><strong className="negative">₹42K</strong></div></div>
              <div className="bar-chart" aria-label="Monthly recurring revenue chart">{[["Feb",40],["Mar",48],["Apr",54],["May",61],["Jun",73],["Jul",88]].map(([month, height]) => <div key={month}><span style={{ height: `${height}%` }} /><small>{month}</small></div>)}</div>
            </article>

            <article className="card activity-card">
              <div className="card-heading"><div><h2>Recent activity</h2><p>Platform-wide audit stream.</p></div><button onClick={() => setActive("Audit log")}>Open audit log <span>→</span></button></div>
              <div className="timeline">
                <div><span className="activity-icon green">＋</span><p><b>New school onboarded</b><small>Sunrise Academy · by Ankit Yadav</small></p><time>18 min</time></div>
                <div><span className="activity-icon orange">₹</span><p><b>Subscription upgraded</b><small>Riverdale International · Growth → Enterprise</small></p><time>1 hr</time></div>
                <div><span className="activity-icon blue">◇</span><p><b>Role policy updated</b><small>School Admin · 3 permissions changed</small></p><time>3 hrs</time></div>
                <div><span className="activity-icon gray">!</span><p><b>Payment retry scheduled</b><small>Starlight Senior School · invoice #HS-8042</small></p><time>5 hrs</time></div>
              </div>
            </article>
          </section>
          </>}

          <footer><span>© 2026 HIG Automation India Private Limited</span><span><i className="footer-dot" /> Data protected · India region</span></footer>
        </div>
      </section>

      {selectedSchool && <div className="drawer-backdrop" role="presentation" onMouseDown={() => !schoolActionPending && !rolePending && setSelectedSchool(null)}><aside className="school-drawer" role="dialog" aria-modal="true" aria-labelledby="school-drawer-title" onMouseDown={(event) => event.stopPropagation()}><div className="drawer-header"><div><p className="eyebrow">TENANT CONTROL</p><h2 id="school-drawer-title">{selectedSchool.name}</h2><span>{selectedSchool.city} · {selectedSchool.status}</span></div><button disabled={schoolActionPending || rolePending} onClick={() => setSelectedSchool(null)} aria-label="Close school settings">×</button></div><section className="drawer-section"><div className="drawer-section-title"><div><h3>Subscription plan</h3><p>Changes apply immediately to module entitlements.</p></div><span className="audit-chip">AUDITED</span></div><div className="plan-options">{["Starter","Growth","Enterprise"].map((plan) => <button disabled={schoolActionPending} className={selectedSchool.plan === plan ? "selected" : ""} key={plan} onClick={() => manageSchool({ action: "update_plan", plan })}><b>{plan}</b><small>{plan === "Starter" ? "₹1,499" : plan === "Growth" ? "₹3,499" : "₹7,999"}/mo</small></button>)}</div></section><section className="drawer-section"><div className="drawer-section-title"><div><h3>Enabled modules</h3><p>School-specific overrides take precedence over plan defaults.</p></div></div><div className="toggle-list">{selectedSchool.modules.map((module) => <label key={module.key}><span><b>{module.label}</b><small>{module.enabled ? "Available to authorized roles" : "Hidden for this tenant"}</small></span><input type="checkbox" checked={module.enabled} disabled={schoolActionPending} onChange={(event) => manageSchool({ action: "set_module", moduleKey: module.key, enabled: event.target.checked })} /><i /></label>)}</div></section><section className="drawer-section role-section"><div className="drawer-section-title"><div><h3>Roles & permissions</h3><p>Granular tenant-scoped access. System safeguards cannot be removed.</p></div><span className="audit-chip">TENANT SAFE</span></div><div className="role-tabs">{roles.map((role) => <button className={activeRoleId === role.id ? "selected" : ""} key={role.id} onClick={() => setActiveRoleId(role.id)}>{role.name}{role.system && <small>SYSTEM</small>}</button>)}</div><div className="new-role"><input aria-label="New role name" value={newRoleName} onChange={(event) => setNewRoleName(event.target.value)} placeholder="New custom role" maxLength={50} /><button disabled={rolePending || newRoleName.trim().length < 2} onClick={() => manageRole({ action: "create", name: newRoleName, permissions: ["students.view"] })}>Add role</button></div>{activeRole && <div className="permission-matrix">{permissionCatalogue.map(([permission,label,group]) => <label key={permission}><span><small>{group}</small><b>{label}</b></span><input type="checkbox" checked={activeRole.permissions.includes(permission)} disabled={rolePending || (activeRole.system && permission === "roles.manage")} onChange={(event) => { const next = event.target.checked ? [...activeRole.permissions,permission] : activeRole.permissions.filter((item) => item !== permission); manageRole({ action: "update_permissions", roleId: activeRole.id, permissions: next }); }} /><i /></label>)}</div>}</section><section className="drawer-section invitation-box"><div><span className={`invitation-state ${selectedSchool.invitationStatus}`}>{selectedSchool.invitationStatus ?? "Not created"}</span><h3>School Admin invitation</h3><p>{selectedSchool.adminEmail ?? "No administrator email"}</p><small>{selectedSchool.invitationExpiresAt ? `Expires ${new Date(selectedSchool.invitationExpiresAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}` : "No active invitation"}</small></div><div className="invitation-actions"><button disabled={schoolActionPending} onClick={() => manageSchool({ action: "resend_invitation" })}>Rotate & resend</button><button className="danger" disabled={schoolActionPending || selectedSchool.invitationStatus === "revoked"} onClick={() => manageSchool({ action: "revoke_invitation" })}>Revoke</button></div></section><section className="drawer-section"><div className="drawer-section-title"><div><h3>Recent tenant audit</h3><p>Newest security-sensitive changes for this school.</p></div></div><div className="drawer-audit">{selectedSchool.audit.map((event) => <div key={event.id}><span className="activity-icon green">✓</span><p><b>{event.action.replaceAll(".", " ")}</b><small>{new Date(event.occurredAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</small></p></div>)}</div></section></aside></div>}

      {modalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => !submitting && setModalOpen(false)}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-school-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" disabled={submitting} onClick={() => setModalOpen(false)}>×</button><p className="eyebrow">TENANT ONBOARDING</p><h2 id="add-school-title">Add a new school</h2><p>Create an isolated tenant workspace with a secure trial plan.</p><form onSubmit={addSchool}><label>School name<input name="name" required minLength={3} maxLength={120} placeholder="e.g. Greenfield Academy" /></label><div className="form-row"><label>City<input name="city" required minLength={2} maxLength={80} placeholder="Mumbai" /></label><label>Plan<select name="plan" defaultValue="Growth"><option>Starter</option><option>Growth</option><option>Enterprise</option></select></label></div><label>School Admin email<input name="adminEmail" required type="email" autoComplete="email" placeholder="admin@greenfield.edu" /></label><div className="tenant-preview"><span className="pulse-dot" /><div><b>Tenant isolation enabled</b><small>The campus, plan, module policy, scoped admin membership and immutable audit event are created together.</small></div></div><button className="primary-button" disabled={submitting} type="submit">{submitting ? "Creating secure workspace…" : "Create school & invitation"} {!submitting && <span>→</span>}</button></form></div></div>}
    </main>
  );
}
