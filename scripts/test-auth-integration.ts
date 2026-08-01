import assert from "node:assert/strict";

const backend=process.env.HIG_REPOSITORY_BACKEND??"sqlite";
if(backend!=="sqlite"&&backend!=="postgres")throw new Error("HIG_REPOSITORY_BACKEND must be sqlite or postgres");
if(backend==="sqlite"&&!process.env.HIG_DEMO_DB_PATH)process.env.HIG_DEMO_DB_PATH=`/tmp/hig-auth-${process.pid}-${Date.now()}.sqlite`;
if(!process.env.NODE_ENV)Object.assign(process.env,{NODE_ENV:"test"});
process.env.APP_URL??="https://auth.integration.test";
process.env.HIG_EMAIL_ADAPTER??="capture";

const tenantId="a1000000-0000-4000-8000-000000000001";
const otherTenantId="a1000000-0000-4000-8000-000000000002";
const userId="a2000000-0000-4000-8000-000000000001";
const invitedUserId="a2000000-0000-4000-8000-000000000002";
const roleId="a3000000-0000-4000-8000-000000000001";
const email=`auth-${process.pid}@integration.invalid`;
const invitationEmail=`invited-${process.pid}@integration.invalid`;
const initialPassword="Integration passphrase विद्यालय 2026";
const resetPassword="Replacement passphrase विद्यालय 2026";
const invitationPassword="Invitation passphrase विद्यालय 2026";

const {hashPassword}=await import("../server/auth/password.ts");
const {hash}=await import("@node-rs/argon2");
const {randomToken,sha256}=await import("../server/auth/crypto.ts");
const repository=await import("../server/auth/repository.ts");
const {SESSION_COOKIE,CSRF_COOKIE}=await import("../server/auth/cookies.ts");
const loginRoute=await import("../app/api/v1/auth/login/route.ts");
const sessionRoute=await import("../app/api/v1/auth/session/route.ts");
const logoutRoute=await import("../app/api/v1/auth/logout/route.ts");
const {authorizeResolvedActor}=await import("../server/auth/authorization.ts");
const {policies}=await import("../server/auth/policies.ts");

const legacyHash=await hash(initialPassword,{algorithm:2,version:1,memoryCost:32768,timeCost:2,parallelism:1,outputLen:32});
await seed(legacyHash);

