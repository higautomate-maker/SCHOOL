"use client";

import { FormEvent, useEffect, useState } from "react";
import styles from "./login.module.css";

const demoProfiles = [
  { label: "Company Login", role: "Platform Super Admin", email: "company@higschool.in", password: "HIG@Company2026", icon: "HQ", text: "Onboard schools, assign plans and control module access." },
  { label: "School Login", role: "School Administrator", email: "schooladmin@northfield.edu", password: "School@2026", icon: "SC", text: "Manage every enabled academic and operational module." },
  { label: "Staff & Admin App", role: "Teacher", email: "teacher@northfield.edu", password: "Teacher@2026", icon: "ST", text: "Take attendance, assign homework and communicate." },
  { label: "Student App", role: "Student", email: "student@northfield.edu", password: "Student@2026", icon: "SD", text: "Attendance, homework, fees, results and school updates." },
  { label: "Parent App", role: "Parent", email: "parent@northfield.edu", password: "Parent@2026", icon: "PA", text: "Monitor the linked child and communicate with school." },
  { label: "Driver GPS App", role: "Driver", email: "driver@northfield.edu", password: "Driver@2026", icon: "DR", text: "Run assigned trips and stream vehicle location." },
] as const;

export default function LoginPage() {
  const [email, setEmail] = useState<string>(demoProfiles[0].email);
  const [password, setPassword] = useState<string>(demoProfiles[0].password);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (new URLSearchParams(globalThis.location.search).has("logout")) {
      fetch("/api/v1/demo/session", { method: "DELETE" }).catch(() => undefined);
      localStorage.removeItem("hig_demo_token");
      localStorage.removeItem("hig_demo_user");
    }
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/demo/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
      const result = await response.json() as { error?: string; token?: string; user?: unknown; destination?: string };
      if (!response.ok || !result.token || !result.destination) throw new Error(result.error || "Sign in failed");
      localStorage.setItem("hig_demo_token", result.token);
      localStorage.setItem("hig_demo_user", JSON.stringify(result.user));
      globalThis.location.href = result.destination;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return <main className={styles.loginPage}>
    <section className={styles.brandPanel}>
      <div className={styles.brand}><i>H</i><span><b>Hig School</b><small>HIG AUTOMATION INDIA PRIVATE LIMITED</small></span></div>
      <div className={styles.promise}><span>ONE CONNECTED SCHOOL ECOSYSTEM</span><h1>Every role works from the same live school data.</h1><p>Company controls module access. Schools run operations. Mobile apps receive the same attendance, homework, fees, notices and transport updates.</p></div>
      <div className={styles.syncFlow}><div><b>Company</b><span>Access policies</span></div><i>→</i><div><b>School</b><span>Daily operations</span></div><i>→</i><div><b>Apps</b><span>Live updates</span></div></div>
      <footer>Demo environment · Data resets when the demo server restarts</footer>
    </section>

    <section className={styles.loginPanel}>
      <header><span>SECURE DEMO ACCESS</span><h2>Choose a test login</h2><p>Use any profile below. Changes made by staff and drivers are shared across the demo.</p></header>
      <div className={styles.profileGrid}>{demoProfiles.map((profile) => <button type="button" className={email === profile.email ? styles.selected : ""} key={profile.email} onClick={() => { setEmail(profile.email); setPassword(profile.password); setError(""); }}><i>{profile.icon}</i><span><b>{profile.label}</b><small>{profile.text}</small></span></button>)}</div>
      <form onSubmit={signIn}>
        <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></label>
        <label>Password<input type="text" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
        {error && <p className={styles.error}>{error}</p>}
        <button disabled={busy}>{busy ? "Signing in…" : "Open selected workspace"} <span>→</span></button>
      </form>
      <p className={styles.note}><b>Demo credentials only.</b> Replace this demo identity layer with managed production authentication, MFA and password recovery before onboarding real schools.</p>
    </section>
  </main>;
}
