import { createCipheriv, createDecipheriv, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnv } from "@/lib/env";
import { resolveDbConfig } from "@/lib/db";

const ALGO = "aes-256-gcm";
const KEY_LEN = 32;
const IV_LEN = 12;
const VERSION = "ck1";

let _key: Buffer | null = null;

export function getMasterKey(): Buffer {
  if (_key) return _key;
  const env = loadEnv();
  const fromEnv = env.COMMOS_MASTER_KEY;
  if (fromEnv) {
    _key = createHash("sha256").update(fromEnv).digest();
    return _key;
  }
  const { dataDir } = resolveDbConfig();
  mkdirSync(dataDir, { recursive: true });
  const keyFile = join(dataDir, "secrets.key");
  if (existsSync(keyFile)) {
    _key = Buffer.from(readFileSync(keyFile, "utf-8").trim(), "hex");
  } else {
    const buf = randomBytes(KEY_LEN);
    writeFileSync(keyFile, buf.toString("hex"), { mode: 0o600 });
    _key = buf;
  }
  return _key;
}

/** Encrypt a secret to a self-describing string. Never returns plaintext. */
export function encryptSecret(plaintext: string): string {
  const key = getMasterKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}.${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

export function decryptSecret(blob: string): string {
  const parts = blob.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Unsupported secret blob format");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const key = getMasterKey();
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf-8");
}

export function isEncryptedSecret(v: unknown): boolean {
  return typeof v === "string" && v.startsWith(`${VERSION}.`);
}

/** Encrypt an object's values whose keys are marked secret. Caller supplies
 * the secret field key list; the returned map only ever contains ciphertext. */
export function encryptSecretFields(
  secrets: Record<string, unknown>,
  fieldKeys: string[]
): string {
  const payload = { ...secrets };
  return encryptSecret(JSON.stringify(payload));
}

export function decryptSecretFields(blob: string | null | undefined): Record<string, unknown> {
  if (!blob) return {};
  try {
    return JSON.parse(decryptSecret(blob)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function constantTimeEq(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}