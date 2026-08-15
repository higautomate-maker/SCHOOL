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
