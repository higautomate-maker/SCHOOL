export type RoutePolicy = { scope: "platform" | "tenant"; permission: string; module: string | null; stepUp?: boolean };
export const policies = {
  schoolsList: { scope: "platform", permission: "platform.schools.view", module: null },
  schoolsManage: { scope: "platform", permission: "platform.schools.manage", module: null },
  configurationView: { scope: "tenant", permission: "settings.view", module: "settings_billing" },
  configurationManage: { scope: "tenant", permission: "settings.manage", module: "settings_billing", stepUp: true },
  foundationView: { scope: "tenant", permission: "academics.view", module: "academics" },
  foundationManage: { scope: "tenant", permission: "academics.manage", module: "academics" },
  rolesView: { scope: "tenant", permission: "roles.view", module: "access_control" },
  rolesManage: { scope: "tenant", permission: "roles.manage", module: "access_control", stepUp: true },
  studentsView: { scope: "tenant", permission: "students.view", module: "student_information" },
  studentsManage: { scope: "tenant", permission: "students.manage", module: "student_information" },
  operationsView: { scope: "tenant", permission: "operations.view", module: null },
  operationsManage: { scope: "tenant", permission: "operations.manage", module: null },
  notificationsView: { scope: "tenant", permission: "operations.view", module: "communication" },
  notificationsRead: { scope: "tenant", permission: "operations.view", module: "communication" },
  workspaceView: { scope: "tenant", permission: "workspace.view", module: null },
  workspaceManage: { scope: "tenant", permission: "workspace.manage", module: null },
} as const satisfies Record<string, RoutePolicy>;
