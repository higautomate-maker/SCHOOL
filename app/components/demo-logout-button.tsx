"use client";
export function DemoLogoutButton({className,label="Sign out"}:{className?:string;label?:string}){async function logout(){await fetch("/api/v1/demo/session",{method:"DELETE"});location.assign("/login");}return <button type="button" aria-label="Sign out" className={className} onClick={logout}>{label}</button>;}
