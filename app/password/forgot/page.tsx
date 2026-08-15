"use client";

import { FormEvent, useState } from "react";
import styles from "../../auth-flow.module.css";
import {
  RESET_MESSAGES,
  networkMessage,
  validateLoginFields,
} from "../../login/error-messages";

export default function Forgot() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");

    const validation = validateLoginFields(email, "placeholder-only-for-email");
    if (validation.email) {
      setFieldError(validation.email);
      return;
    }
    setFieldError("");
    setBusy(true);
    try {
      await fetch("/api/v1/auth/password/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      // Always acknowledge identically — never reveal whether the email exists.
      setDone(true);
    } catch {
      setError(networkMessage());
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.authPage}>
      <div className={styles.authCard}>
        <div className={styles.brand}><i>H</i><span><b>HIG School</b><small>SECURE ACCESS</small></span></div>
        <header>
          <span>PASSWORD HELP</span>
          <h1>Reset your password</h1>
          <p>Enter the email address for your HIG School account and we’ll send reset instructions.</p>
        </header>
        {done ? (
          <p className={styles.success} role="status" data-testid="forgot-acknowledged">{RESET_MESSAGES.requestAcknowledged}</p>
        ) : (
          <form className={styles.authForm} onSubmit={submit} noValidate data-testid="forgot-form">
            <label>
              Email address
              <input
                type="email"
                value={email}
                onChange={(event) => { setEmail(event.target.value); if (fieldError) setFieldError(""); }}
                autoComplete="username"
                inputMode="email"
                placeholder="name@school.edu"
                aria-invalid={Boolean(fieldError)}
                data-testid="forgot-email-input"
              />
              {fieldError && <em className={styles.fieldError} data-testid="forgot-email-error">{fieldError}</em>}
            </label>
            {error && <p className={styles.error} role="alert" data-testid="forgot-error">{error}</p>}
            <button className={styles.submit} disabled={busy} data-testid="forgot-submit-button">{busy ? "Sending…" : "Send reset instructions"}</button>
          </form>
        )}
        <p className={styles.note}>For your security, we never confirm whether an email address has an account.</p>
        <div className={styles.footer}>
          <a href="/login" data-testid="forgot-back-link">Back to sign in</a>
          <span>Protected by tenant &amp; role access controls</span>
        </div>
      </div>
    </main>
  );
}
