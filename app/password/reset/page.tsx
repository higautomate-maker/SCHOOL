"use client";

import { FormEvent, useState } from "react";
import styles from "../../auth-flow.module.css";
import AuthBrandPanel from "../../AuthBrandPanel";
import {
  RESET_MESSAGES,
  messageForResetStatus,
  networkMessage,
  passwordPolicyError,
} from "../../login/error-messages";

export default function Reset() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");

    const policy = passwordPolicyError(password);
    if (policy) {
      setFieldError(policy);
      return;
    }
    setFieldError("");
    setBusy(true);
    try {
      const token = new URLSearchParams(location.search).get("token") ?? "";
      const response = await fetch("/api/v1/auth/password/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (response.ok) setDone(true);
      else setError(messageForResetStatus(response.status));
    } catch {
      setError(networkMessage());
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.authPage}>
      <AuthBrandPanel />
      <div className={styles.cardColumn}>
      <div className={styles.authCard}>
        <div className={styles.brand}><i>H</i><span><b>HIG School</b><small>SECURE ACCESS</small></span></div>
        <header>
          <span>PASSWORD RESET</span>
          <h1>Choose a new password</h1>
          <p>Create a strong password of at least 12 characters that you don’t use elsewhere.</p>
        </header>
        {done ? (
          <>
            <p className={styles.success} role="status" data-testid="reset-success">{RESET_MESSAGES.resetSuccess}</p>
            <div className={styles.footer}><a href="/login" data-testid="reset-signin-link">Go to sign in</a><span /></div>
          </>
        ) : (
          <form className={styles.authForm} onSubmit={submit} noValidate data-testid="reset-form">
            <label>
              New password
              <span className={styles.passwordField}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => { setPassword(event.target.value); if (fieldError) setFieldError(""); }}
                  autoComplete="new-password"
                  maxLength={128}
                  placeholder="At least 12 characters"
                  aria-invalid={Boolean(fieldError)}
                  data-testid="reset-password-input"
                />
                <button type="button" className={styles.passwordToggle} onClick={() => setShowPassword((v) => !v)} aria-pressed={showPassword} aria-label={showPassword ? "Hide password" : "Show password"} data-testid="reset-password-toggle">{showPassword ? "Hide" : "Show"}</button>
              </span>
              {fieldError && <em className={styles.fieldError} data-testid="reset-password-error">{fieldError}</em>}
            </label>
            {error && <p className={styles.error} role="alert" data-testid="reset-error">{error}</p>}
            <button className={styles.submit} disabled={busy} data-testid="reset-submit-button">{busy ? "Resetting…" : "Reset password"}</button>
          </form>
        )}
        <p className={styles.note}>Reset links expire for your security. If yours no longer works, request a new one from the sign-in page.</p>
      </div>
      </div>
    </main>
  );
}
