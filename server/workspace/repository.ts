import { database } from "@db-runtime";
import type { ChatGPTUser } from "../../app/chatgpt-auth";
import {
  repositoryBackend,
  schedulePostgresShadowRead,
} from "../runtime/repository-backend.ts";
import type { WorkspaceAction } from "./validation";

export type ModuleRecord={id:string;moduleKey:string;workflow:string;title:string;description:string;recordDate:string;dueDate:string|null;amountPaise:number|null;assignee:string;priority:"low"|"normal"|"high"|"urgent";status:"draft"|"open"|"in_progress"|"completed"|"cancelled";createdAt:string;updatedAt:string};
type ModuleBreakdown={moduleKey:string;total:number;openCount:number;completedCount:number};
export type WorkspaceState={records:ModuleRecord[];breakdown:ModuleBreakdown[];metrics:{total:number;open:number;inProgress:number;completed:number;urgent:number;overdue:number;amountPaise:number}};

export async function getWorkspace(tenantId:string,moduleKey:string,sessionId?:string|null):Promise<WorkspaceState>{
  if(repositoryBackend()==="postgres"){return (await import("./postgres-repository.ts")).getPostgresWorkspace(tenantId,moduleKey,sessionId);}
  await requireSchool(tenantId);const session=sessionId??(await activeSession(tenantId))?.id??null;const allModules=moduleKey==="Dashboard"||moduleKey==="Reports & Analytics";
  const conditions=["tenant_id = ?"],values:(string|null)[]=[tenantId];if(!allModules){conditions.push("module_key = ?");values.push(moduleKey);}if(session){conditions.push("(academic_session_id = ? OR academic_session_id IS NULL)");values.push(session);}
  const statement=database.prepare(`SELECT id,module_key AS moduleKey,workflow,title,description,record_date AS recordDate,due_date AS dueDate,amount_paise AS amountPaise,assignee,priority,status,created_at AS createdAt,updated_at AS updatedAt FROM module_records WHERE ${conditions.join(" AND ")} ORDER BY CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END, updated_at DESC LIMIT 500`);
  const records=(await statement.bind(...values).all<ModuleRecord>()).results;
  const breakdown=(await database.prepare(`SELECT module_key AS moduleKey,COUNT(*) AS total,SUM(CASE WHEN status IN ('open','in_progress') THEN 1 ELSE 0 END) AS openCount,SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completedCount FROM module_records WHERE tenant_id=? GROUP BY module_key ORDER BY total DESC`).bind(tenantId).all<ModuleBreakdown>()).results;
  const today=new Date().toISOString().slice(0,10);const workspace={records,breakdown,metrics:{total:records.length,open:records.filter(r=>r.status==="open").length,inProgress:records.filter(r=>r.status==="in_progress").length,completed:records.filter(r=>r.status==="completed").length,urgent:records.filter(r=>r.priority==="urgent"&&r.status!=="completed"&&r.status!=="cancelled").length,overdue:records.filter(r=>Boolean(r.dueDate&&r.dueDate<today)&&r.status!=="completed"&&r.status!=="cancelled").length,amountPaise:records.reduce((n,r)=>n+(r.amountPaise??0),0)}};
  schedulePostgresShadowRead("workspace",workspace,async()=>(await import("./postgres-repository.ts")).getPostgresWorkspace(tenantId,moduleKey,sessionId));
  return workspace;
}

export async function applyWorkspaceAction(tenantId:string,action:WorkspaceAction,actor:ChatGPTUser):Promise<WorkspaceState>{
  if(repositoryBackend()==="postgres"){return (await import("./postgres-repository.ts")).applyPostgresWorkspaceAction(tenantId,action,actor);}
  await requireSchool(tenantId);const now=new Date().toISOString(),actorId=await stableUserId(actor.email);await ensureUser(actorId,actor,now);let moduleKey="Dashboard",resourceId="";
  if(action.action==="create_record") {const session=await activeSession(tenantId);resourceId=crypto.randomUUID();moduleKey=action.moduleKey;await database.prepare(`INSERT INTO module_records (id,tenant_id,academic_session_id,module_key,workflow,title,description,record_date,due_date,amount_paise,assignee,priority,status,metadata_json,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'open','{}',?,?,?)`).bind(resourceId,tenantId,session?.id??null,action.moduleKey,action.workflow,action.title,action.description,action.recordDate,action.dueDate||null,action.amountPaise,action.assignee,action.priority,actorId,now,now).run();}
  else {const record=await database.prepare("SELECT id,module_key AS moduleKey FROM module_records WHERE id=? AND tenant_id=?").bind(action.recordId,tenantId).first<{id:string;moduleKey:string}>();if(!record)throw new Error("Workspace record not found");resourceId=record.id;moduleKey=record.moduleKey;await database.prepare("UPDATE module_records SET status=?,updated_at=? WHERE id=? AND tenant_id=?").bind(action.status,now,action.recordId,tenantId).run();}
  await database.prepare("INSERT INTO audit_events (id,tenant_id,actor_id,action,resource_type,resource_id,reason,metadata_json,occurred_at) VALUES (?,?,?,?,?,?,'Module workflow operation',?,?)").bind(crypto.randomUUID(),tenantId,actorId,`workspace.${action.action}`,"module_record",resourceId,JSON.stringify(action),now).run();
  return getWorkspace(tenantId,moduleKey);
}

async function activeSession(tenantId:string){return database.prepare("SELECT id FROM academic_sessions WHERE tenant_id=? AND status='active' ORDER BY starts_on DESC LIMIT 1").bind(tenantId).first<{id:string}>();}
async function requireSchool(tenantId:string){const row=await database.prepare("SELECT id FROM tenants WHERE id=? AND status!='archived'").bind(tenantId).first();if(!row)throw new Error("School not found");}
async function ensureUser(id:string,actor:ChatGPTUser,now:string){await database.prepare("INSERT INTO users (id,email,full_name,status,mfa_enabled,created_at,updated_at) VALUES (?,?,?,'active',1,?,?) ON CONFLICT(email) DO UPDATE SET full_name=excluded.full_name,updated_at=excluded.updated_at").bind(id,actor.email.toLowerCase(),actor.fullName??actor.displayName,now,now).run();}
async function stableUserId(email:string):Promise<string>{const bytes=new TextEncoder().encode(email.trim().toLowerCase());const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(b=>b.toString(16).padStart(2,"0")).join("");return `usr_${hash.slice(0,24)}`;}
