import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

type MobileEndpoint = {
  id: string;
  file: string;
  method: string;
  authentication: string;
  rateLimited: boolean;
  createsCookies: boolean;
  acceptsTenantOverride?: boolean;
  acceptsAudienceOverride?: boolean;
  idempotency: string;
};

type MobileTable = {
  name: string;
  tenantScoped: boolean;
  forceRls: boolean;
  authenticationServicePolicyRequired: boolean;
};

type MobileContract = {
  version: number;
  scope: string;
  webAuthentication: {
    unchanged: boolean;
    actorTypes: string[];
    sessionTransport: string;
    unsafeRequestProtection: string[];
  };
  mobileAuthentication: {
    separateFromWebSessions: boolean;
    sessionTransport: string;
    accessTokenTtlSeconds: number;
    refreshTokenTtlSeconds: number;
    tokenEntropyBytes: number;
    tokenStorage: string;
    refreshRotation: string;
    refreshReplayAction: string;
    credentialVersionRequired: boolean;
    rawTokensMayBeLogged: boolean;
  };
  principalTypes: string[];
  authorizationOrder: Record<string, string[]>;
  endpoints: MobileEndpoint[];
  tables: MobileTable[];
  securityEvents: string[];
  deferred: string[];
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

const contract = readJson<MobileContract>(
  "tests/contracts/mobile-auth.contract.json",
);

const design = readFileSync(
  "docs/STAGE_9_MOBILE_APPLICATIONS.md",
  "utf8",
);

test("Stage 9 mobile contract keeps browser and mobile sessions separate", () => {
  assert.equal(contract.version, 1);
  assert.equal(contract.webAuthentication.unchanged, true);
  assert.deepEqual(
    contract.webAuthentication.actorTypes,
    ["platform", "school"],
  );
  assert.equal(
    contract.webAuthentication.sessionTransport,
    "secure_cookie",
  );
  assert.deepEqual(
    contract.webAuthentication.unsafeRequestProtection,
    ["same_origin", "csrf"],
  );

  assert.equal(
    contract.mobileAuthentication.separateFromWebSessions,
    true,
  );
  assert.equal(
    contract.mobileAuthentication.sessionTransport,
    "opaque_bearer_tokens",
  );
});

test("Stage 9 mobile token policy is explicit and fail-closed", () => {
  assert.equal(
    contract.mobileAuthentication.accessTokenTtlSeconds,
    15 * 60,
  );
  assert.equal(
    contract.mobileAuthentication.refreshTokenTtlSeconds,
    30 * 24 * 60 * 60,
  );
  assert.equal(contract.mobileAuthentication.tokenEntropyBytes, 32);
  assert.equal(
    contract.mobileAuthentication.tokenStorage,
    "sha256_hash_only",
  );
  assert.equal(
    contract.mobileAuthentication.refreshRotation,
    "every_successful_use",
  );
  assert.equal(
    contract.mobileAuthentication.refreshReplayAction,
    "revoke_token_family",
  );
  assert.equal(
    contract.mobileAuthentication.credentialVersionRequired,
    true,
  );
  assert.equal(
    contract.mobileAuthentication.rawTokensMayBeLogged,
    false,
  );
});

test("Stage 9 supports only the approved mobile principals", () => {
  assert.deepEqual(
    contract.principalTypes,
    ["school", "parent", "student", "transporter"],
  );

  assert.equal(
    new Set(contract.principalTypes).size,
    contract.principalTypes.length,
  );
});

test("mobile authorization preserves tenant, entitlement, permission, and assignment boundaries", () => {
  assert.deepEqual(
    contract.authorizationOrder.school,
    [
      "authenticated_mobile_session",
      "client_identity_type",
      "active_school_membership",
      "exact_tenant_match",
      "company_module_entitlement",
      "school_role_permission",
      "resource_assignment",
    ],
  );

  for (const persona of ["parent", "student", "transporter"]) {
    assert.deepEqual(
      contract.authorizationOrder[persona],
      [
        "authenticated_mobile_session",
        "client_identity_type",
        "active_mobile_relationship",
        "exact_tenant_match",
        "company_app_feature",
        "required_school_module",
        "resource_assignment",
      ],
    );
  }
});

test("Batch 1 exposes only the five approved foundation endpoints", () => {
  const expected = [
    ["mobile.auth.login", "app/api/v1/mobile/auth/login/route.ts", "POST"],
    ["mobile.auth.refresh", "app/api/v1/mobile/auth/refresh/route.ts", "POST"],
    ["mobile.auth.logout", "app/api/v1/mobile/auth/logout/route.ts", "POST"],
    ["mobile.session.view", "app/api/v1/mobile/session/route.ts", "GET"],
    ["mobile.access.view", "app/api/v1/mobile/access/route.ts", "GET"],
  ];

  assert.deepEqual(
    contract.endpoints.map(({ id, file, method }) => [id, file, method]),
    expected,
  );

  assert.equal(
    new Set(contract.endpoints.map(({ id }) => id)).size,
    contract.endpoints.length,
  );

  for (const endpoint of contract.endpoints) {
    assert.match(endpoint.file, /^app\/api\/v1\/mobile\//);
    assert.doesNotMatch(endpoint.file, /\/demo\//);
    assert.equal(endpoint.createsCookies, false);
  }
});

test("mobile access cannot accept arbitrary tenant or audience overrides", () => {
  const endpoint = contract.endpoints.find(
    ({ id }) => id === "mobile.access.view",
  );

  assert.ok(endpoint);
  assert.equal(endpoint.acceptsTenantOverride, false);
  assert.equal(endpoint.acceptsAudienceOverride, false);
});

test("all mobile foundation tables require tenant isolation and forced RLS", () => {
  assert.deepEqual(
    contract.tables.map(({ name }) => name),
    [
      "mobile_identities",
      "mobile_identity_assignments",
      "mobile_sessions",
      "mobile_refresh_token_uses",
    ],
  );

  for (const table of contract.tables) {
    assert.equal(table.tenantScoped, true);
    assert.equal(table.forceRls, true);
    assert.equal(
      table.authenticationServicePolicyRequired,
      true,
    );
  }
});

test("mobile authentication audit events exclude raw credentials and tokens", () => {
  assert.deepEqual(
    contract.securityEvents,
    [
      "mobile.auth.login.success",
      "mobile.auth.login.failure",
      "mobile.auth.refresh.success",
      "mobile.auth.refresh.failure",
      "mobile.auth.refresh.replay",
      "mobile.auth.logout",
      "mobile.auth.session.revoked",
    ],
  );

  for (const event of contract.securityEvents) {
    assert.doesNotMatch(event, /password|raw_token|refresh_token|access_token/);
  }
});

test("the Stage 9 design document and machine-readable contract agree", () => {
  assert.match(
    design,
    /Mobile authentication uses dedicated opaque bearer tokens\./,
  );
  assert.match(design, /Access token lifetime: 15 minutes\./);
  assert.match(design, /Refresh token lifetime: 30 days\./);
  assert.match(
    design,
    /A replayed refresh token revokes every active session in the refresh family\./,
  );
  assert.match(
    design,
    /The endpoint does not accept an arbitrary school or audience override\./,
  );
  assert.match(
    design,
    /PostgreSQL is the staging and production source of truth\./,
  );
});

test("existing web actor types remain isolated from the mobile actor model", () => {
  const webTypes = readFileSync("server/auth/types.ts", "utf8");

  assert.match(
    webTypes,
    /identityType:\s*"platform"\s*\|\s*"school"/,
  );
  assert.doesNotMatch(
    webTypes,
    /identityType:[^\n]*(parent|student|transporter)/,
  );
});

test("the established security contract retains its approved authorization order", () => {
  const webContract = readJson<{
    authorizationOrder: string[];
  }>("tests/contracts/api-security.contract.json");

  assert.deepEqual(
    webContract.authorizationOrder,
    [
      "authenticated_identity",
      "client_identity_type",
      "tenant_membership",
      "company_module_entitlement",
      "school_role_permission",
      "resource_assignment",
    ],
  );
});

test("native mobile and operational work remain explicitly deferred", () => {
  for (const deferredItem of [
    "operational_mobile_data_apis",
    "flutter_secure_storage",
    "flutter_api_integration",
    "android_ios_runners",
    "staging_migration",
    "staging_deployment",
  ]) {
    assert.ok(
      contract.deferred.includes(deferredItem),
      `${deferredItem} must remain deferred in Batch 1`,
    );
  }
});
