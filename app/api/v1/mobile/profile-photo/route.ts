import { authenticatedMobilePrincipal } from '../../../../../server/mobile-auth/service.ts';
import { mobileJson } from '../../../../../server/mobile-auth/http.ts';
import { mobileAppErrorResponse } from '../../../../../server/mobile-app/http.ts';
import { withTenantDatabase } from '../../../../../server/runtime/postgres.ts';
import { repositoryBackend } from '../../../../../server/runtime/repository-backend.ts';
import { boundedPhotoBody, validProfilePhoto } from '../../../../../server/mobile-app/profile-photo.ts';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
 try { const p=await authenticatedMobilePrincipal(request);if(!p)return mobileJson({error:'Authentication required'},401);
 if(repositoryBackend()!=='postgres')return mobileJson({error:'Profile unavailable'},503);
 const photo=await withTenantDatabase(p.tenantId,async(_db,c)=>(await c.query(
   'SELECT photo FROM mobile_profile_photos WHERE tenant_id=$1 AND user_id=$2',[p.tenantId,p.userId])).rows[0]?.photo??null);
 return mobileJson({photo}); }catch(e){return mobileAppErrorResponse(e,'Profile unavailable');}
}
export async function PUT(request:Request) {
 try { const p=await authenticatedMobilePrincipal(request);if(!p)return mobileJson({error:'Authentication required'},401);
 if(repositoryBackend()!=='postgres')return mobileJson({error:'Profile unavailable'},503);
 const input=await boundedPhotoBody(request);
 if(!input || typeof input!=='object' || !('photo' in input) || !validProfilePhoto(input.photo))return mobileJson({error:'Invalid photo'},400);
 const photo=input.photo;
 await withTenantDatabase(p.tenantId,async(_db,c)=>{
   if(photo===null)await c.query('DELETE FROM mobile_profile_photos WHERE tenant_id=$1 AND user_id=$2',[p.tenantId,p.userId]);
   else await c.query(`INSERT INTO mobile_profile_photos(tenant_id,user_id,photo) VALUES($1,$2,$3)
     ON CONFLICT(tenant_id,user_id) DO UPDATE SET photo=EXCLUDED.photo,updated_at=now()`,[p.tenantId,p.userId,photo]);
   await c.query(`INSERT INTO audit_events(id,tenant_id,actor_id,action,resource_type,resource_id,reason,metadata,occurred_at)
     VALUES(gen_random_uuid(),$1::uuid,$2::uuid,'profile.photo','user',$2::text,'Self-service profile photo',$3::jsonb,now())`,
     [p.tenantId,p.userId,JSON.stringify({removed:photo===null})]);
 });return mobileJson({saved:true}); }catch(e){
 if(e instanceof RangeError)return mobileJson({error:'Photo too large'},413);
 return mobileAppErrorResponse(e,'Profile update unavailable');}
}
