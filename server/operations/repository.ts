import { database } from "@db-runtime";
import type { ChatGPTUser } from "../../app/chatgpt-auth";
import {
  repositoryBackend,
  schedulePostgresShadowRead,
} from "../runtime/repository-backend.ts";
import type { OperationAction } from "./validation";

type AttendanceRow = { id:string; studentId:string; studentName:string; className:string; sectionName:string; attendanceDate:string; status:"present"|"absent"|"late"|"excused"; note:string };
type InvoiceRow = { id:string; studentId:string; studentName:string; admissionNumber:string; feeType:string; amountPaise:number; paidPaise:number; dueDate:string; status:"due"|"partial"|"paid"|"waived"; createdAt:string };
type PaymentRow = { id:string; invoiceId:string; studentName:string; amountPaise:number; method:string; reference:string; paidOn:string };
export type OperationsState = { attendance:AttendanceRow[]; invoices:InvoiceRow[]; payments:PaymentRow[]; metrics:{present:number;absent:number;late:number;attendanceMarked:number;invoicedPaise:number;collectedPaise:number;outstandingPaise:number} };

export async function getOperations(tenantId:string, sessionId?:string|null):Promise<OperationsState>{
  if(repositoryBackend()==="postgres"){
    return (await import("./postgres-repository.ts")).getPostgresOperations(tenantId,sessionId);
  }
  await requireSchool(tenantId); const session=sessionId??(await activeSession(tenantId))?.id;
  if(!session)return emptyState();
  const [attendance,invoices,payments]=await Promise.all([
    database.prepare(`SELECT a.id, a.student_id AS studentId, TRIM(s.first_name || ' ' || s.last_name) AS studentName, s.class_name AS className, s.section_name AS sectionName, a.attendance_date AS attendanceDate, a.status, a.note FROM student_attendance a JOIN students s ON s.id=a.student_id WHERE a.tenant_id=? AND a.academic_session_id=? ORDER BY a.attendance_date DESC, studentName`).bind(tenantId,session).all<AttendanceRow>(),
    database.prepare(`SELECT i.id, i.student_id AS studentId, TRIM(s.first_name || ' ' || s.last_name) AS studentName, s.admission_number AS admissionNumber, i.fee_type AS feeType, i.amount_paise AS amountPaise, i.paid_paise AS paidPaise, i.due_date AS dueDate, i.status, i.created_at AS createdAt FROM fee_invoices i JOIN students s ON s.id=i.student_id WHERE i.tenant_id=? AND i.academic_session_id=? ORDER BY i.created_at DESC LIMIT 500`).bind(tenantId,session).all<InvoiceRow>(),
    database.prepare(`SELECT p.id, p.invoice_id AS invoiceId, TRIM(s.first_name || ' ' || s.last_name) AS studentName, p.amount_paise AS amountPaise, p.method, p.reference, p.paid_on AS paidOn FROM fee_payments p JOIN students s ON s.id=p.student_id JOIN fee_invoices i ON i.id=p.invoice_id WHERE p.tenant_id=? AND i.academic_session_id=? ORDER BY p.paid_on DESC, p.created_at DESC LIMIT 200`).bind(tenantId,session).all<PaymentRow>(),
  ]);
  const today=new Date().toISOString().slice(0,10), todays=attendance.results.filter(a=>a.attendanceDate===today), invoiced=invoices.results.reduce((n,i)=>n+i.amountPaise,0), collected=invoices.results.reduce((n,i)=>n+i.paidPaise,0);
  const state={attendance:attendance.results,invoices:invoices.results,payments:payments.results,metrics:{present:todays.filter(a=>a.status==="present").length,absent:todays.filter(a=>a.status==="absent").length,late:todays.filter(a=>a.status==="late").length,attendanceMarked:todays.length,invoicedPaise:invoiced,collectedPaise:collected,outstandingPaise:invoiced-collected}};
  schedulePostgresShadowRead("operations",state,async()=>(await import("./postgres-repository.ts")).getPostgresOperations(tenantId,sessionId));
  return state;
}

