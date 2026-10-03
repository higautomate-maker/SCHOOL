"use client";
import { useRouter } from "next/navigation";

export function DemoLogoutButton({ className, label = "Sign out" }: { className?: string; label?: string }) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/v1/demo/session", { method: "DELETE" });
    router.replace("/login");
    router.refresh();
  }

  return <button type="button" aria-label="Sign out" className={className} onClick={logout}>{label}</button>;
}
