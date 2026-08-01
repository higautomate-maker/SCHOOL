import { z } from "zod";
import { assertSameOrigin, csrfCookie, noStoreHeaders, sessionCookie } from "../../../../../server/auth/cookies.ts";
import { privacyHash } from "../../../../../server/auth/crypto.ts";
import { authRateLimit } from "../../../../../server/auth/rate-limit.ts";
import { resolveSession,writeSecurityEvent } from "../../../../../server/auth/repository.ts";
import { authenticatePassword, clientAddress,requestMetadata } from "../../../../../server/auth/service.ts";

const schema=z.object({email:z.string().email().max(254),password:z.string().max(128),returnTo:z.string().optional()});

export async function POST(request:Request){
  try{assertSameOrigin(request);}catch{return Response.json({error:"Request rejected"},{status:403,headers:noStoreHeaders()});}
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return Response.json({error:"Invalid email or password"},{status:401,headers:noStoreHeaders()});
  const ip=clientAddress(request);
  let limit;
  try{limit=await authRateLimit("login",parsed.data.email,ip);}catch{return Response.json({error:"Authentication service unavailable"},{status:503,headers:noStoreHeaders()});}
  if(!limit.allowed){
    const metadata=requestMetadata(request);
    await writeSecurityEvent({action:"auth.account.lock",outcome:"failure",ipHash:privacyHash(ip),metadata:{emailHash:privacyHash(parsed.data.email.trim().toLowerCase()),userAgentHash:metadata.userAgentHash}});
    return Response.json({error:"Invalid email or password"},{status:429,headers:noStoreHeaders({"retry-after":String(limit.retryAfter)})});
  }
  if(limit.delayMs)await new Promise(resolve=>setTimeout(resolve,limit.delayMs));
  let result;
  try{result=await authenticatePassword(parsed.data.email,parsed.data.password,request);}catch{return Response.json({error:"Authentication service unavailable"},{status:503,headers:noStoreHeaders()});}
  if(!result)return Response.json({error:"Invalid email or password"},{status:401,headers:noStoreHeaders()});
  const actor=await resolveSession(result.session.token);
  if(!actor)return Response.json({error:"Invalid email or password"},{status:401,headers:noStoreHeaders()});
  const headers=new Headers(noStoreHeaders());
  headers.append("set-cookie",sessionCookie(result.session.token));
  headers.append("set-cookie",csrfCookie(result.session.csrfToken));
  return Response.json({authenticated:true,destination:safeReturn(parsed.data.returnTo,actor.identityType)},{headers});
}

function safeReturn(value:string|undefined,identityType:"platform"|"school"){const fallback=identityType==="platform"?"/company":"/school/dashboard";if(!value?.startsWith("/")||value.startsWith("//"))return fallback;try{const url=new URL(value,"https://local.invalid");const allowed=identityType==="platform"?(url.pathname==="/"||url.pathname.startsWith("/company")):url.pathname.startsWith("/school");return url.origin==="https://local.invalid"&&allowed?`${url.pathname}${url.search}`:fallback;}catch{return fallback;}}
