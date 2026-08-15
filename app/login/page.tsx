"use client";

import { FormEvent, useState } from "react";
import styles from "./login.module.css";
import {
  LOGIN_MESSAGES,
  LoginFieldErrors,
  messageForStatus,
  networkMessage,
  validateLoginFields,
} from "./error-messages";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [showHelp, setShowHelp] = useState(false);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setError("");

    // Validate required fields locally before sending any request.
    const validation = validateLoginFields(email, password);
    setFieldErrors(validation);
    if (validation.email || validation.password) return;

    setBusy(true);
    try {
      const returnTo = new URLSearchParams(location.search).get("returnTo") ?? undefined;
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, returnTo }),
      });
      if (!response.ok) {
        setError(messageForStatus(response.status));
        return;
      }
      const result = (await response.json().catch(() => ({}))) as { destination?: string };
      location.assign(result.destination ?? "/");
    } catch {
      // fetch threw: offline, DNS failure or aborted request.
      setError(networkMessage());
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
          <form onSubmit={signIn} noValidate data-testid="login-form">
            <label>
              Email address
              <input
                type="email"
                value={email}
                onChange={(event) => { setEmail(event.target.value); if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined })); }}
                autoComplete="username"
                inputMode="email"
                placeholder="name@school.edu"
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
                data-testid="login-email-input"
              />
              {fieldErrors.email && <em className={styles.fieldError} id="login-email-error" data-testid="login-email-error">{fieldErrors.email}</em>}
            </label>
            <label>
              Password
              <span className={styles.passwordField}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => { setPassword(event.target.value); if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined })); }}
                  autoComplete="current-password"
                  maxLength={128}
                  placeholder="Enter your password"
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
                  data-testid="login-password-input"
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  onClick={() => setShowPassword((value) => !value)}
                  aria-pressed={showPassword}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  data-testid="login-password-toggle"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </span>
              {fieldErrors.password && <em className={styles.fieldError} id="login-password-error" data-testid="login-password-error">{fieldErrors.password}</em>}
            </label>
            {error && <p className={styles.error} role="alert" data-testid="login-error">{error}</p>}
            <button disabled={busy} data-testid="login-submit-button">{busy ? "Signing in…" : "Sign in securely"}<span>→</span></button>
          </form>
          <div className={styles.cardFooter}>
            <button type="button" className={styles.helpLink} onClick={() => setShowHelp((value) => !value)} aria-expanded={showHelp} data-testid="login-help-toggle">Need help signing in?</button>
            <span>Protected by tenant and role access controls</span>
          </div>
          {showHelp && (
            <div className={styles.helpPanel} role="note" data-testid="login-help-panel">
              <p><b>Can’t sign in?</b></p>
              <ul>
                <li>Check your email address and password for typos.</li>
                <li>Passwords are case-sensitive.</li>
                <li>Forgot your password? <a href="/password/forgot" data-testid="login-forgot-link">Reset it here</a>.</li>
                <li>Still stuck? Contact your Company or School administrator to confirm your account.</li>
              </ul>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export { LOGIN_MESSAGES };
