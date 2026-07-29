import type { PoolClient } from "pg";
import type { ChatGPTUser } from "../../app/chatgpt-auth";
import type {
  ModuleRecord,
  WorkspaceState,
} from "./repository.ts";
import {
  calendarDateString,
  ensurePostgresActor,
  requirePostgresSchool,
  timestampString,
} from "../runtime/postgres-repository.ts";
import { withTenantDatabase } from "../runtime/postgres.ts";
import type { WorkspaceAction } from "./validation.ts";

type ModuleRow = Omit<
  ModuleRecord,
  "recordDate" | "dueDate" | "amountPaise" | "createdAt" | "updatedAt"
> & {
  recordDate: Date | string;
  dueDate: Date | string | null;
  amountPaise: string | number | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};
type BreakdownRow = {
  moduleKey: string;
  total: string | number;
  openCount: string | number;
  completedCount: string | number;
};

export function getPostgresWorkspace(
  tenantId: string,
  moduleKey: string,
  sessionId?: string | null,
): Promise<WorkspaceState> {
  return withTenantDatabase(tenantId, async (_database, client) => {
    await requirePostgresSchool(client, tenantId);
    return readWorkspace(client, tenantId, moduleKey, sessionId);
  });
}

export function applyPostgresWorkspaceAction(
  tenantId: string,
  action: WorkspaceAction,
  actor: ChatGPTUser,
): Promise<WorkspaceState> {
  return withTenantDatabase(tenantId, async (_database, client) => {
    await requirePostgresSchool(client, tenantId);
    const actorId = await ensurePostgresActor(client, actor);
    let moduleKey = "Dashboard";
    let resourceId: string;

    if (action.action === "create_record") {
      const session = await activeSession(client, tenantId);
      resourceId = crypto.randomUUID();
      moduleKey = action.moduleKey;
      await client.query(
        `INSERT INTO module_records (
           id, tenant_id, academic_session_id, module_key, workflow,
           title, description, record_date, due_date, amount_paise,
           assignee, priority, status, metadata, created_by
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
           $11, $12, 'open', '{}'::jsonb, $13
         )`,
        [
          resourceId,
          tenantId,
          session?.id ?? null,
          action.moduleKey,
          action.workflow,
          action.title,
          action.description,
          action.recordDate,
          action.dueDate || null,
          action.amountPaise,
          action.assignee,
          action.priority,
          actorId,
        ],
      );
    } else {
      const recordResult = await client.query<{ id: string; moduleKey: string }>(
        `SELECT id, module_key AS "moduleKey"
         FROM module_records
         WHERE tenant_id = $1
           AND id = $2
         LIMIT 1`,
        [tenantId, action.recordId],
      );
      const record = recordResult.rows[0];
      if (!record) throw new Error("Workspace record not found");
      resourceId = record.id;
      moduleKey = record.moduleKey;
      await client.query(
        `UPDATE module_records
         SET status = $1,
             updated_at = now()
         WHERE tenant_id = $2
           AND id = $3`,
        [action.status, tenantId, action.recordId],
      );
    }

    await client.query(
      `INSERT INTO audit_events (
         id, tenant_id, actor_id, action, resource_type, resource_id,
         reason, metadata, occurred_at
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, 'module_record', $4,
         'Module workflow operation', $5::jsonb, now()
       )`,
      [
        tenantId,
        actorId,
        `workspace.${action.action}`,
        resourceId,
        JSON.stringify(action),
      ],
    );
    return readWorkspace(client, tenantId, moduleKey);
  });
}

async function readWorkspace(
  client: PoolClient,
  tenantId: string,
  moduleKey: string,
  sessionId?: string | null,
): Promise<WorkspaceState> {
  const session = sessionId ?? (await activeSession(client, tenantId))?.id ?? null;
  const allModules = moduleKey === "Dashboard" || moduleKey === "Reports & Analytics";
  const values: unknown[] = [tenantId];
  const conditions = ["tenant_id = $1"];
  if (!allModules) {
    values.push(moduleKey);
    conditions.push(`module_key = $${values.length}`);
  }
  if (session) {
    values.push(session);
    conditions.push(`(academic_session_id::text = $${values.length} OR academic_session_id IS NULL)`);
  }

  const [recordResult, breakdownResult] = await Promise.all([
    client.query<ModuleRow>(
      `SELECT
         id,
         module_key AS "moduleKey",
         workflow,
         title,
         description,
         record_date AS "recordDate",
         due_date AS "dueDate",
         amount_paise AS "amountPaise",
         assignee,
         priority,
         status,
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM module_records
       WHERE ${conditions.join(" AND ")}
       ORDER BY
         CASE priority
           WHEN 'urgent' THEN 1
           WHEN 'high' THEN 2
           WHEN 'normal' THEN 3
           ELSE 4
         END,
         updated_at DESC
       LIMIT 500`,
      values,
    ),
    client.query<BreakdownRow>(
      `SELECT
         module_key AS "moduleKey",
         count(*)::text AS total,
         count(*) FILTER (
           WHERE status IN ('open', 'in_progress')
         )::text AS "openCount",
         count(*) FILTER (
           WHERE status = 'completed'
         )::text AS "completedCount"
       FROM module_records
       WHERE tenant_id = $1
       GROUP BY module_key
       ORDER BY count(*) DESC`,
      [tenantId],
    ),
  ]);

  const records: ModuleRecord[] = recordResult.rows.map((record) => ({
    ...record,
    recordDate: calendarDateString(record.recordDate),
    dueDate: record.dueDate ? calendarDateString(record.dueDate) : null,
    amountPaise: record.amountPaise === null ? null : Number(record.amountPaise),
    createdAt: timestampString(record.createdAt),
    updatedAt: timestampString(record.updatedAt),
  }));
  const breakdown = breakdownResult.rows.map((item) => ({
    moduleKey: item.moduleKey,
    total: Number(item.total),
    openCount: Number(item.openCount),
    completedCount: Number(item.completedCount),
  }));
  const today = new Date().toISOString().slice(0, 10);
  return {
    records,
    breakdown,
    metrics: {
      total: records.length,
      open: records.filter((record) => record.status === "open").length,
      inProgress: records.filter((record) => record.status === "in_progress").length,
      completed: records.filter((record) => record.status === "completed").length,
      urgent: records.filter(
        (record) => record.priority === "urgent"
          && record.status !== "completed"
          && record.status !== "cancelled",
      ).length,
      overdue: records.filter(
        (record) => Boolean(record.dueDate && record.dueDate < today)
          && record.status !== "completed"
          && record.status !== "cancelled",
      ).length,
      amountPaise: records.reduce(
        (total, record) => total + (record.amountPaise ?? 0),
        0,
      ),
    },
  };
}

async function activeSession(
  client: PoolClient,
  tenantId: string,
): Promise<{ id: string } | null> {
  const result = await client.query<{ id: string }>(
    `SELECT id
     FROM academic_sessions
     WHERE tenant_id = $1
       AND status = 'active'
     ORDER BY starts_on DESC
     LIMIT 1`,
    [tenantId],
  );
  return result.rows[0] ?? null;
}