export async function applyOperation(tenantId:string, action:OperationAction, actor:ChatGPTUser, idempotencyKey=crypto.randomUUID()):Promise<OperationsState>{
  if(repositoryBackend()==="postgres"){
    return (await import("./postgres-repository.ts")).applyPostgresOperation(tenantId,action,actor,idempotencyKey);
  }
  await requireSchool(tenantId); const session=await activeSession(tenantId); if(!session)throw new Error("Create and activate an academic session first");
  const now=new Date().toISOString(), actorId=await stableUserId(actor.email); await ensureUser(actorId,actor,now);
  let resourceType="operation", resourceId="";
  if(action.action==="mark_attendance"){
    await requireStudent(tenantId,action.studentId); resourceType="attendance"; resourceId=crypto.randomUUID();
    await database.prepare(`INSERT INTO student_attendance (id,tenant_id,academic_session_id,student_id,attendance_date,status,note,marked_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(student_id,attendance_date) DO UPDATE SET status=excluded.status,note=excluded.note,marked_by=excluded.marked_by,updated_at=excluded.updated_at`).bind(resourceId,tenantId,session.id,action.studentId,action.attendanceDate,action.status,action.note,actorId,now,now).run();
  }else if(action.action==="create_invoice"){
    await requireStudent(tenantId,action.studentId); resourceType="fee_invoice"; resourceId=crypto.randomUUID();
    await database.prepare(`INSERT INTO fee_invoices (id,tenant_id,academic_session_id,student_id,fee_type,amount_paise,paid_paise,due_date,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,0,?,'due',?,?,?)`).bind(resourceId,tenantId,session.id,action.studentId,action.feeType,action.amountPaise,action.dueDate,actorId,now,now).run();
  }else{
    const invoice=await database.prepare("SELECT id,student_id AS studentId,amount_paise AS amountPaise,paid_paise AS paidPaise FROM fee_invoices WHERE id=? AND tenant_id=?").bind(action.invoiceId,tenantId).first<{id:string;studentId:string;amountPaise:number;paidPaise:number}>();
    if(!invoice)throw new Error("Fee invoice not found"); if(action.amountPaise>invoice.amountPaise-invoice.paidPaise)throw new Error("Payment exceeds the outstanding balance");
    resourceType="fee_payment"; resourceId=crypto.randomUUID(); const paid=invoice.paidPaise+action.amountPaise, status=paid===invoice.amountPaise?"paid":"partial";
    await database.batch([database.prepare("INSERT INTO fee_payments (id,tenant_id,invoice_id,student_id,amount_paise,method,reference,paid_on,received_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(resourceId,tenantId,invoice.id,invoice.studentId,action.amountPaise,action.method,action.reference,now.slice(0,10),actorId,now),database.prepare("UPDATE fee_invoices SET paid_paise=?,status=?,updated_at=? WHERE id=? AND tenant_id=?").bind(paid,status,now,invoice.id,tenantId)]);
  }
  await database.prepare("INSERT INTO audit_events (id,tenant_id,actor_id,action,resource_type,resource_id,reason,metadata_json,occurred_at) VALUES (?,?,?,?,?,?,'School operations workflow',?,?)").bind(crypto.randomUUID(),tenantId,actorId,`operations.${action.action}`,resourceType,resourceId,JSON.stringify(action),now).run();
  return getOperations(tenantId,session.id);
}

function emptyState():OperationsState{return {attendance:[],invoices:[],payments:[],metrics:{present:0,absent:0,late:0,attendanceMarked:0,invoicedPaise:0,collectedPaise:0,outstandingPaise:0}};}
async function activeSession(tenantId:string){return database.prepare("SELECT id FROM academic_sessions WHERE tenant_id=? AND status='active' ORDER BY starts_on DESC LIMIT 1").bind(tenantId).first<{id:string}>();}
async function requireSchool(tenantId:string){const row=await database.prepare("SELECT id FROM tenants WHERE id=? AND status!='archived'").bind(tenantId).first();if(!row)throw new Error("School not found");}
async function requireStudent(tenantId:string,studentId:string){const row=await database.prepare("SELECT id FROM students WHERE id=? AND tenant_id=?").bind(studentId,tenantId).first();if(!row)throw new Error("Student not found");}
async function ensureUser(id:string,actor:ChatGPTUser,now:string){await database.prepare("INSERT INTO users (id,email,full_name,status,mfa_enabled,created_at,updated_at) VALUES (?,?,?,'active',1,?,?) ON CONFLICT(email) DO UPDATE SET full_name=excluded.full_name,updated_at=excluded.updated_at").bind(id,actor.email.toLowerCase(),actor.fullName??actor.displayName,now,now).run();}
async function stableUserId(email:string):Promise<string>{const bytes=new TextEncoder().encode(email.trim().toLowerCase());const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(b=>b.toString(16).padStart(2,"0")).join("");return `usr_${hash.slice(0,24)}`;}
