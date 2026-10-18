"use client";
import { authenticatedFetch } from "../auth-client";

export function LogoutButton({ className }: { className?: string }) {
  async function logout() {
    const response = await authenticatedFetch("/api/v1/auth/logout", { method: "POST" });
    if (response.ok) globalThis.location.replace("/login");
  }

  return <button type="button" className={className} onClick={logout}>Sign out</button>;
}
