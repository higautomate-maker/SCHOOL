import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticatedActor } from "../server/auth/service.ts";

export type ChatGPTUser={displayName:string;email:string;fullName:string|null};

/** Compatibility facade. Identity is resolved exclusively from the real server-side session. */
export async function getChatGPTUser():Promise<ChatGPTUser|null>{const incoming=await headers();const request=new Request("https://session.local/",{headers:incoming});const actor=await authenticatedActor(request);return actor?{displayName:actor.displayName,email:actor.email,fullName:actor.fullName}:null;}
export async function requireChatGPTUser(returnTo:string):Promise<ChatGPTUser>{const user=await getChatGPTUser();if(user)return user;redirect(`/login?returnTo=${encodeURIComponent(safeReturn(returnTo))}`);}
export function chatGPTSignInPath(returnTo:string){return `/login?returnTo=${encodeURIComponent(safeReturn(returnTo))}`;}
export function chatGPTSignOutPath(){return "/login";}
function safeReturn(value:string){if(!value.startsWith("/")||value.startsWith("//"))return "/";try{const url=new URL(value,"https://local.invalid");return url.origin==="https://local.invalid"?`${url.pathname}${url.search}${url.hash}`:"/";}catch{return "/";}}
