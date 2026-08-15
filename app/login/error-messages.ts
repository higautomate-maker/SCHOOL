// Emergent UX redesign: user-safe login messaging.
// This module maps transport/HTTP outcomes to plain-language, non-technical
// messages. It never surfaces server error strings, stack traces, timeouts,
// API internals or database errors, and never reveals whether an email exists.

export const LOGIN_MESSAGES = {
  invalidCredentials:
    "Incorrect email or password. Please check your details and try again.",
  network:
    "We couldn’t connect. Please check your internet connection and try again.",
  rateLimited:
    "Too many sign-in attempts. Please wait a moment, then try again.",
  unavailable:
    "Sign-in is temporarily unavailable. Please try again in a few minutes.",
  rejected:
    "We couldn’t verify this request. Please refresh the page and try again.",
  emailRequired: "Please enter your email address.",
  emailInvalid: "Please enter a valid email address.",
  passwordRequired: "Please enter your password.",
} as const;

export type LoginFieldErrors = { email?: string; password?: string };

// Lightweight, forgiving email shape check for pre-submit validation only.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLoginFields(
  email: string,
  password: string,
): LoginFieldErrors {
  const errors: LoginFieldErrors = {};
  const trimmedEmail = email.trim();
  if (!trimmedEmail) errors.email = LOGIN_MESSAGES.emailRequired;
  else if (!EMAIL_PATTERN.test(trimmedEmail))
    errors.email = LOGIN_MESSAGES.emailInvalid;
  if (!password) errors.password = LOGIN_MESSAGES.passwordRequired;
  return errors;
}

// Maps an HTTP status from the auth API to a safe, user-facing message.
// Any 4xx that is not a recognised safe case is treated as invalid credentials
// so we never leak account existence or internal validation detail.
export function messageForStatus(status: number): string {
  if (status === 429) return LOGIN_MESSAGES.rateLimited;
  if (status === 403) return LOGIN_MESSAGES.rejected;
  if (status === 503) return LOGIN_MESSAGES.unavailable;
  if (status >= 500) return LOGIN_MESSAGES.unavailable;
  if (status === 401 || status === 400 || status === 422 || status === 404)
    return LOGIN_MESSAGES.invalidCredentials;
  if (status >= 400) return LOGIN_MESSAGES.invalidCredentials;
  return LOGIN_MESSAGES.unavailable;
}

// Called when fetch itself throws (offline, DNS failure, aborted request).
export function networkMessage(): string {
  return LOGIN_MESSAGES.network;
}

// ---------------------------------------------------------------------------
// Password reset & invitation flows (same safety guarantees as login).
// The server already returns enumeration-safe generic responses; these keep the
// client copy plain-language and never reveal whether an email/invitation
// exists or leak technical/API detail.
// ---------------------------------------------------------------------------

export const RESET_MESSAGES = {
  // Shown for BOTH success and failure of a reset request, so we never reveal
  // whether the email is registered.
  requestAcknowledged:
    "If your email is registered, we’ve sent password-reset instructions. Please check your inbox and spam folder.",
  resetSuccess: "Your password has been reset. You can now sign in.",
  resetInvalid:
    "This reset link is invalid or has expired. Please request a new one.",
  network: LOGIN_MESSAGES.network,
  rateLimited: LOGIN_MESSAGES.rateLimited,
  unavailable: LOGIN_MESSAGES.unavailable,
  emailRequired: LOGIN_MESSAGES.emailRequired,
  emailInvalid: LOGIN_MESSAGES.emailInvalid,
  passwordRequired: LOGIN_MESSAGES.passwordRequired,
  passwordTooShort: "Please choose a password with at least 12 characters.",
} as const;

export const INVITATION_MESSAGES = {
  acceptSuccess: "Invitation accepted. You can now sign in.",
  acceptInvalid:
    "This invitation link is invalid or has expired. Please contact your administrator.",
  network: LOGIN_MESSAGES.network,
  rateLimited: LOGIN_MESSAGES.rateLimited,
  unavailable: LOGIN_MESSAGES.unavailable,
  emailRequired: LOGIN_MESSAGES.emailRequired,
  emailInvalid: LOGIN_MESSAGES.emailInvalid,
  passwordRequired: LOGIN_MESSAGES.passwordRequired,
  passwordTooShort: RESET_MESSAGES.passwordTooShort,
} as const;

// Minimum length mirrors the server password policy (12+).
export function passwordPolicyError(password: string): string | undefined {
  if (!password) return LOGIN_MESSAGES.passwordRequired;
  if (password.length < 12) return RESET_MESSAGES.passwordTooShort;
  return undefined;
}

export function messageForResetStatus(status: number): string {
  if (status === 429) return RESET_MESSAGES.rateLimited;
  if (status === 503 || status >= 500) return RESET_MESSAGES.unavailable;
  // 400/403/404/410/422 all collapse to a single safe "invalid or expired".
  return RESET_MESSAGES.resetInvalid;
}

export function messageForInvitationStatus(status: number): string {
  if (status === 429) return INVITATION_MESSAGES.rateLimited;
  if (status === 503 || status >= 500) return INVITATION_MESSAGES.unavailable;
  return INVITATION_MESSAGES.acceptInvalid;
}
