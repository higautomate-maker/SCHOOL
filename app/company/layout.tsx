"use client";

import { ReactNode, useEffect, useState } from "react";

export default function CompanyLayout({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    fetch("/api/v1/auth/session", { cache: "no-store" }).then(async (response) => response.ok ? response.json() as Promise<{ user: { identityType: string } }> : null).then((session) => {
      if (session?.user.identityType === "platform") setReady(true);
      else globalThis.location.replace("/login");
    }).catch(() => globalThis.location.replace("/login"));
  }, []);
  return ready ? children : <main className="portal-loading">Opening Company workspace…</main>;
}
