import { authorize, authErrorResponse } from '../../../../../../server/auth/authorization.ts';
import { policies } from '../../../../../../server/auth/policies.ts';
import { repositoryBackend } from '../../../../../../server/runtime/repository-backend.ts';
import { mobileAppErrorResponse } from '../../../../../../server/mobile-app/http.ts';
import { setTeacherAssignment, teacherAssignmentSetup } from '../../../../../../server/operations/teacher-assignment-repository.ts';
import { teacherAssignmentSchema } from '../../../../../../server/operations/teacher-assignment-validation.ts';
export const dynamic='force-dynamic';
type Context={params:Promise<{schoolId:string}>};
export async function GET(request:Request,context:Context) {
  const {schoolId}=await context.params;
  let actor;
  try { actor=await authorize(request,policies.foundationManage,schoolId); } catch(e) { return authErrorResponse(e); }
  if(repositoryBackend()!=='postgres')return Response.json({error:'Assignment setup requires staging database'},{status:503});
  try {return Response.json(await teacherAssignmentSetup(schoolId,actor.userId),{headers:{'cache-control':'no-store'}});}
  catch(e){return mobileAppErrorResponse(e,'Assignment setup unavailable');}
}
export async function POST(request:Request,context:Context) {
  const {schoolId}=await context.params;
  let actor;
  try { actor=await authorize(request,policies.foundationManage,schoolId); } catch(e) { return authErrorResponse(e); }
  const parsed=teacherAssignmentSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return Response.json({error:'Invalid teacher assignment'},{status:400});
  if(repositoryBackend()!=='postgres')return Response.json({error:'Assignment setup unavailable'},{status:503});
  try{return Response.json(await setTeacherAssignment(schoolId,actor.userId,parsed.data));}
  catch(e){return mobileAppErrorResponse(e,'Assignment update unavailable');}
}
