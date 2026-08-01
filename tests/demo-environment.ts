import { randomBytes } from "node:crypto";
import type { DemoRole } from "../server/demo-store.ts";

const roles:DemoRole[]=["company","school_admin","staff","student","parent","driver"];
const accounts=roles.map((role)=>({
  email:`${role}@demo.invalid`,
  password:randomBytes(24).toString("base64url"),
  role,
  name:`Demo ${role}`,
  token:randomBytes(32).toString("base64url"),
  destination:role==="company"?"/company":role==="school_admin"?"/school/dashboard":role==="driver"?"/mobile-preview/driver":role==="staff"?"/mobile-preview/staff":"/mobile-preview/student",
}));

process.env.HIG_DEMO_ACCOUNTS_JSON=JSON.stringify(accounts);

export function demoToken(role:DemoRole):string{return accounts.find((account)=>account.role===role)?.token??"";}
