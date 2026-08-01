import { z } from "zod";
import { assertSameOrigin,noStoreHeaders } from "../../../../../../server/auth/cookies.ts";
import { randomToken,sha256 } from "../../../../../../server/auth/crypto.ts";
import { emailDelivery } from "../../../../../../server/auth/email.ts";
import { authRateLimit } from "../../../../../../server/auth/rate-limit.ts";
import { createReset,invalidateReset,writeSecurityEvent } from "../../../../../../server/auth/repository.ts";
import { clientAddress,requestMetadata } from "../../../../../../server/auth/service.ts";

const generic={message:"If the account is eligible, password-reset instructions will be sent."};
export async function POST(request:Request){
  try{assertSameOrigin(request);}catch{return Response.json(generic,{headers:noStoreHeaders()});}
  const parsed=z.object({email:z.string().email().max(254)}).safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return Response.json(generic,{headers:noStoreHeaders()});
  const email=parsed.data.email.trim().toLowerCase(),ip=clientAddress(request);
  let limit;
  try{limit=await authRateLimit("reset",email,ip);}catch{return Response.json(generic,{status:503,headers:noStoreHeaders()});}
  if(!limit.allowed)return Response.json(generic,{status:429,headers:noStoreHeaders({"retry-after":String(limit.retryAfter)})});
  if(limit.delayMs)await new Promise(resolve=>setTimeout(resolve,limit.delayMs));
  const raw=randomToken(),tokenHash=sha256(raw),created=await createReset(email,tokenHash,requestMetadata(request).ipHash);
  if(created){
    try{
      const base=process.env.APP_URL;if(!base)throw new Error("APP_URL is required");
      await emailDelivery().send({to:created.email,subject:"Reset your HIG School password",text:`Open this link to reset your password: ${new URL(`/password/reset?token=${encodeURIComponent(raw)}`,base)}`});
      await writeSecurityEvent({actorId:created.userId,action:"auth.password_reset.request",outcome:"success",ipHash:requestMetadata(request).ipHash});
    }catch{
      await invalidateReset(tokenHash);
      await writeSecurityEvent({actorId:created.userId,action:"auth.password_reset.request",outcome:"failure",ipHash:requestMetadata(request).ipHash});
      // Preserve the same response as an unknown account. Operations can see
      // the failed delivery in the audit trail without creating an account-
      // enumeration oracle.
      return Response.json(generic,{headers:noStoreHeaders()});
    }
  }
  return Response.json(generic,{headers:noStoreHeaders()});
}
