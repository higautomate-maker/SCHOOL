import { findLoginRecord, createSession, resolveSession, replacePassword, revokeSession, writeSecurityEvent } from "./repository.ts";
import { hashPassword, verifyPassword } from "./password.ts";
import { privacyHash, sha256 } from "./crypto.ts";
import { sessionTokenFromRequest } from "./cookies.ts";
import type { AuthenticatedActor, SessionCreation } from "./types.ts";

const dummyHashKey = Symbol.for("hig.auth.dummy-hash");
type AuthGlobal = typeof globalThis & { [dummyHashKey]?: Promise<string> };
function dummyHash(){const target=globalThis as AuthGlobal;return target[dummyHashKey]??=(hashPassword("This is a non-account dummy password 2026"));}

export function clientAddress(request:Request){return request.headers.get("x-forwarded-for")?.split(",").map(value=>value.trim()).filter(Boolean).at(-1)??"unknown";}
export function requestMetadata(request:Request){return{ipHash:privacyHash(clientAddress(request)),userAgentHash:privacyHash(request.headers.get("user-agent")??"unknown")};}
export async function authenticatePassword(emailInput:string,password:string,request:Request):Promise<{actorUserId:string;session:SessionCreation}|null>{
  const email=emailInput.trim().toLowerCase(),metadata=requestMetadata(request),record=await findLoginRecord(email),comparison=await verifyPassword(record?.passwordHash??await dummyHash(),password);
  if(!record||!comparison.valid||record.disabled||record.status!=="active"||!record.eligible){await writeSecurityEvent({actorId:record?.userId,action:"auth.login",outcome:"failure",ipHash:metadata.ipHash,metadata:{emailHash:privacyHash(email),userAgentHash:metadata.userAgentHash}});return null;}
  if(comparison.needsRehash)await replacePassword(record.userId,await hashPassword(password));
  const refreshed=await findLoginRecord(email);const session=await createSession(record.userId,refreshed?.credentialVersion??record.credentialVersion,null,metadata);
  await writeSecurityEvent({actorId:record.userId,action:"auth.login",outcome:"success",ipHash:metadata.ipHash,metadata:{userAgentHash:metadata.userAgentHash}});return{actorUserId:record.userId,session};
}
export async function authenticatedActor(request:Request):Promise<AuthenticatedActor|null>{const token=sessionTokenFromRequest(request);return token?resolveSession(token):null;}
export async function logout(request:Request):Promise<void>{const actor=await authenticatedActor(request);if(actor){const metadata=requestMetadata(request);await revokeSession(actor.sessionId,"logout");await writeSecurityEvent({actorId:actor.userId,tenantId:actor.activeTenantId,action:"auth.logout",outcome:"success",ipHash:metadata.ipHash,metadata:{userAgentHash:metadata.userAgentHash}});}}
export function assertCsrf(actor:AuthenticatedActor,request:Request):void{const token=request.headers.get("x-csrf-token")??"";if(!token||sha256(token)!==actor.csrfHash)throw new Error("CSRF validation failed");}
