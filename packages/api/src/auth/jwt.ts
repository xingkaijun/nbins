import type { Discipline, Role } from "@nbins/shared";
import type { Bindings } from "../env.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const DEFAULT_TEST_JWT_SECRET = "nbins-dev-jwt-secret";
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 8;

export interface JwtUserClaims {
  id: string;
  role: Role;
  disciplines: Discipline[];
}

interface JwtPayload extends JwtUserClaims {
  exp: number;
  iat: number;
  sub: string;
}

export function getJwtSecret(
  env: Pick<Bindings, "APP_ENV" | "JWT_SECRET"> | undefined
): string {
  if (env?.JWT_SECRET && env.JWT_SECRET.trim().length > 0) {
    return env.JWT_SECRET;
  }

  if (env?.APP_ENV === "production") {
    throw new Error("JWT_SECRET is required when APP_ENV=production");
  }

  return DEFAULT_TEST_JWT_SECRET;
}

export async function issueAccessToken(
  claims: JwtUserClaims,
  env: Pick<Bindings, "APP_ENV" | "JWT_SECRET">,
  options?: { now?: Date; ttlSeconds?: number }
): Promise<string> {
  const nowSeconds = Math.floor((options?.now?.getTime() ?? Date.now()) / 1000);
  const payload: JwtPayload = {
    sub: claims.id,
    id: claims.id,
    role: claims.role,
    disciplines: [...claims.disciplines],
    iat: nowSeconds,
    exp: nowSeconds + (options?.ttlSeconds ?? ACCESS_TOKEN_TTL_SECONDS)
  };

  return signJwt(payload, getJwtSecret(env));
}

export async function verifyAccessToken(
  token: string,
  env: Pick<Bindings, "APP_ENV" | "JWT_SECRET">,
  options?: { now?: Date }
): Promise<JwtUserClaims | null> {
  let payload: JwtPayload;

  try {
    payload = await verifyJwt<JwtPayload>(token, getJwtSecret(env));
  } catch {
    return null;
  }

  const nowSeconds = Math.floor((options?.now?.getTime() ?? Date.now()) / 1000);

  if (payload.exp <= nowSeconds) {
    return null;
  }

  if (
    typeof payload.id !== "string" ||
    typeof payload.role !== "string" ||
    !Array.isArray(payload.disciplines)
  ) {
    return null;
  }

  return {
    id: payload.id,
    role: payload.role,
    disciplines: payload.disciplines
  };
}

async function signJwt(payload: JwtPayload, secret: string): Promise<string> {
  const encodedHeader = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await signHmacSha256(signingInput, secret);
  return `${signingInput}.${signature}`;
}

async function verifyJwt<T>(token: string, secret: string): Promise<T> {
  const parts = token.split(".");

  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = await signHmacSha256(signingInput, secret);

  if (!timingSafeEqual(encodedSignature, expectedSignature)) {
    throw new Error("Invalid JWT signature");
  }

  const header = JSON.parse(decodeBase64Url(encodedHeader));

  if (header.alg !== "HS256" || header.typ !== "JWT") {
    throw new Error("Unsupported JWT header");
  }

  return JSON.parse(decodeBase64Url(encodedPayload)) as T;
}

async function signHmacSha256(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return encodeBytesBase64Url(new Uint8Array(signature));
}

function encodeBase64Url(value: string): string {
  return encodeBytesBase64Url(encoder.encode(value));
}

function encodeBytesBase64Url(value: Uint8Array): string {
  return bytesToBase64(value)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return decoder.decode(base64ToBytes(padded));
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);

  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  let mismatch = 0;

  for (let index = 0; index < leftBytes.length; index += 1) {
    mismatch |= leftBytes[index] ^ rightBytes[index];
  }

  return mismatch === 0;
}

function bytesToBase64(value: Uint8Array): string {
  let binary = "";

  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
