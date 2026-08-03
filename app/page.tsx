"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "./components/logout-button";
import { authenticatedFetch } from "./auth-client";

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
type AppAudience = "parent" | "student" | "transporter";
type AccessAudienceTab = "school" | AppAudience;
type CompanyModulePolicy = {
  key: string;
  label: string;
  category: string;
  description: string;
  displayOrder: number;
  enabled: boolean;
  source: "plan" | "override" | "missing";
};
type CompanyAppFeaturePolicy = {
  key: string;
  audience: AppAudience;
  label: string;
  description: string;
  displayOrder: number;
  requiredSchoolModule: string | null;
  requiredSchoolModuleLabel: string | null;
  policyEnabled: boolean;
  effectiveEnabled: boolean;
  dependencySatisfied: boolean;
  source: "tenant" | "plan" | "missing";
  blockedReason: string | null;
};
type CompanyAccessConfiguration = {
  tenantId: string;
  schoolName: string;
  plan: string;
  modules: CompanyModulePolicy[];
  appFeatures: Record<AppAudience, CompanyAppFeaturePolicy[]>;
};

const accessTabLabels: Record<AccessAudienceTab, string> = {
  school: "School Web Modules",
  parent: "Parent App",
  student: "Student App",
  transporter: "Transporter App",
};

type CompanySection = "Overview" | "Schools" | "Modules" | "Access control";

type CompanyNavigationItem = {
  label: CompanySection | "Plans & billing" | "Audit log";
  icon: string;
  disabledReason?: string;
};

const navItems: readonly CompanyNavigationItem[] = [
  { label: "Overview", icon: "⌂" },
  { label: "Schools", icon: "▦" },
  {
    label: "Plans & billing",
    icon: "₹",
    disabledReason: "Platform-wide billing requires the billing ledger API. School plan changes remain available in School controls.",
  },
  { label: "Modules", icon: "◫" },
  { label: "Access control", icon: "◇" },
  {
    label: "Audit log",
    icon: "≡",
    disabledReason: "Platform-wide audit search is not available yet. Tenant audit history remains available in School controls.",
  },
];

const initialSchools: School[] = [];

function Sparkline({ points, tone }: { points: number[]; tone: string }) {
  return <div className={`spark spark-${tone}`} aria-hidden="true">{points.map((point, index) => <i key={index} style={{ height: `${point}%` }} />)}</div>;
}

