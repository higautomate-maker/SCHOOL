"use client";
import { useRouter } from "next/navigation";
import { authenticatedFetch } from "../auth-client";

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();

  async function logout() {
    await authenticatedFetch("/api/v1/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return <button type="button" className={className} onClick={logout}>Sign out</button>;
}
