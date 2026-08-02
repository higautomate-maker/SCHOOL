import {
  constantEqual,
  randomToken,
  sha256,
} from "../auth/crypto.ts";
import {
  MOBILE_ACCESS_TOKEN_TTL_MS,
  MOBILE_REFRESH_TOKEN_TTL_MS,
  type MobileTokenSet,
} from "./types.ts";

const opaqueTokenPattern = /^[A-Za-z0-9_-]{43}$/;

export function isWellFormedMobileToken(
  value: unknown,
): value is string {
  return typeof value === "string"
    && opaqueTokenPattern.test(value);
}

export function hashMobileToken(token: string): string {
  return sha256(token);
}

export function mobileTokenMatches(
  rawToken: string,
  expectedHash: string,
): boolean {
  if (
    !isWellFormedMobileToken(rawToken)
    || !/^[a-f0-9]{64}$/.test(expectedHash)
  ) {
    return false;
  }

  return constantEqual(
    hashMobileToken(rawToken),
    expectedHash,
  );
}

export function issueMobileTokenSet(
  issuedAt = new Date(),
): MobileTokenSet {
  const accessToken = randomToken();
  const refreshToken = randomToken();

  if (accessToken === refreshToken) {
    throw new Error("Mobile token generation collision");
  }

  return {
    accessToken,
    accessTokenHash: hashMobileToken(accessToken),
    refreshToken,
    refreshTokenHash: hashMobileToken(refreshToken),
    accessExpiresAt: new Date(
      issuedAt.getTime() + MOBILE_ACCESS_TOKEN_TTL_MS,
    ).toISOString(),
    refreshExpiresAt: new Date(
      issuedAt.getTime() + MOBILE_REFRESH_TOKEN_TTL_MS,
    ).toISOString(),
  };
}

export function mobileBearerTokenFromRequest(
  request: Request,
): string | null {
  const authorization =
    request.headers.get("authorization") ?? "";

  const match = authorization.match(
    /^Bearer ([A-Za-z0-9_-]{43})$/i,
  );

  return match?.[1] ?? null;
}
