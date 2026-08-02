import assert from "node:assert/strict";
import test from "node:test";
import {
  mobileAudienceForPrincipal,
  isMobileAudience,
  isMobilePrincipalType,
  MOBILE_ACCESS_TOKEN_TTL_MS,
  MOBILE_REFRESH_TOKEN_TTL_MS,
} from "../server/mobile-auth/types.ts";
import {
  hashMobileToken,
  isWellFormedMobileToken,
  issueMobileTokenSet,
  mobileBearerTokenFromRequest,
  mobileTokenMatches,
} from "../server/mobile-auth/tokens.ts";

test("mobile token lifetimes match the approved Stage 9 contract", () => {
  assert.equal(
    MOBILE_ACCESS_TOKEN_TTL_MS,
    15 * 60 * 1_000,
  );

  assert.equal(
    MOBILE_REFRESH_TOKEN_TTL_MS,
    30 * 24 * 60 * 60 * 1_000,
  );
});

test("mobile tokens use independent 256-bit opaque values and hashes", () => {
  const issuedAt = new Date("2026-08-02T09:30:00.000Z");
  const tokenSet = issueMobileTokenSet(issuedAt);

  assert.notEqual(
    tokenSet.accessToken,
    tokenSet.refreshToken,
  );

  assert.equal(tokenSet.accessToken.length, 43);
  assert.equal(tokenSet.refreshToken.length, 43);

  assert.match(
    tokenSet.accessToken,
    /^[A-Za-z0-9_-]{43}$/,
  );

  assert.match(
    tokenSet.refreshToken,
    /^[A-Za-z0-9_-]{43}$/,
  );

  assert.match(
    tokenSet.accessTokenHash,
    /^[a-f0-9]{64}$/,
  );

  assert.match(
    tokenSet.refreshTokenHash,
    /^[a-f0-9]{64}$/,
  );

  assert.notEqual(
    tokenSet.accessToken,
    tokenSet.accessTokenHash,
  );

  assert.equal(
    Date.parse(tokenSet.accessExpiresAt),
    issuedAt.getTime() + MOBILE_ACCESS_TOKEN_TTL_MS,
  );

  assert.equal(
    Date.parse(tokenSet.refreshExpiresAt),
    issuedAt.getTime() + MOBILE_REFRESH_TOKEN_TTL_MS,
  );
});

test("mobile token comparison accepts only valid opaque tokens", () => {
  const tokenSet = issueMobileTokenSet();

  assert.equal(
    mobileTokenMatches(
      tokenSet.accessToken,
      tokenSet.accessTokenHash,
    ),
    true,
  );

  assert.equal(
    mobileTokenMatches(
      tokenSet.refreshToken,
      tokenSet.accessTokenHash,
    ),
    false,
  );

  assert.equal(
    mobileTokenMatches(
      "not-a-valid-token",
      tokenSet.accessTokenHash,
    ),
    false,
  );

  assert.equal(
    mobileTokenMatches(
      tokenSet.accessToken,
      "not-a-valid-hash",
    ),
    false,
  );

  assert.equal(
    hashMobileToken(tokenSet.accessToken),
    tokenSet.accessTokenHash,
  );
});

test("mobile bearer parsing is strict and cookie-independent", () => {
  const tokenSet = issueMobileTokenSet();

  const accepted = new Request(
    "https://mobile.test/api/v1/mobile/session",
    {
      headers: {
        authorization: `Bearer ${tokenSet.accessToken}`,
        cookie: "hig_session=browser-cookie",
      },
    },
  );

  assert.equal(
    mobileBearerTokenFromRequest(accepted),
    tokenSet.accessToken,
  );

  const lowerCaseScheme = new Request(
    "https://mobile.test/api/v1/mobile/session",
    {
      headers: {
        authorization: `bearer ${tokenSet.accessToken}`,
      },
    },
  );

  assert.equal(
    mobileBearerTokenFromRequest(lowerCaseScheme),
    tokenSet.accessToken,
  );

  for (const authorization of [
    "",
    `Basic ${tokenSet.accessToken}`,
    `Bearer  ${tokenSet.accessToken}`,
    `Bearer ${tokenSet.accessToken} extra`,
    "Bearer not-a-token",
  ]) {
    const request = new Request(
      "https://mobile.test/api/v1/mobile/session",
      { headers: { authorization } },
    );

    assert.equal(
      mobileBearerTokenFromRequest(request),
      null,
    );
  }
});

test("approved mobile principal and audience guards fail closed", () => {
  for (const principal of [
    "school",
    "parent",
    "student",
    "transporter",
  ]) {
    assert.equal(
      isMobilePrincipalType(principal),
      true,
    );
  }

  for (const audience of [
    "parent",
    "student",
    "transporter",
  ]) {
    assert.equal(
      isMobileAudience(audience),
      true,
    );
  }

  for (const rejected of [
    "platform",
    "admin",
    "driver",
    "",
    null,
    undefined,
  ]) {
    assert.equal(
      isMobilePrincipalType(rejected),
      false,
    );

    assert.equal(
      isMobileAudience(rejected),
      false,
    );
  }

  assert.equal(
    mobileAudienceForPrincipal("school"),
    null,
  );

  assert.equal(
    mobileAudienceForPrincipal("parent"),
    "parent",
  );
});

test("well-formed token validation rejects malformed values", () => {
  const tokenSet = issueMobileTokenSet();

  assert.equal(
    isWellFormedMobileToken(tokenSet.accessToken),
    true,
  );

  assert.equal(isWellFormedMobileToken(""), false);
  assert.equal(isWellFormedMobileToken("a".repeat(42)), false);
  assert.equal(isWellFormedMobileToken("a".repeat(44)), false);
  assert.equal(isWellFormedMobileToken("!".repeat(43)), false);
  assert.equal(isWellFormedMobileToken(null), false);
});
