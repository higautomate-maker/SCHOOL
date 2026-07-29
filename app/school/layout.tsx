"use client";

import { ReactNode, useEffect, useState } from "react";

export default function SchoolLayout({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    fetch("/api/v1/demo/session").then(async (response) => response.ok ? response.json() as Promise<{ user: { role: string } }> : null).then((session) => {
      if (session?.user.role === "school_admin" || session?.user.role === "company") setReady(true);
      else globalThis.location.replace("/login");
    }).catch(() => globalThis.location.replace("/login"));
  }, []);
  return ready ? children : <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "Arial", color: "#556273" }}>Opening School workspace…</main>;
}
