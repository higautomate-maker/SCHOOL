"use client";

import { FormEvent, useState } from "react";
import styles from "./login.module.css";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const returnTo = new URLSearchParams(location.search).get("returnTo") ?? undefined;
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, returnTo }),
      });
      const result = await response.json() as { error?: string; destination?: string };
      if (!response.ok) throw new Error(result.error ?? "Sign in failed");
      location.assign(result.destination ?? "/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.loginPage}>
      <section className={styles.brandPanel}>
        <div className={styles.brand}><i>H</i><span><b>HIG School</b><small>HIG AUTOMATION INDIA PRIVATE LIMITED</small></span></div>
        <div className={styles.promise}>
          <span>SECURE SCHOOL ECOSYSTEM</span>
          <h1>One trusted workspace for every school role.</h1>
          <p>Your school, Company-enabled modules and role permissions are resolved securely after sign-in.</p>
          <div className={styles.trustGrid}>
            <article><b>Tenant isolated</b><small>Each school remains securely separated.</small></article>
            <article><b>Role controlled</b><small>Users see only approved modules.</small></article>
            <article><b>Audited changes</b><small>Critical access actions are recorded.</small></article>
          </div>
        </div>
        <footer>HIG School OS · India-region tenant workspace</footer>
      </section>
      <section className={styles.loginPanel}>
        <div className={styles.loginCard}>
          <header><span>SECURE ACCESS</span><h2>Sign in to HIG School</h2><p>Use the account created by your Company or School administrator.</p></header>
          <form onSubmit={signIn}>
            <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" placeholder="name@school.edu" required /></label>
            <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" minLength={12} maxLength={128} placeholder="Enter your secure password" required /></label>
            {error && <p className={styles.error} role="alert">{error}</p>}
            <button disabled={busy}>{busy ? "Signing in…" : "Sign in securely"}<span>→</span></button>
          </form>
          <div className={styles.cardFooter}><a href="/password/forgot">Forgot your password?</a><span>Protected by tenant and role access controls</span></div>
        </div>
      </section>
    </main>
  );
}
