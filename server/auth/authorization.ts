import type { RoutePolicy } from "./policies.ts";
import { isModuleEntitled } from "../access/catalogue.ts";
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
  if(policy.module&&!isModuleEntitled(actor.moduleEntitlements,policy.module))throw new AuthorizationError("Module is not entitled");
  if(!actor.rolePermissions.has(policy.permission))throw new AuthorizationError("Permission denied");
  return actor;
}
export function assertModuleEntitled(actor:AuthenticatedActor,module:string):void{if(module==="Dashboard")return;if(!isModuleEntitled(actor.moduleEntitlements,module))throw new AuthorizationError("Module is not entitled");}
export function authErrorResponse(error:unknown):Response{if(error instanceof AuthenticationError)return Response.json({error:"Authentication required"},{status:401});if(error instanceof AuthorizationError)return Response.json({error:error.message},{status:403});throw error;}
