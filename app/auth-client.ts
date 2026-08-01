const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function csrfToken(): string {
  if (typeof document === "undefined") return "";
  const pair = document.cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith("__Host-hig_csrf="));
  return pair?.split("=").slice(1).join("=") ?? "";
}

export function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const headers = new Headers(init.headers);
  if (!SAFE_METHODS.has(method)) {
    const token = csrfToken();
    if (token) headers.set("x-csrf-token", token);
  }
  return fetch(input, { ...init, headers, credentials: "same-origin" });
}
