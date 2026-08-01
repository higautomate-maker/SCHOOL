import { readFileSync, statSync } from "node:fs";
import { hashPassword } from "../server/auth/password.ts";
import { bootstrapPlatformAdmin, writeSecurityEvent } from "../server/auth/repository.ts";

const email=process.env.HIG_BOOTSTRAP_EMAIL?.trim().toLowerCase();
const fullName=process.env.HIG_BOOTSTRAP_FULL_NAME?.trim();
const passwordFile=process.env.HIG_BOOTSTRAP_PASSWORD_FILE?.trim();

if(!email||!/^\S+@\S+\.\S+$/.test(email)||!fullName||!passwordFile){console.error("Bootstrap requires HIG_BOOTSTRAP_EMAIL, HIG_BOOTSTRAP_FULL_NAME, and HIG_BOOTSTRAP_PASSWORD_FILE");process.exit(2);}

try{
  const mode=statSync(passwordFile).mode&0o777;
  if((mode&0o077)!==0)throw new Error("Password file permissions must be 0600");
  const password=readFileSync(passwordFile,"utf8").replace(/[\r\n]+$/g,"");
  const passwordHash=await hashPassword(password);
  await bootstrapPlatformAdmin({email,fullName,passwordHash});
  await writeSecurityEvent({action:"auth.bootstrap",outcome:"success",metadata:{emailDomain:email.split("@")[1]??"unknown"}});
  console.log("Platform administrator bootstrap completed.");
}catch(error){
  try{await writeSecurityEvent({action:"auth.bootstrap",outcome:"failure"});}catch{}
  console.error(error instanceof Error?error.message:"Platform administrator bootstrap failed");
  process.exit(1);
}
