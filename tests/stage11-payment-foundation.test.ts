import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  decryptPaymentGatewayCredentials,
  encryptPaymentGatewayCredentials,
  gatewaySettingsPayload,
} from "../server/payments/credentials.ts";
import {
  paymentGatewayProviderById,
  paymentGatewayProviders,
} from "../server/payments/providers.ts";
import {
  gatewaySettingsSchema,
} from "../server/configuration/validation.ts";

process.env.HIG_ENCRYPTION_KEY ??=
  "stage11-test-encryption-key-32-bytes-minimum";

const tenantId = "11111111-1111-4111-8111-111111111111";

test("payment credentials encrypt at rest and round-trip", () => {
  const credentials = {
    sandbox_key_id: "rzp_test_key",
    sandbox_key_secret: "stage11-super-secret",
    webhook_secret: "stage11-webhook-secret",
  };

  const ciphertext = encryptPaymentGatewayCredentials(
    tenantId,
    credentials,
  );

  assert.ok(ciphertext.startsWith("v1."));
  assert.equal(ciphertext.includes("stage11-super-secret"), false);
  assert.deepEqual(
    decryptPaymentGatewayCredentials(tenantId, ciphertext),
    credentials,
  );
});

test("credential ciphertext is tenant bound", () => {
  const ciphertext = encryptPaymentGatewayCredentials(
    tenantId,
    { webhook_secret: "secret" },
  );

  assert.throws(
    () =>
      decryptPaymentGatewayCredentials(
        "22222222-2222-4222-8222-222222222222",
        ciphertext,
      ),
    /ciphertext is invalid/,
  );
});

test("persisted gateway payload contains no plaintext credentials", () => {
  const persisted = gatewaySettingsPayload(tenantId, {
    enabled: true,
    gatewayId: "3",
    paymentMode: "sandbox",
    credentials: {
      sandbox_key_id: "rzp_test_public",
      sandbox_key_secret: "never-store-this-plain",
      webhook_secret: "webhook-plain-secret",
    },
    surchargeEnabled: false,
    surchargeType: "percentage",
    surchargeValue: 0,
    surchargeLabel: "Online payment surcharge",
  });

  const serialized = JSON.stringify(persisted);

  assert.equal(serialized.includes("never-store-this-plain"), false);
  assert.equal(serialized.includes("webhook-plain-secret"), false);
  assert.equal("credentials" in persisted, false);
  assert.equal(
    persisted.credentialStorage,
    "aes-256-gcm-v1",
  );
});

test("provider registry exposes Razorpay plus manual India methods only", () => {
  assert.deepEqual(
    paymentGatewayProviders.map((provider) => provider.gatewayId),
    ["", "3", "7", "12"],
  );

  assert.equal(
    paymentGatewayProviderById("3")?.key,
    "razorpay",
  );
  assert.equal(paymentGatewayProviderById("5"), null);
});

test("configuration rejects placeholder gateways not implemented", () => {
  assert.equal(
    gatewaySettingsSchema.safeParse({
      enabled: true,
      gatewayId: "5",
      paymentMode: "sandbox",
      credentials: {},
      surchargeEnabled: false,
      surchargeType: "percentage",
      surchargeValue: 0,
      surchargeLabel: "Fee",
    }).success,
    false,
  );
});

test("payment migration creates tenant-isolated order attempt and webhook tables", () => {
  const migration = readFileSync(
    "drizzle-postgres/0014_payment_foundation.sql",
    "utf8",
  );

  for (const table of [
    "payment_orders",
    "payment_attempts",
    "payment_webhook_events",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`,
      ),
    );
  }

  assert.match(
    migration,
    /payment_webhook_events_provider_event_uq/,
  );
  assert.match(
    migration,
    /payload_sha256/,
  );
  assert.doesNotMatch(
    migration,
    /raw_payload|payload_json|webhook_body/,
  );
});

test("payment UI no longer advertises unimplemented online gateways", () => {
  const page = readFileSync("app/school/page.tsx", "utf8");

  assert.match(page, /Razorpay — India/);
  assert.match(page, /UPI QR — India/);
  assert.match(page, /Bank Transfer — India/);
  assert.doesNotMatch(page, /Stripe — Global/);
  assert.doesNotMatch(page, /PhonePe — India/);
  assert.doesNotMatch(page, /chatgpt\.site/);
});
