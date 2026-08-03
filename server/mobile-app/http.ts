import { mobileJson } from "../mobile-auth/http.ts";

/** Convert known validation/authorization outcomes into stable client errors
 * without exposing database, SQL, filesystem, or provider details. */
export function mobileAppErrorResponse(
  error: unknown,
  fallback: string,
): Response {
  const message = error instanceof Error ? error.message : "";
  if (/not found/i.test(message)) {
    return mobileJson({ error: "Resource not found" }, 404);
  }
  if (/required|invalid|unknown|reserved|idempotency/i.test(message)) {
    return mobileJson({ error: "Invalid request" }, 400);
  }
  if (/denied|identity|assignment|access|relationship/i.test(message)) {
    return mobileJson({ error: "Request rejected" }, 403);
  }
  return mobileJson({ error: fallback }, 503);
}
