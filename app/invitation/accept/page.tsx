"use client";

import { FormEvent, useState } from "react";
import styles from "../../auth-flow.module.css";
import AuthBrandPanel from "../../AuthBrandPanel";
import {
  INVITATION_MESSAGES,
  messageForInvitationStatus,
  networkMessage,
  passwordPolicyError,
  validateLoginFields,
} from "../../login/error-messages";

export default function Accept() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");

    const emailIssue = validateLoginFields(email, "x").email;
    const passwordIssue = passwordPolicyError(password);
    setEmailError(emailIssue ?? "");
    setPasswordError(passwordIssue ?? "");
    if (emailIssue || passwordIssue) return;

    setBusy(true);
    try {
      const token = new URLSearchParams(location.search).get("token") ?? "";
      const response = await fetch("/api/v1/auth/invitations/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, email: email.trim(), password }),
      });
      if (response.ok) setDone(true);
      else setError(messageForInvitationStatus(response.status));
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
          <span>SCHOOL INVITATION</span>
          <h1>Accept your invitation</h1>
          <p>Confirm your email and set a password to activate your HIG School account.</p>
        </header>
        {done ? (
          <>
            <p className={styles.success} role="status" data-testid="accept-success">{INVITATION_MESSAGES.acceptSuccess}</p>
            <div className={styles.footer}><a href="/login" data-testid="accept-signin-link">Go to sign in</a><span /></div>
          </>
        ) : (
          <form className={styles.authForm} onSubmit={submit} noValidate data-testid="accept-form">
            <label>
              Email address
              <input
                type="email"
                value={email}
                onChange={(event) => { setEmail(event.target.value); if (emailError) setEmailError(""); }}
                autoComplete="username"
                inputMode="email"
                placeholder="name@school.edu"
                aria-invalid={Boolean(emailError)}
                data-testid="accept-email-input"
              />
              {emailError && <em className={styles.fieldError} data-testid="accept-email-error">{emailError}</em>}
            </label>
            <label>
              Create a password
              <span className={styles.passwordField}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => { setPassword(event.target.value); if (passwordError) setPasswordError(""); }}
                  autoComplete="new-password"
                  maxLength={128}
                  placeholder="At least 12 characters"
                  aria-invalid={Boolean(passwordError)}
                  data-testid="accept-password-input"
                />
                <button type="button" className={styles.passwordToggle} onClick={() => setShowPassword((v) => !v)} aria-pressed={showPassword} aria-label={showPassword ? "Hide password" : "Show password"} data-testid="accept-password-toggle">{showPassword ? "Hide" : "Show"}</button>
              </span>
              {passwordError && <em className={styles.fieldError} data-testid="accept-password-error">{passwordError}</em>}
            </label>
            {error && <p className={styles.error} role="alert" data-testid="accept-error">{error}</p>}
            <button className={styles.submit} disabled={busy} data-testid="accept-submit-button">{busy ? "Activating…" : "Accept invitation"}</button>
          </form>
        )}
        <p className={styles.note}>Invitations expire for your security. If yours no longer works, ask your administrator to resend it.</p>
      </div>
      </div>
    </main>
  );
}