function CompanyAccessWorkspace({
  access,
  schools,
  loading,
  pendingKey,
  audience,
  onAudienceChange,
  onSchoolChange,
  onToggleModule,
  onToggleFeature,
  onOpenSchool,
}: {
  access: CompanyAccessConfiguration | null;
  schools: School[];
  loading: boolean;
  pendingKey: string;
  audience: AccessAudienceTab;
  onAudienceChange: (audience: AccessAudienceTab) => void;
  onSchoolChange: (tenantId: string) => void;
  onToggleModule: (moduleKey: string, enabled: boolean) => void;
  onToggleFeature: (audience: AppAudience, featureKey: string, enabled: boolean) => void;
  onOpenSchool: () => void;
}) {
  const enabledModules = access?.modules.filter((moduleDefinition) => moduleDefinition.enabled).length ?? 0;
  const currentFeatures = audience === "school" || !access ? [] : access.appFeatures[audience];
  const enabledFeatures = currentFeatures.filter((feature) => feature.effectiveEnabled).length;
  const selectedSchool = schools.find((school) => school.tenantId === access?.tenantId);

  return (
    <section className="policy-workspace" aria-label="School and app access control">
      <div className="policy-hero">
        <div>
          <p className="eyebrow">COMPANY ACCESS POLICY</p>
          <h2>Control each school and linked app</h2>
          <p>Company settings are the upper access boundary. School roles can only narrow School web access, while app features also require a valid user relationship or assignment.</p>
        </div>
        <label className="policy-school-selector">
          <small>SELECT LIVE SCHOOL</small>
          <select
            value={access?.tenantId ?? ""}
            disabled={loading || schools.length === 0}
            onChange={(event) => onSchoolChange(event.target.value)}
          >
            <option value="" disabled>{schools.length ? "Choose a school" : "No live school available"}</option>
            {schools.filter((school) => school.tenantId).map((school) => (
              <option key={school.tenantId} value={school.tenantId}>{school.name} · {school.plan}</option>
            ))}
          </select>
          {access && <em>{access.plan} · tenant-specific policy</em>}
        </label>
      </div>

      {!access ? (
        <div className="policy-empty">
          <b>{loading ? "Loading access configuration…" : "Select a live school"}</b>
          <span>Only persisted tenant schools can receive module and app policies.</span>
        </div>
      ) : (
        <>
          <div className="policy-summary">
            <article><span>School modules</span><b>{enabledModules}</b><small>of {access.modules.length} enabled</small></article>
            <article><span>{audience === "school" ? "Disabled" : "Effective app features"}</span><b>{audience === "school" ? access.modules.length - enabledModules : enabledFeatures}</b><small>{audience === "school" ? "hidden and API-blocked" : `of ${currentFeatures.length} available`}</small></article>
            <article><span>Selected school</span><b className="policy-school-name">{selectedSchool?.code ?? access.schoolName.slice(0, 2).toUpperCase()}</b><small>{access.schoolName}</small></article>
            <article><span>Policy changes</span><b>Audited</b><small>company administrator</small></article>
          </div>

          <div className="policy-card">
            <header className="policy-card-header">
              <div>
                <h3>Access configuration</h3>
                <p>School Web Modules and app personas are managed independently for {access.schoolName}.</p>
              </div>
              <button onClick={onOpenSchool}>Open school controls →</button>
            </header>
            <div className="access-tabs" role="tablist" aria-label="Access policy audience">
              {(["school", "parent", "student", "transporter"] as const).map((tab) => (
                <button
                  key={tab}
                  role="tab"
                  aria-selected={audience === tab}
                  className={audience === tab ? "selected" : ""}
                  onClick={() => onAudienceChange(tab)}
                >
                  {accessTabLabels[tab]}
                </button>
              ))}
            </div>

            {audience === "school" ? (
              <div className="policy-grid">
                {access.modules.map((moduleDefinition) => (
                  <label className={moduleDefinition.enabled ? "policy-module enabled" : "policy-module"} key={moduleDefinition.key} data-testid={`company-module-${moduleDefinition.key}`}>
                    <span className="policy-icon">{moduleIcons[moduleDefinition.label] ?? "◫"}</span>
                    <span>
                      <b>{moduleDefinition.label}</b>
                      <small>{moduleDefinition.enabled ? `Enabled · ${moduleDefinition.category}` : "Hidden from School navigation and blocked by API"}</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={moduleDefinition.enabled}
                      disabled={Boolean(pendingKey)}
                      aria-label={`${moduleDefinition.enabled ? "Disable" : "Enable"} ${moduleDefinition.label} for ${access.schoolName}`}
                      onChange={(event) => onToggleModule(moduleDefinition.key, event.target.checked)}
                    />
                    <i className="policy-switch" />
                  </label>
                ))}
              </div>
            ) : (
              <div className="app-policy-grid">
                {currentFeatures.map((feature) => (
                  <label className={feature.effectiveEnabled ? "app-policy enabled" : feature.policyEnabled ? "app-policy blocked" : "app-policy"} key={`${feature.audience}-${feature.key}`}>
                    <span>
                      <b>{feature.label}</b>
                      <small>{feature.blockedReason ?? feature.description}</small>
                      <em>{feature.source === "tenant" ? "School override" : feature.source === "plan" ? "Plan default" : "Disabled by default"}{feature.requiredSchoolModuleLabel ? ` · requires ${feature.requiredSchoolModuleLabel}` : ""}</em>
                    </span>
                    <input
                      type="checkbox"
                      checked={feature.policyEnabled}
                      disabled={Boolean(pendingKey)}
                      aria-label={`${feature.policyEnabled ? "Disable" : "Enable"} ${feature.label} for ${access.schoolName}`}
                      onChange={(event) => onToggleFeature(feature.audience, feature.key, event.target.checked)}
                    />
                    <i className="policy-switch" />
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="policy-explainer"><span>COMPANY</span><i>enables School or app capability</i><b>→</b><span>SCHOOL</span><i>grants role subset</i><b>→</b><span>USER</span><i>must have valid relationship</i></div>
        </>
      )}
    </section>
  );
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
  const [active, setActive] = useState<CompanySection>("Overview");
  const [schools, setSchools] = useState(initialSchools);
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("Select a school to review its plan, module access and app policies.");
  const [submitting, setSubmitting] = useState(false);
  const [actorName, setActorName] = useState("Ankit Yadav");
  const [selectedSchool, setSelectedSchool] = useState<SchoolDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [schoolActionPending, setSchoolActionPending] = useState(false);
  const [accessConfiguration, setAccessConfiguration] = useState<CompanyAccessConfiguration | null>(null);
  const [accessAudience, setAccessAudience] = useState<AccessAudienceTab>("school");
  const [accessLoading, setAccessLoading] = useState(false);
  const [policyPending, setPolicyPending] = useState("");

  const loadAccessConfiguration = useCallback(async (
    tenantId: string,
  ): Promise<CompanyAccessConfiguration | null> => {
    setAccessLoading(true);
    try {
      const response = await authenticatedFetch(
        `/api/v1/schools/${encodeURIComponent(tenantId)}/access`,
      );
      const result = await response.json() as {
        access?: CompanyAccessConfiguration;
        error?: string;
      };
      if (!response.ok || !result.access) {
        throw new Error(result.error || "Access configuration could not be loaded");
      }
      setAccessConfiguration(result.access);
      return result.access;
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Access configuration could not be loaded",
      );
      return null;
    } finally {
      setAccessLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pathname === "/") {
      globalThis.location.replace("/login");
      return;
    }
    let activeRequest = true;
    authenticatedFetch("/api/v1/schools", { headers: { accept: "application/json" } })
      .then(async (response) => response.ok ? response.json() as Promise<{ schools: School[]; actor: { displayName: string } }> : null)
      .then((data) => {
        if (!activeRequest || !data) return;
        setActorName(data.actor.displayName);
        setSchools(data.schools);
        const firstLiveSchool = data.schools.find((school) => school.tenantId);
        if (firstLiveSchool?.tenantId) void loadAccessConfiguration(firstLiveSchool.tenantId);
      })
      .catch(() => undefined);
    return () => { activeRequest = false; };
  }, [loadAccessConfiguration, pathname]);

  const filteredSchools = useMemo(
    () => schools.filter((school) => `${school.name} ${school.location} ${school.plan}`.toLowerCase().includes(query.toLowerCase())),
    [schools, query],
  );

  const overviewMetrics = useMemo(() => {
    const activeSchools = schools.filter((school) => school.status === "Active").length;
    const trialSchools = schools.filter((school) => school.status === "Trial").length;
    const attentionSchools = schools.filter((school) => school.status === "Attention").length;
    const studentsManaged = schools.reduce((total, school) => total + school.students, 0);
    return [
      { label: "Active schools", value: activeSchools.toLocaleString("en-IN"), delta: "LIVE", note: `of ${schools.length} tenants`, tone: "green", spark: [24, 30, 28, 40, 39, 52, 56, 68] },
      { label: "Students managed", value: studentsManaged.toLocaleString("en-IN"), delta: "LIVE", note: "from tenant records", tone: "navy", spark: [25, 31, 35, 37, 45, 43, 51, 59] },
      { label: "Trial schools", value: trialSchools.toLocaleString("en-IN"), delta: "TRIAL", note: "onboarding in progress", tone: "orange", spark: [20, 26, 23, 38, 35, 44, 47, 64] },
      { label: "Needs attention", value: attentionSchools.toLocaleString("en-IN"), delta: attentionSchools ? "REVIEW" : "CLEAR", note: "tenant status", tone: "teal", spark: [52, 54, 51, 55, 53, 55, 54, 58] },
    ];
  }, [schools]);

  const selectedModuleSnapshot = useMemo(
    () => accessConfiguration?.modules.slice(0, 6) ?? [],
    [accessConfiguration],
  );

  async function addSchool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = { name: String(data.get("name") || ""), city: String(data.get("city") || ""), plan: String(data.get("plan") || "Growth"), adminEmail: String(data.get("adminEmail") || "") };
    setSubmitting(true);
    try {
      const response = await authenticatedFetch("/api/v1/schools", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify(payload) });
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
      setNotice("Only a persisted tenant school can be managed.");
      return;
    }
    setDrawerLoading(true);
    try {
      const [detailResponse, access] = await Promise.all([
        authenticatedFetch(`/api/v1/schools/${encodeURIComponent(school.tenantId)}`),
        loadAccessConfiguration(school.tenantId),
      ]);
      const result = await detailResponse.json() as { school?: SchoolDetail; error?: string };
      if (!detailResponse.ok || !result.school) throw new Error(result.error || "School details could not be loaded");
      setSelectedSchool(result.school);
      if (!access) setAccessAudience("school");
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
      const response = await authenticatedFetch(`/api/v1/schools/${encodeURIComponent(selectedSchool.tenantId)}`, { method: "PATCH", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify(action) });
      const result = await response.json() as { school?: SchoolDetail; error?: string };
      if (!response.ok || !result.school) throw new Error(result.error || "School update failed");
      const updatedSchool = result.school;
      setSelectedSchool(updatedSchool);
      setSchools((items) => items.map((school) => school.tenantId === updatedSchool.tenantId ? { ...school, plan: updatedSchool.plan, invitation: updatedSchool.invitationStatus === "accepted" ? "Accepted" : "Pending" } : school));
      await loadAccessConfiguration(updatedSchool.tenantId);
      setNotice(`${updatedSchool.name} settings updated and audited`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "School update failed");
    } finally {
      setSchoolActionPending(false);
    }
  }

  async function updateCompanyAccess(action: Record<string, unknown>, pendingKey: string) {
    if (!accessConfiguration) return;
    setPolicyPending(pendingKey);
    try {
      const response = await authenticatedFetch(
        `/api/v1/schools/${encodeURIComponent(accessConfiguration.tenantId)}/access`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "idempotency-key": crypto.randomUUID(),
          },
          body: JSON.stringify(action),
        },
      );
      const result = await response.json() as { access?: CompanyAccessConfiguration; error?: string };
      if (!response.ok || !result.access) throw new Error(result.error || "Access policy update failed");
      setAccessConfiguration(result.access);
      if (selectedSchool?.tenantId === result.access.tenantId) {
        setSelectedSchool((school) => school ? {
          ...school,
          modules: result.access!.modules.map((moduleDefinition) => ({
            key: moduleDefinition.key,
            label: moduleDefinition.label,
            enabled: moduleDefinition.enabled,
          })),
        } : school);
      }
      setNotice(`${result.access.schoolName} access policy updated and audited`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Access policy update failed");
    } finally {
      setPolicyPending("");
    }
  }

  function updateCompanyModule(moduleKey: string, enabled: boolean) {
    return updateCompanyAccess({ action: "set_module", moduleKey, enabled }, `module:${moduleKey}`);
  }

  function updateCompanyAppFeature(audience: AppAudience, featureKey: string, enabled: boolean) {
    return updateCompanyAccess(
      { action: "set_app_feature", audience, featureKey, enabled },
      `${audience}:${featureKey}`,
    );
  }

  function navigateCompany(section: CompanySection) {
    setActive(section);
    setMenuOpen(false);
    if (section === "Modules") setAccessAudience("school");
    if (section === "Access control" && accessAudience === "school") setAccessAudience("parent");
  }

  const displayTitle = active === "Overview" ? `Good morning, ${actorName.split(/\s+/)[0] || "Administrator"}.` : active;
  const displaySubtitle = active === "Overview"
    ? "Live tenant information and access controls for your school network."
    : active === "Schools"
      ? "Open a persisted tenant to manage its plan, invitation and module access."
      : `Manage ${active.toLowerCase()} for the selected tenant.`;
  const todayLabel = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date()).toUpperCase();

  return (
    <main className="app-shell">
      <aside className={menuOpen ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <div className="brand-mark" aria-hidden="true"><span>H</span></div>
          <div><strong>HIG School</strong><small>COMMAND CENTER</small></div>
        </div>

        <nav aria-label="Primary navigation">
          <p className="nav-label">WORKSPACE</p>
          {navItems.map((item) => (
            <button
              key={item.label}
              className={`${active === item.label ? "nav-item active" : "nav-item"}${item.disabledReason ? " nav-item-disabled" : ""}`}
              disabled={Boolean(item.disabledReason)}
              title={item.disabledReason}
              onClick={() => {
                if (!item.disabledReason) navigateCompany(item.label as CompanySection);
              }}
            >
              <span className="nav-icon">{item.icon}</span>{item.label}
              {item.label === "Schools" && <span className="nav-count">{schools.length}</span>}
              {item.disabledReason && <span className="nav-planned">PLANNED</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="signal-card">
            <div className="signal-top"><span className="pulse-dot" /> All systems operational</div>
            <div className="signal-meta"><span>Last check</span><b>just now</b></div>
          </div>
          <button className="profile-button" disabled title="Profile management requires secure identity integration.">
            <span className="avatar">{actorName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><span><b>{actorName}</b><small>Platform Super Admin</small></span><span className="more">LOCKED</span>
          </button>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <button className="menu-button" aria-label="Toggle navigation" onClick={() => setMenuOpen((value) => !value)}>☰</button>
          <label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search schools, students, invoices…" /><kbd>⌘ K</kbd></label>
          <div className="top-actions">
            <Link className="workspace-link" href="/school">School workspace <span>→</span></Link>
            <LogoutButton className="workspace-link" />
            <button className="icon-button" aria-label="Help" disabled title="The Company support center is planned for a later stage.">?</button>
            <button className="icon-button notification" aria-label="Notifications" disabled title="Company notification inbox is not connected yet.">♢</button>
            <button className="primary-button compact" onClick={() => setModalOpen(true)}><span>＋</span> Add school</button>
          </div>
        </header>

        <div className="content">
          <div className="heading-row">
            <div><p className="eyebrow">{todayLabel} · COMPANY PLATFORM</p><h1>{displayTitle}</h1><p>{displaySubtitle}</p></div>
            <span className="live-context"><i /> LIVE TENANT DATA</span>
          </div>

          <div className="notice-bar"><span className="notice-symbol">!</span><p><b>{notice}</b><small> Every change made through live controls is tenant-scoped and audited.</small></p><button onClick={() => navigateCompany("Schools")}>Review schools <span>→</span></button></div>

          {(active === "Modules" || active === "Access control") && (
            <CompanyAccessWorkspace
              access={accessConfiguration}
              schools={schools.filter((school) => school.tenantId)}
              loading={accessLoading}
              pendingKey={policyPending}
              audience={accessAudience}
              onAudienceChange={setAccessAudience}
              onSchoolChange={(tenantId) => { void loadAccessConfiguration(tenantId); }}
              onToggleModule={(moduleKey, enabled) => { void updateCompanyModule(moduleKey, enabled); }}
              onToggleFeature={(audience, featureKey, enabled) => { void updateCompanyAppFeature(audience, featureKey, enabled); }}
              onOpenSchool={() => {
                const school = schools.find((item) => item.tenantId === accessConfiguration?.tenantId);
                if (school) void openSchool(school);
              }}
            />
          )}

          {active === "Overview" && <>
            <section className="metrics-grid" aria-label="Live platform metrics">
              {overviewMetrics.map((metric) => <article className="metric-card" key={metric.label}><div className="metric-copy"><p>{metric.label}</p><strong>{metric.value}</strong><div><span className={`delta ${metric.tone}`}>{metric.delta}</span><small>{metric.note}</small></div></div><Sparkline points={metric.spark} tone={metric.tone} /></article>)}
            </section>

            <section className="dashboard-grid">
              <article className="card school-card">
                <div className="card-heading"><div><h2>Schools at a glance</h2><p>Live tenant and subscription status.</p></div><button onClick={() => navigateCompany("Schools")}>View all schools <span>→</span></button></div>
                <div className="school-table" role="table" aria-label="Recent schools">
                  <div className="school-row school-header" role="row"><span>SCHOOL</span><span>STUDENTS</span><span>PLAN</span><span>STATUS</span><span>RENEWAL</span><span /></div>
                  {filteredSchools.slice(0, 4).map((school) => (
                    <div className="school-row" role="row" key={school.id}>
                      <div className="school-name"><span className={`school-badge ${school.color}`}>{school.code}</span><span><b>{school.name}</b><small>{school.location} · {school.id}</small></span></div>
                      <span className="numeric">{school.students.toLocaleString("en-IN")}</span><span className="plan">{school.plan}</span><span><i className={`status-dot ${school.status.toLowerCase()}`} />{school.status}</span><span className={school.status === "Attention" ? "renewal warning" : "renewal"}>{school.renewal}</span><button className="row-action" disabled={drawerLoading} aria-label={`Open ${school.name}`} onClick={() => openSchool(school)}>›</button>
                    </div>
                  ))}
                  {!filteredSchools.length && <div className="company-empty-state"><b>No schools found</b><span>Create a school or change the search term.</span></div>}
                </div>
              </article>

              <article className="card module-card">
                <div className="card-heading"><div><h2>Selected tenant access</h2><p>{accessConfiguration ? accessConfiguration.schoolName : "Choose a live school"}</p></div><button className="dots" aria-label="Open module controls" onClick={() => navigateCompany("Modules")}>•••</button></div>
                <div className="module-list">{selectedModuleSnapshot.map((moduleDefinition) => <div className="module-row" key={moduleDefinition.key}><div><b>{moduleDefinition.label}</b><span>{moduleDefinition.enabled ? "Enabled" : "Disabled"}</span></div><div className="progress"><i style={{ width: moduleDefinition.enabled ? "100%" : "0%" }} /></div><strong>{moduleDefinition.enabled ? "ON" : "OFF"}</strong></div>)}</div>
                {!selectedModuleSnapshot.length && <div className="company-compact-empty">No persisted tenant access policy is loaded.</div>}
                <button className="secondary-button" onClick={() => navigateCompany("Modules")}>Manage module policies</button>
              </article>
            </section>
          </>}

          {active === "Schools" && <section className="card school-card company-schools-page">
            <div className="card-heading"><div><h2>All schools</h2><p>{filteredSchools.length} matching persisted tenant{filteredSchools.length === 1 ? "" : "s"}.</p></div><button onClick={() => setModalOpen(true)}>Add school <span>＋</span></button></div>
            <div className="school-table" role="table" aria-label="All schools">
              <div className="school-row school-header" role="row"><span>SCHOOL</span><span>STUDENTS</span><span>PLAN</span><span>STATUS</span><span>RENEWAL</span><span /></div>
              {filteredSchools.map((school) => (
                <div className="school-row" role="row" key={school.id}>
                  <div className="school-name"><span className={`school-badge ${school.color}`}>{school.code}</span><span><b>{school.name}</b><small>{school.location} · {school.id}</small></span></div>
                  <span className="numeric">{school.students.toLocaleString("en-IN")}</span><span className="plan">{school.plan}</span><span><i className={`status-dot ${school.status.toLowerCase()}`} />{school.status}</span><span className={school.status === "Attention" ? "renewal warning" : "renewal"}>{school.renewal}</span><button className="row-action" disabled={drawerLoading} aria-label={`Open ${school.name}`} onClick={() => openSchool(school)}>›</button>
                </div>
              ))}
              {!filteredSchools.length && <div className="company-empty-state"><b>No schools match this search</b><span>Clear the search or create a new tenant.</span></div>}
            </div>
          </section>}

          <footer><span>© 2026 HIG Automation India Private Limited</span><span><i className="footer-dot" /> Data protected · India region</span></footer>
        </div>
      </section>

      {selectedSchool && <div className="drawer-backdrop" role="presentation" onMouseDown={() => !schoolActionPending && setSelectedSchool(null)}><aside className="school-drawer" role="dialog" aria-modal="true" aria-labelledby="school-drawer-title" onMouseDown={(event) => event.stopPropagation()}><div className="drawer-header"><div><p className="eyebrow">TENANT CONTROL</p><h2 id="school-drawer-title">{selectedSchool.name}</h2><span>{selectedSchool.city} · {selectedSchool.status}</span></div><button disabled={schoolActionPending} onClick={() => setSelectedSchool(null)} aria-label="Close school settings">×</button></div><section className="drawer-section"><div className="drawer-section-title"><div><h3>Subscription plan</h3><p>Changes apply immediately to module entitlements.</p></div><span className="audit-chip">AUDITED</span></div><div className="plan-options">{["Starter","Growth","Enterprise"].map((plan) => <button disabled={schoolActionPending} className={selectedSchool.plan === plan ? "selected" : ""} key={plan} onClick={() => manageSchool({ action: "update_plan", plan })}><b>{plan}</b><small>{plan === "Starter" ? "₹1,499" : plan === "Growth" ? "₹3,499" : "₹7,999"}/mo</small></button>)}</div></section><section className="drawer-section"><div className="drawer-section-title"><div><h3>Enabled modules</h3><p>School-specific overrides take precedence over plan defaults.</p></div></div><div className="toggle-list">{(accessConfiguration?.tenantId === selectedSchool.tenantId ? accessConfiguration.modules : selectedSchool.modules).map((moduleDefinition) => <label key={moduleDefinition.key}><span><b>{moduleDefinition.label}</b><small>{moduleDefinition.enabled ? "Available to authorized roles" : "Hidden for this tenant"}</small></span><input type="checkbox" checked={moduleDefinition.enabled} disabled={schoolActionPending} onChange={(event) => { void updateCompanyModule(moduleDefinition.key, event.target.checked); }} /><i /></label>)}</div></section><section className="drawer-section school-role-boundary"><div className="drawer-section-title"><div><h3>School role boundary</h3><p>Company enables the maximum module set. The School administrator manages staff roles only inside these enabled modules.</p></div><span className="audit-chip">SCHOOL CONTROL</span></div><button className="drawer-access-button" onClick={() => { navigateCompany("Access control"); setSelectedSchool(null); }}>Open full app access configuration →</button></section><section className="drawer-section invitation-box"><div><span className={`invitation-state ${selectedSchool.invitationStatus}`}>{selectedSchool.invitationStatus ?? "Not created"}</span><h3>School Admin invitation</h3><p>{selectedSchool.adminEmail ?? "No administrator email"}</p><small>{selectedSchool.invitationExpiresAt ? `Expires ${new Date(selectedSchool.invitationExpiresAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}` : "No active invitation"}</small></div><div className="invitation-actions"><button disabled={schoolActionPending} onClick={() => manageSchool({ action: "resend_invitation" })}>Rotate & resend</button><button className="danger" disabled={schoolActionPending || selectedSchool.invitationStatus === "revoked"} onClick={() => manageSchool({ action: "revoke_invitation" })}>Revoke</button></div></section><section className="drawer-section"><div className="drawer-section-title"><div><h3>Recent tenant audit</h3><p>Newest security-sensitive changes for this school.</p></div></div><div className="drawer-audit">{selectedSchool.audit.map((event) => <div key={event.id}><span className="activity-icon green">✓</span><p><b>{event.action.replaceAll(".", " ")}</b><small>{new Date(event.occurredAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</small></p></div>)}</div></section></aside></div>}

      {modalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => !submitting && setModalOpen(false)}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-school-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" disabled={submitting} onClick={() => setModalOpen(false)}>×</button><p className="eyebrow">TENANT ONBOARDING</p><h2 id="add-school-title">Add a new school</h2><p>Create an isolated tenant workspace with a secure trial plan.</p><form onSubmit={addSchool}><label>School name<input name="name" required minLength={3} maxLength={120} placeholder="e.g. Greenfield Academy" /></label><div className="form-row"><label>City<input name="city" required minLength={2} maxLength={80} placeholder="Mumbai" /></label><label>Plan<select name="plan" defaultValue="Growth"><option>Starter</option><option>Growth</option><option>Enterprise</option></select></label></div><label>School Admin email<input name="adminEmail" required type="email" autoComplete="email" placeholder="admin@greenfield.edu" /></label><div className="tenant-preview"><span className="pulse-dot" /><div><b>Tenant isolation enabled</b><small>The campus, plan, module policy, scoped admin membership and immutable audit event are created together.</small></div></div><button className="primary-button" disabled={submitting} type="submit">{submitting ? "Creating secure workspace…" : "Create school & invitation"} {!submitting && <span>→</span>}</button></form></div></div>}
    </main>
  );
}
