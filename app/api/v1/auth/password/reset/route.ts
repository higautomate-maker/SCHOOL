import { z } from "zod";
import { assertSameOrigin,noStoreHeaders } from "../../../../../../server/auth/cookies.ts";
import { privacyHash,sha256 } from "../../../../../../server/auth/crypto.ts";
import { hashPassword,validatePassword } from "../../../../../../server/auth/password.ts";
import { authRateLimit } from "../../../../../../server/auth/rate-limit.ts";
import { consumeReset,writeSecurityEvent } from "../../../../../../server/auth/repository.ts";
import { clientAddress,requestMetadata } from "../../../../../../server/auth/service.ts";

export async function POST(request:Request){
  try{assertSameOrigin(request);}catch{return Response.json({error:"Request rejected"},{status:403,headers:noStoreHeaders()});}
  const parsed=z.object({token:z.string().min(32).max(256),password:z.string()}).safeParse(await request.json().catch(()=>null));
  if(!parsed.success||validatePassword(parsed.data?.password).length)return Response.json({error:"Reset request is invalid or expired"},{status:400,headers:noStoreHeaders()});
  const ip=clientAddress(request);
  let limit;
  try{limit=await authRateLimit("reset",privacyHash(parsed.data.token),ip);}catch{return Response.json({error:"Authentication service unavailable"},{status:503,headers:noStoreHeaders()});}
  if(!limit.allowed)return Response.json({error:"Reset request is invalid or expired"},{status:429,headers:noStoreHeaders({"retry-after":String(limit.retryAfter)})});
  if(limit.delayMs)await new Promise(resolve=>setTimeout(resolve,limit.delayMs));
  const userId=await consumeReset(sha256(parsed.data.token),await hashPassword(parsed.data.password),requestMetadata(request));
  if(!userId)await writeSecurityEvent({action:"auth.password_reset.complete",outcome:"failure",ipHash:requestMetadata(request).ipHash});
  return userId?Response.json({reset:true},{headers:noStoreHeaders()}):Response.json({error:"Reset request is invalid or expired"},{status:400,headers:noStoreHeaders()});
}
