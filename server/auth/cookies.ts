export const SESSION_COOKIE = "__Host-hig_session";
export const CSRF_COOKIE = "__Host-hig_csrf";
export const SESSION_IDLE_MS = 30 * 60_000;
export const SESSION_ABSOLUTE_MS = 12 * 60 * 60_000;

export function sessionCookie(token: string, maxAgeSeconds = SESSION_ABSOLUTE_MS / 1000): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}
export function deleteSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
export function csrfCookie(token:string,maxAgeSeconds=SESSION_ABSOLUTE_MS/1000):string{return `${CSRF_COOKIE}=${token}; Path=/; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;}
export function deleteCsrfCookie():string{return `${CSRF_COOKIE}=; Path=/; Secure; SameSite=Lax; Max-Age=0`;}
export function sessionTokenFromRequest(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === SESSION_COOKIE) return value.join("=") || null;
  }
  return null;
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host") ?? new URL(request.url).host;
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",").at(-1)?.trim();
  const protocol = forwardedProtocol || new URL(request.url).protocol.replace(":", "");
  if (!origin || !["http", "https"].includes(protocol)) throw new Error("Cross-origin request rejected");
  if (new URL(origin).origin !== `${protocol}://${host}`) throw new Error("Cross-origin request rejected");
}

export function noStoreHeaders(extra: Record<string, string> = {}): HeadersInit {
  return { "cache-control": "no-store, max-age=0", pragma: "no-cache", ...extra };
}
