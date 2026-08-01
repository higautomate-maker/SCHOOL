import type { RoutePolicy } from "./policies.ts";
import { assertSameOrigin } from "./cookies.ts";
import { authenticatedActor } from "./service.ts";
import { assertCsrf } from "./service.ts";
import { AuthenticationError, AuthorizationError, type AuthenticatedActor } from "./types.ts";

export async function authorize(request:Request,policy:RoutePolicy,requestedTenantId?:string):Promise<AuthenticatedActor>{
  const actor=await authenticatedActor(request);if(!actor)throw new AuthenticationError();
  if(!["GET","HEAD","OPTIONS"].includes(request.method.toUpperCase())){
    try{assertSameOrigin(request);assertCsrf(actor,request);}catch{throw new AuthorizationError("Request rejected");}
  }
  return authorizeResolvedActor(actor,policy,requestedTenantId);
}
export function authorizeResolvedActor(actor:AuthenticatedActor|null,policy:RoutePolicy,requestedTenantId?:string):AuthenticatedActor{
  if(!actor)throw new AuthenticationError();
  if(policy.stepUp)throw new AuthorizationError("Step-up authentication is required");
  if(policy.scope==="platform"){
    if(actor.identityType!=="platform"||!actor.platformPermissions.has(policy.permission))throw new AuthorizationError();
    return actor;
  }
  if(actor.identityType!=="school")throw new AuthorizationError("School identity required");
  if(!requestedTenantId||!actor.activeTenantId||actor.activeTenantId!==requestedTenantId)throw new AuthorizationError("Tenant access denied");
  if(actor.membershipStatus!=="active")throw new AuthorizationError("Membership is not active");
  if(policy.module&&!moduleAllowed(actor.moduleEntitlements,policy.module))throw new AuthorizationError("Module is not entitled");
  if(!actor.rolePermissions.has(policy.permission))throw new AuthorizationError("Permission denied");
  return actor;
}
function normalizeModule(value:string){return value.replaceAll("&"," ").replace(/[^a-z0-9]+/gi," ").trim().toLowerCase();}
const canonicalModules:Record<string,string>={
  academics:"academics",
  attendance:"attendance",
  "qr code attendance":"attendance",
  "fees finance":"fees_finance",
  "finance fees":"fees_finance",
  "student information":"student_information",
  examinations:"examinations",
  "offline examinations":"examinations",
  "online examinations":"examinations",
  communication:"communication",
  communicate:"communication",
  "settings billing":"settings_billing",
  "access control":"access_control",
};
function canonicalModule(value:string){const normalized=normalizeModule(value);return canonicalModules[normalized]??normalized.replaceAll(" ","_");}
function moduleAllowed(entitlements:ReadonlySet<string>,module:string){const expected=canonicalModule(module);return [...entitlements].some(value=>canonicalModule(value)===expected);}
export function assertModuleEntitled(actor:AuthenticatedActor,module:string):void{if(module==="Dashboard")return;if(!moduleAllowed(actor.moduleEntitlements,module))throw new AuthorizationError("Module is not entitled");}
export function authErrorResponse(error:unknown):Response{if(error instanceof AuthenticationError)return Response.json({error:"Authentication required"},{status:401});if(error instanceof AuthorizationError)return Response.json({error:error.message},{status:403});throw error;}
