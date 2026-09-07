import { z } from 'zod';
import { authenticatedMobilePrincipal,effectiveAccessForPrincipal } from '../../../../../server/mobile-auth/service.ts';
import { mobileJson } from '../../../../../server/mobile-auth/http.ts';
import { mobileAppErrorResponse } from '../../../../../server/mobile-app/http.ts';
import { diaryAction,diaryForDate,changeDiary } from '../../../../../server/mobile-app/diary.ts';
import { repositoryBackend } from '../../../../../server/runtime/repository-backend.ts';
export const dynamic='force-dynamic';
async function access(request:Request,write=false) {
 const p=await authenticatedMobilePrincipal(request);
 if(!p) throw new Error('Authentication required');
 const a=await effectiveAccessForPrincipal(p);
 if(p.principalType==='school' ? !a.modules.some(m=>m.key==='study_center' && (!write||m.canManage))
   : !['parent','student'].includes(p.principalType)||!a.features.some(f=>f.key==='homework')) throw new Error('Diary access denied');
 if(repositoryBackend()!=='postgres') throw new Error('Diary unavailable');
 return p;
}
export async function GET(request:Request) {
 try { const p=await access(request); const date=z.iso.date().safeParse(new URL(request.url).searchParams.get('date'));
 if(!date.success)return mobileJson({error:'Invalid diary date'},400);
 return mobileJson({records:await diaryForDate(p,date.data)}); } catch(e){return mobileAppErrorResponse(e,'Diary unavailable');}
}
export async function POST(request:Request) {
 try { const p=await access(request,true);const parsed=diaryAction.safeParse(await request.json());
 if(!parsed.success)return mobileJson({error:'Invalid diary request'},400);
 return mobileJson(await changeDiary(p,parsed.data)); } catch(e){return mobileAppErrorResponse(e,'Diary update unavailable');}
}
