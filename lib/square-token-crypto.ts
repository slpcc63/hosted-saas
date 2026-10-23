import {
  createCipheriv,
  createDecipheriv,
  randomBytes
} from "node:crypto";

const algorithm = "aes-256-gcm";
const envelopePrefix = "sqtoken:v1";
const keyByteLength = 32;
const nonceByteLength = 12;
const tagByteLength = 16;

export class SquareTokenEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SquareTokenEncryptionError";
  }
}

function getEncryptionKey(encodedKey = process.env.SQUARE_TOKEN_ENCRYPTION_KEY) {
  if (!encodedKey?.trim()) {
    throw new SquareTokenEncryptionError("Square token encryption key is not configured.");
  }

  const normalized = encodedKey.trim();

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new SquareTokenEncryptionError("Square token encryption key is invalid.");
  }

  const key = Buffer.from(normalized, "base64");

  if (key.length !== keyByteLength || key.toString("base64") !== normalized) {
    throw new SquareTokenEncryptionError("Square token encryption key is invalid.");
  }

  return key;
}

function getAssociatedData(customerId: string, tokenKind: "access" | "refresh") {
  return Buffer.from(`square-connection:${customerId}:${tokenKind}:v1`, "utf8");
}

export function isEncryptedSquareToken(value: string) {
  return value.startsWith(`${envelopePrefix}:`);
}

export function encryptSquareToken(input: {
  customerId: string;
  encodedKey?: string;
  token: string;
  tokenKind: "access" | "refresh";
}) {
  const key = getEncryptionKey(input.encodedKey);
  const nonce = randomBytes(nonceByteLength);
  const cipher = createCipheriv(algorithm, key, nonce);
  cipher.setAAD(getAssociatedData(input.customerId, input.tokenKind));
  const ciphertext = Buffer.concat([
    cipher.update(input.token, "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return [
    envelopePrefix,
    nonce.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url")
  ].join(":");
}

export function decryptSquareToken(input: {
  customerId: string;
  encodedKey?: string;
  storedToken: string;
  tokenKind: "access" | "refresh";
}) {
  if (!isEncryptedSquareToken(input.storedToken)) {
    if (input.storedToken.startsWith("sqtoken:")) {
      throw new SquareTokenEncryptionError("Square token ciphertext version is unsupported.");
    }

    return { token: input.storedToken, needsRewrite: true } as const;
  }

  const parts = input.storedToken.split(":");

  if (parts.length !== 5 || `${parts[0]}:${parts[1]}` !== envelopePrefix) {
    throw new SquareTokenEncryptionError("Square token ciphertext is invalid.");
  }

  try {
    const key = getEncryptionKey(input.encodedKey);
    const nonce = Buffer.from(parts[2], "base64url");
    const ciphertext = Buffer.from(parts[3], "base64url");
    const tag = Buffer.from(parts[4], "base64url");

    if (nonce.length !== nonceByteLength || tag.length !== tagByteLength || !ciphertext.length) {
      throw new Error("Invalid encrypted token envelope");
    }

    const decipher = createDecipheriv(algorithm, key, nonce);
    decipher.setAAD(getAssociatedData(input.customerId, input.tokenKind));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]).toString("utf8");

    return { token: plaintext, needsRewrite: false } as const;
  } catch (error) {
    if (error instanceof SquareTokenEncryptionError) {
      throw error;
    }

    throw new SquareTokenEncryptionError("Square token ciphertext is invalid.");
  }
}

export function encryptSquareConnectionTokens(input: {
  accessToken: string;
  customerId: string;
  encodedKey?: string;
  refreshToken: string;
}) {
  return {
    accessToken: encryptSquareToken({
      customerId: input.customerId,
      encodedKey: input.encodedKey,
      token: input.accessToken,
      tokenKind: "access"
    }),
    refreshToken: encryptSquareToken({
      customerId: input.customerId,
      encodedKey: input.encodedKey,
      token: input.refreshToken,
      tokenKind: "refresh"
    })
  };
}
