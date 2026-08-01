"use client";
import { authenticatedFetch } from "../auth-client";
export function LogoutButton({className}:{className?:string}){async function logout(){await authenticatedFetch("/api/v1/auth/logout",{method:"POST"});location.assign("/login");}return <button type="button" className={className} onClick={logout}>Sign out</button>}
