import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import type { GatewaySettings } from "../configuration/validation.ts";

const VERSION = "v1";
const STORAGE = "aes-256-gcm-v1";
const DOMAIN = "hig-school:payment-gateway:v1";
const MASK = "••••••••";

type UnknownRecord = Record<string, unknown>;

export type PersistedGatewaySettings = Omit<
  GatewaySettings,
  "credentials"
> & {
  credentialStorage: typeof STORAGE;
  credentialKeys: string[];
  credentialsCiphertext: string;
};

function encryptionKey(): Buffer {
  const secret = process.env.HIG_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error("Payment gateway encryption is not configured");
  }

  return createHash("sha256")
    .update(DOMAIN, "utf8")
    .update("\0", "utf8")
    .update(secret, "utf8")
    .digest();
}

function associatedData(tenantId: string): Buffer {
  return Buffer.from(`${DOMAIN}:${tenantId}`, "utf8");
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as UnknownRecord)
      .filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === "string",
      )
      .map(([key, entry]) => [key, entry]),
  );
}

function orderedCredentials(
  credentials: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(credentials).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

export function encryptPaymentGatewayCredentials(
  tenantId: string,
  credentials: Record<string, string>,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(associatedData(tenantId));

  const encrypted = Buffer.concat([
    cipher.update(
      JSON.stringify(orderedCredentials(credentials)),
      "utf8",
    ),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptPaymentGatewayCredentials(
  tenantId: string,
  ciphertext: string,
): Record<string, string> {
  try {
    const [version, ivValue, tagValue, payloadValue] =
      ciphertext.split(".");

    if (
      version !== VERSION ||
      !ivValue ||
      !tagValue ||
      payloadValue === undefined
    ) {
      throw new Error("invalid envelope");
    }

    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(ivValue, "base64url"),
    );

    decipher.setAAD(associatedData(tenantId));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payloadValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");

    return stringRecord(JSON.parse(decrypted));
  } catch {
    throw new Error("Payment gateway credential ciphertext is invalid");
  }
}

export function readGatewayCredentials(
  tenantId: string,
  value: unknown,
): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as UnknownRecord;

  if (
    record.credentialStorage === STORAGE &&
    typeof record.credentialsCiphertext === "string"
  ) {
    return decryptPaymentGatewayCredentials(
      tenantId,
      record.credentialsCiphertext,
    );
  }

  // Legacy plaintext is read only so an existing installation can be
  // upgraded safely. The next gateway save rewrites it encrypted.
  return stringRecord(record.credentials);
}

export function gatewaySettingsPayload(
  tenantId: string,
  settings: GatewaySettings,
): PersistedGatewaySettings {
  const { credentials, ...rest } = settings;

  return {
    ...rest,
    credentialStorage: STORAGE,
    credentialKeys: Object.keys(credentials).sort(),
    credentialsCiphertext: encryptPaymentGatewayCredentials(
      tenantId,
      credentials,
    ),
  };
}

export function mergeGatewayCredentialEdits(
  incoming: Record<string, string>,
  previous: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(incoming).map(([key, value]) => [
      key,
      value === MASK ? previous[key] ?? "" : value,
    ]),
  );
}

export function maskGatewayCredentials(
  credentials: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(credentials).map(([key, value]) => [
      key,
      /secret|password|passkey|salt|token|encryption|private/i.test(key) &&
      value
        ? MASK
        : value,
    ]),
  );
}

export function hasLegacyPlaintextGatewayCredentials(
  value: unknown,
): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as UnknownRecord;
  return (
    record.credentialStorage !== STORAGE &&
    Object.keys(stringRecord(record.credentials)).length > 0
  );
}