function request(path:string,init:RequestInit={}){const headers=new Headers(init.headers);headers.set("host","auth.integration.test");if(init.method&&init.method!=="GET")headers.set("origin","https://auth.integration.test");headers.set("x-forwarded-for","198.51.100.77");return new Request(`https://auth.integration.test${path}`,{...init,headers});}
function cookies(response:Response){const value=response.headers.get("set-cookie")??"";const session=value.match(new RegExp(`${SESSION_COOKIE}=([^;,]+)`))?.[1]??"";const csrf=value.match(new RegExp(`${CSRF_COOKIE}=([^;,]+)`))?.[1]??"";assert.ok(session&&csrf,"login did not return both hardened cookies");return{session,csrf,header:`${SESSION_COOKIE}=${session}; ${CSRF_COOKIE}=${csrf}`};}
async function login(password:string){const response=await loginRoute.POST(request("/api/v1/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password})}));return{response,...(response.ok?cookies(response):{session:"",csrf:"",header:""})};}

const forged=await sessionRoute.GET(request("/api/v1/auth/session",{headers:{"oai-authenticated-user-email":email,"oai-authenticated-user-full-name":"Forged"}}));
assert.equal(forged.status,401);

const signedIn=await login(initialPassword);
assert.equal(signedIn.response.status,200);
const rehashedRecord=await repository.findLoginRecord(email);
assert.ok(rehashedRecord);
assert.ok(rehashedRecord.passwordHash.startsWith("$argon2id$v=19$m=65536,t=3,p=1$"));
assert.equal(rehashedRecord.credentialVersion,2);
const credentialVersion=rehashedRecord.credentialVersion;
await assert.rejects(
  repository.createSession(userId,credentialVersion,otherTenantId,{ipHash:null,userAgentHash:null}),
  /Active membership required|No active identity/,
);
const sessionResponse=await sessionRoute.GET(request("/api/v1/auth/session",{headers:{cookie:signedIn.header}}));
assert.equal(sessionResponse.status,200);
const sessionBody=await sessionResponse.json() as{activeTenantId:string;user:{identityType:string}};
assert.equal(sessionBody.activeTenantId,tenantId);
assert.equal(sessionBody.user.identityType,"school");

const resolvedActor=await repository.resolveSession(signedIn.session);
assert.ok(resolvedActor);
assert.throws(()=>authorizeResolvedActor(resolvedActor,policies.studentsView,otherTenantId),/Tenant access denied/);

const csrfRejected=await logoutRoute.POST(request("/api/v1/auth/logout",{method:"POST",headers:{cookie:signedIn.header}}));
assert.equal(csrfRejected.status,403);

const disabledSession=await repository.createSession(userId,credentialVersion,tenantId,{ipHash:null,userAgentHash:null});
await setCredentialDisabled(true);
assert.equal(await repository.resolveSession(disabledSession.token),null);
await setCredentialDisabled(false);

for(const status of ["suspended","revoked"] as const){
  const membershipSession=await repository.createSession(userId,credentialVersion,tenantId,{ipHash:null,userAgentHash:null});
  await setMembershipStatus(status);
  assert.equal(await repository.resolveSession(membershipSession.token),null);
  await setMembershipStatus("active");
}

const expiredIdle=await repository.createSession(userId,credentialVersion,tenantId,{ipHash:null,userAgentHash:null});
await alterSession(expiredIdle.sessionId,"idle");
assert.equal(await repository.resolveSession(expiredIdle.token),null);
const expiredAbsolute=await repository.createSession(userId,credentialVersion,tenantId,{ipHash:null,userAgentHash:null});
await alterSession(expiredAbsolute.sessionId,"absolute");
assert.equal(await repository.resolveSession(expiredAbsolute.token),null);
const revoked=await repository.createSession(userId,credentialVersion,tenantId,{ipHash:null,userAgentHash:null});
await repository.revokeSession(revoked.sessionId,"integration");
assert.equal(await repository.resolveSession(revoked.token),null);
const invalidVersion=await repository.createSession(userId,credentialVersion,tenantId,{ipHash:null,userAgentHash:null});
await incrementCredentialVersion();
assert.equal(await repository.resolveSession(invalidVersion.token),null);

const currentRecord=await repository.findLoginRecord(email);assert.ok(currentRecord);
assert.equal(await repository.consumeReset(sha256(randomToken()),await hashPassword(resetPassword)),null);
const expiredResetRaw=randomToken();
assert.ok(await repository.createReset(email,sha256(expiredResetRaw),null));
await expireReset(sha256(expiredResetRaw));
assert.equal(await repository.consumeReset(sha256(expiredResetRaw),await hashPassword(resetPassword)),null);
const rollbackResetRaw=randomToken();
assert.ok(await repository.createReset(email,sha256(rollbackResetRaw),null));
await assert.rejects(repository.consumeReset(sha256(rollbackResetRaw),null as unknown as string));
assert.equal(await repository.consumeReset(sha256(rollbackResetRaw),await hashPassword(initialPassword)),userId);
const resetRaw=randomToken();
assert.ok(await repository.createReset(email,sha256(resetRaw),null));
const resetHash=await hashPassword(resetPassword);
const resetResults=await Promise.all([
  repository.consumeReset(sha256(resetRaw),resetHash),
  repository.consumeReset(sha256(resetRaw),resetHash),
]);
assert.deepEqual(resetResults.sort(),[null,userId].sort());
assert.equal((await login(initialPassword)).response.status,401);
assert.equal((await login(resetPassword)).response.status,200);

const invitationRaw=randomToken();
await seedInvitation(sha256(invitationRaw));
assert.equal(await repository.acceptInvitation(sha256(invitationRaw),"wrong-identity@integration.invalid",await hashPassword(invitationPassword)),null);
for(const scenario of [{status:"revoked" as const,expired:false},{status:"pending" as const,expired:true}]){
  const raw=randomToken(),scenarioEmail=`${scenario.status}-${scenario.expired}-${crypto.randomUUID()}@integration.invalid`;
  await seedInvitation(sha256(raw),{userId:crypto.randomUUID(),email:scenarioEmail,status:scenario.status,expired:scenario.expired});
  assert.equal(await repository.acceptInvitation(sha256(raw),scenarioEmail,await hashPassword(invitationPassword)),null);
}
await assert.rejects(repository.acceptInvitation(sha256(invitationRaw),invitationEmail,null as unknown as string));
const invitationHash=await hashPassword(invitationPassword);
const invitationResults=await Promise.all([
  repository.acceptInvitation(sha256(invitationRaw),invitationEmail,invitationHash),
  repository.acceptInvitation(sha256(invitationRaw),invitationEmail,invitationHash),
]);
assert.deepEqual(invitationResults.sort(),[null,invitedUserId].sort());
const invitationLogin=await loginAs(invitationEmail,invitationPassword);
assert.equal(invitationLogin.status,200);

await assertNoRawSecrets([initialPassword,resetPassword,invitationPassword,resetRaw,invitationRaw,signedIn.session]);

const finalLogin=await login(resetPassword);
assert.equal(finalLogin.response.status,200);
const loggedOut=await logoutRoute.POST(request("/api/v1/auth/logout",{method:"POST",headers:{cookie:finalLogin.header,"x-csrf-token":finalLogin.csrf}}));
assert.equal(loggedOut.status,200);
assert.equal((await sessionRoute.GET(request("/api/v1/auth/session",{headers:{cookie:finalLogin.header}}))).status,401);

console.log(`Stage 7 ${backend} password, session, CSRF, forged-header, tenant, reset, invitation, replay, and raw-secret checks passed.`);

async function loginAs(loginEmail:string,password:string){return loginRoute.POST(request("/api/v1/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:loginEmail,password})}));}

async function seed(passwordHash:string){
  if(backend==="sqlite"){
    const{database}=await import("../db/adapters/node-sqlite.ts"),now=new Date().toISOString();
    await database.batch([
      database.prepare("INSERT INTO users(id,email,full_name,status,mfa_enabled,created_at,updated_at) VALUES(?,?,?,'active',0,?,?)").bind(userId,email,"Auth Integration",now,now),
      database.prepare("INSERT INTO tenants(id,name,slug,status,country_code,created_at,updated_at) VALUES(?,?,?,'active','IN',?,?)").bind(tenantId,"Auth Integration School",`auth-${process.pid}`,now,now),
      database.prepare("INSERT INTO tenants(id,name,slug,status,country_code,created_at,updated_at) VALUES(?,?,?,'active','IN',?,?)").bind(otherTenantId,"Other School",`other-${process.pid}`,now,now),
      database.prepare("INSERT INTO roles(id,tenant_id,name,key,system,description,created_by,created_at,updated_at) VALUES(?,?,'Integration Role','integration',0,'',?,?,?)").bind(roleId,tenantId,userId,now,now),
      ...["students.view","students.manage","operations.view","operations.manage","workspace.view","workspace.manage"].map(permission=>database.prepare("INSERT INTO role_permissions(role_id,permission,created_at) VALUES(?,?,?)").bind(roleId,permission,now)),
      database.prepare("INSERT INTO memberships(tenant_id,user_id,role_key,status,created_at,updated_at) VALUES(?,?,'integration','active',?,?)").bind(tenantId,userId,now,now),
      ...["student_information","attendance","fees_finance"].map(moduleKey=>database.prepare("INSERT INTO module_policies(tenant_id,module_key,enabled,source,updated_at,updated_by) VALUES(?,?,1,'plan',?,?)").bind(tenantId,moduleKey,now,userId)),
      database.prepare("INSERT INTO auth_credentials(user_id,password_hash,credential_version,must_change_password,password_changed_at,created_at,updated_at) VALUES(?,?,1,0,?,?,?)").bind(userId,passwordHash,now,now,now),
    ]);
    return;
  }
  const{getPostgresPool}=await import("../server/runtime/postgres.ts"),client=await getPostgresPool().connect();
  try{await client.query("BEGIN");await client.query("SELECT set_config('app.auth_service','true',true)");await client.query("SELECT set_config('app.platform_create','true',true)");await client.query("INSERT INTO users(id,email,full_name,status) VALUES($1::uuid,$2::text,'Auth Integration','active') ON CONFLICT(id) DO NOTHING",[userId,email]);await client.query("SELECT set_config('app.tenant_id',$1::text,true)",[tenantId]);await client.query("INSERT INTO tenants(id,name,slug,status,country_code) VALUES($1::uuid,'Auth Integration School',$2::text,'active','IN') ON CONFLICT(id) DO NOTHING",[tenantId,`auth-${process.pid}`]);await client.query("SELECT set_config('app.tenant_id',$1::text,true)",[otherTenantId]);await client.query("INSERT INTO tenants(id,name,slug,status,country_code) VALUES($1::uuid,'Other School',$2::text,'active','IN') ON CONFLICT(id) DO NOTHING",[otherTenantId,`other-${process.pid}`]);await client.query("SELECT set_config('app.tenant_id',$1::text,true)",[tenantId]);await client.query("INSERT INTO roles(id,tenant_id,name,key,system,description,created_by) VALUES($1::uuid,$2::uuid,'Integration Role','integration',false,'',$3::uuid) ON CONFLICT(id) DO NOTHING",[roleId,tenantId,userId]);for(const permission of ["students.view","students.manage","operations.view","operations.manage","workspace.view","workspace.manage"])await client.query("INSERT INTO role_permissions(tenant_id,role_id,permission) VALUES($1::uuid,$2::uuid,$3::text) ON CONFLICT DO NOTHING",[tenantId,roleId,permission]);await client.query("INSERT INTO memberships(tenant_id,user_id,role_key,status,created_at,updated_at) VALUES($1::uuid,$2::uuid,'integration','active',now(),now()) ON CONFLICT DO NOTHING",[tenantId,userId]);for(const moduleKey of ["student_information","attendance","fees_finance"])await client.query("INSERT INTO module_policies(tenant_id,module_key,enabled,source,updated_by) VALUES($1::uuid,$2::text,true,'plan',$3::uuid) ON CONFLICT(tenant_id,module_key) DO UPDATE SET enabled=true",[tenantId,moduleKey,userId]);await client.query("INSERT INTO auth_credentials(user_id,password_hash) VALUES($1::uuid,$2::text) ON CONFLICT(user_id) DO UPDATE SET password_hash=excluded.password_hash,credential_version=1,disabled_at=NULL",[userId,passwordHash]);await client.query("COMMIT");}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}

async function alterSession(id:string,kind:"idle"|"absolute"){
  if(backend==="sqlite"){const{database}=await import("../db/adapters/node-sqlite.ts");const column=kind==="idle"?"idle_expires_at":"absolute_expires_at";await database.prepare(`UPDATE auth_sessions SET ${column}=? WHERE id=?`).bind("2000-01-01T00:00:00.000Z",id).run();return;}
  const{getPostgresPool}=await import("../server/runtime/postgres.ts"),client=await getPostgresPool().connect();try{await client.query("BEGIN");await client.query("SELECT set_config('app.auth_service','true',true)");const column=kind==="idle"?"idle_expires_at":"absolute_expires_at";await client.query(`UPDATE auth_sessions SET ${column}='2000-01-01T00:00:00Z' WHERE id=$1::uuid`,[id]);await client.query("COMMIT");}finally{client.release();}
}

async function incrementCredentialVersion(){if(backend==="sqlite"){const{database}=await import("../db/adapters/node-sqlite.ts");await database.prepare("UPDATE auth_credentials SET credential_version=credential_version+1 WHERE user_id=?").bind(userId).run();return;}const{getPostgresPool}=await import("../server/runtime/postgres.ts"),client=await getPostgresPool().connect();try{await client.query("BEGIN");await client.query("SELECT set_config('app.auth_service','true',true)");await client.query("UPDATE auth_credentials SET credential_version=credential_version+1 WHERE user_id=$1::uuid",[userId]);await client.query("COMMIT");}finally{client.release();}}

async function expireReset(tokenHash:string){if(backend==="sqlite"){const{database}=await import("../db/adapters/node-sqlite.ts");await database.prepare("UPDATE password_reset_tokens SET expires_at=? WHERE token_hash=?").bind("2000-01-01T00:00:00.000Z",tokenHash).run();return;}const{getPostgresPool}=await import("../server/runtime/postgres.ts"),client=await getPostgresPool().connect();try{await client.query("BEGIN");await client.query("SELECT set_config('app.auth_service','true',true)");await client.query("UPDATE password_reset_tokens SET expires_at='2000-01-01T00:00:00Z' WHERE token_hash=$1::text",[tokenHash]);await client.query("COMMIT");}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}}

async function setCredentialDisabled(disabled:boolean){if(backend==="sqlite"){const{database}=await import("../db/adapters/node-sqlite.ts");await database.prepare("UPDATE auth_credentials SET disabled_at=? WHERE user_id=?").bind(disabled?new Date().toISOString():null,userId).run();return;}const{getPostgresPool}=await import("../server/runtime/postgres.ts"),client=await getPostgresPool().connect();try{await client.query("BEGIN");await client.query("SELECT set_config('app.auth_service','true',true)");await client.query("UPDATE auth_credentials SET disabled_at=CASE WHEN $1::boolean THEN now() ELSE NULL END WHERE user_id=$2::uuid",[disabled,userId]);await client.query("COMMIT");}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}}

async function setMembershipStatus(status:"active"|"suspended"|"revoked"){if(backend==="sqlite"){const{database}=await import("../db/adapters/node-sqlite.ts");await database.prepare("UPDATE memberships SET status=?,updated_at=? WHERE tenant_id=? AND user_id=?").bind(status,new Date().toISOString(),tenantId,userId).run();return;}const{getPostgresPool}=await import("../server/runtime/postgres.ts"),client=await getPostgresPool().connect();try{await client.query("BEGIN");await client.query("SELECT set_config('app.auth_service','true',true)");await client.query("UPDATE memberships SET status=$1::membership_status,updated_at=now() WHERE tenant_id=$2::uuid AND user_id=$3::uuid",[status,tenantId,userId]);await client.query("COMMIT");}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}}

async function seedInvitation(tokenHash:string,options:{userId?:string;email?:string;status?:"pending"|"revoked";expired?:boolean}={}){const now=new Date(),expires=new Date(now.getTime()+(options.expired?-60_000:600_000)),targetUserId=options.userId??invitedUserId,targetEmail=options.email??invitationEmail,status=options.status??"pending";if(backend==="sqlite"){const{database}=await import("../db/adapters/node-sqlite.ts");await database.batch([database.prepare("INSERT INTO users(id,email,full_name,status,mfa_enabled,created_at,updated_at) VALUES(?,?,?,'invited',0,?,?)").bind(targetUserId,targetEmail,"Invited User",now.toISOString(),now.toISOString()),database.prepare("INSERT INTO memberships(tenant_id,user_id,role_key,status,created_at,updated_at) VALUES(?,?,'integration','invited',?,?)").bind(tenantId,targetUserId,now.toISOString(),now.toISOString()),database.prepare("INSERT INTO school_invitations(id,tenant_id,email,role_key,token_hash,status,expires_at,invited_by,created_at,updated_at) VALUES(?,?,?,'integration',?,?,?,?,?,?)").bind(crypto.randomUUID(),tenantId,targetEmail,tokenHash,status,expires.toISOString(),userId,now.toISOString(),now.toISOString())]);return;}const{getPostgresPool}=await import("../server/runtime/postgres.ts"),client=await getPostgresPool().connect();try{await client.query("BEGIN");await client.query("SELECT set_config('app.auth_service','true',true)");await client.query("SELECT set_config('app.tenant_id',$1::text,true)",[tenantId]);await client.query("INSERT INTO users(id,email,full_name,status) VALUES($1::uuid,$2::text,'Invited User','invited')",[targetUserId,targetEmail]);await client.query("INSERT INTO memberships(tenant_id,user_id,role_key,status) VALUES($1::uuid,$2::uuid,'integration','invited')",[tenantId,targetUserId]);await client.query("INSERT INTO school_invitations(tenant_id,email,role_key,token_hash,status,expires_at,invited_by) VALUES($1::uuid,$2::text,'integration',$3::text,$4::invitation_status,$5::timestamptz,$6::uuid)",[tenantId,targetEmail,tokenHash,status,expires,userId]);await client.query("COMMIT");}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}}

async function assertNoRawSecrets(values:string[]){if(backend==="sqlite"){const{database}=await import("../db/adapters/node-sqlite.ts");for(const table of ["auth_credentials","auth_sessions","password_reset_tokens","school_invitations"]){const rows=await database.prepare(`SELECT * FROM ${table}`).all();const serialized=JSON.stringify(rows.results);for(const value of values)assert.doesNotMatch(serialized,new RegExp(escape(value)));}return;}const{getPostgresPool}=await import("../server/runtime/postgres.ts"),client=await getPostgresPool().connect();try{await client.query("BEGIN");await client.query("SELECT set_config('app.auth_service','true',true)");await client.query("SELECT set_config('app.platform_read','true',true)");for(const table of ["auth_credentials","auth_sessions","password_reset_tokens","school_invitations"]){const result=await client.query(`SELECT row_to_json(record)::text value FROM ${table} record`);const serialized=JSON.stringify(result.rows);for(const value of values)assert.doesNotMatch(serialized,new RegExp(escape(value)));}await client.query("ROLLBACK");}finally{client.release();}}
function escape(value:string){return value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
