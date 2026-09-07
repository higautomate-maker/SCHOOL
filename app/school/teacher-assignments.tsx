"use client";
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { authenticatedFetch } from '../auth-client';
import styles from './school.module.css';
type Assignment={id:string;userId:string;academicSessionId:string;classId:string;sectionId:string;subjectId:string|null;kind:string;teacherName:string;className:string;sectionName:string;subjectName:string|null;sessionName:string};
type Setup={teachers:{id:string;name:string;email:string}[];sessions:{id:string;name:string}[];sections:{id:string;classId:string;className:string;name:string}[];subjects:{id:string;name:string}[];assignments:Assignment[]};
export function TeacherAssignmentsPanel(){
  const [data,setData]=useState<Setup|null>(null),[tenant,setTenant]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[kind,setKind]=useState('class_teacher');
  const load=useCallback(async()=>{
    try{
      const session=await authenticatedFetch('/api/v1/auth/session',{cache:'no-store'});
      if(!session.ok)throw new Error('Sign in with your school administrator account.');
      const {activeTenantId}=await session.json() as {activeTenantId?:string};
      if(!activeTenantId)throw new Error('School session unavailable.');
      const response=await authenticatedFetch(`/api/v1/schools/${encodeURIComponent(activeTenantId)}/teacher-assignments`,{cache:'no-store'});
      if(!response.ok)throw new Error('Only a school administrator with Academics management access can configure teaching assignments.');
      setTenant(activeTenantId);setData(await response.json());setError('');
    }catch(e){setError(e instanceof Error?e.message:'Setup unavailable');}
  },[]);
  useEffect(()=>{const timer=setTimeout(()=>{void load();},0);return()=>clearTimeout(timer);},[load]);
  async function save(input:Record<string,unknown>){
    setBusy(true);setError('');setMessage('');
    try{
      const response=await authenticatedFetch(`/api/v1/schools/${encodeURIComponent(tenant)}/teacher-assignments`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
      if(!response.ok)throw new Error('Assignment was not saved. Check the teacher, class, subject and session, then retry.');
      await load();setMessage('Assignment saved. Teachers can refresh their mobile app.');
    }catch(e){setError(e instanceof Error?e.message:'Assignment not saved');}finally{setBusy(false);}
  }
  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const values=new FormData(event.currentTarget);
    const section=data?.sections.find(s=>s.id===values.get('sectionId'));if(!section)return;
    void save({userId:values.get('userId'),academicSessionId:values.get('academicSessionId'),classId:section.classId,
      sectionId:section.id,kind,...(kind==='subject_teacher'?{subjectId:values.get('subjectId')}:{}),active:true,reason:values.get('reason')});
  }
  return <article className={styles.panel} style={{padding:24}}><h2>Teaching assignments</h2>
    <p>Class teachers mark daily attendance. Subject teachers mark lesson attendance and publish diary homework. Add an assignment for each class or subject.</p>
    {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    {!data?<button onClick={()=>void load()}>Reload assignments</button>:<>
      <form onSubmit={submit} className={styles.assignmentMatrix}>
        <label>Teacher<select name="userId" required disabled={busy}><option value="">Select teacher</option>{data.teachers.map(t=><option key={t.id} value={t.id}>{t.name} — {t.email}</option>)}</select></label>
        <label>Academic session<select name="academicSessionId" required disabled={busy}><option value="">Select session</option>{data.sessions.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label>Class and section<select name="sectionId" required disabled={busy}><option value="">Select class</option>{data.sections.map(s=><option key={s.id} value={s.id}>{s.className} · {s.name}</option>)}</select></label>
        <label>Responsibility<select value={kind} disabled={busy} onChange={e=>setKind(e.target.value)}><option value="class_teacher">Class teacher — daily attendance</option><option value="subject_teacher">Subject teacher — lessons and diary</option></select></label>
        {kind==='subject_teacher'&&<label>Subject<select name="subjectId" required disabled={busy}><option value="">Select subject</option>{data.subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
        <label>Reason<input name="reason" required minLength={5} maxLength={240} placeholder="Teaching allocation for this session" disabled={busy}/></label>
        <button className={styles.primaryButton} disabled={busy}>{busy?'Saving…':'Save assignment'}</button>
      </form>
      <h3>Active assignments</h3>{data.assignments.length===0?<p>No assignments yet.</p>:data.assignments.map(a=><div key={a.id} style={{padding:'12px 0',borderBottom:'1px solid #ddd'}}>
        <strong>{a.teacherName}</strong> · {a.className} {a.sectionName} · {a.subjectName??'Daily class register'} · {a.sessionName}
        <button disabled={busy} style={{marginLeft:12}} onClick={()=>{const reason=window.prompt('Reason for revoking this assignment');if(reason&&reason.trim().length>=5)void save({userId:a.userId,academicSessionId:a.academicSessionId,classId:a.classId,sectionId:a.sectionId,kind:a.kind,...(a.subjectId?{subjectId:a.subjectId}:{}),active:false,reason});}}>Revoke</button>
      </div>)}
    </>}
  </article>;
}
