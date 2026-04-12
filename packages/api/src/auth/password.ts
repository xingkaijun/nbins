const PBKDF2_ALGORITHM = "pbkdf2_sha256";
const PBKDF2_HASH_BYTES = 32;

export async function createPasswordHash(
  password: string,
  options?: { iterations?: number; saltHex?: string }
): Promise<string> {
  const iterations = options?.iterations ?? 90000;
  const saltHex = options?.saltHex ?? createSaltHex(16);
  const derivedKeyHex = await derivePbkdf2Sha256(password, saltHex, iterations);

  return `${PBKDF2_ALGORITHM}$${iterations}$${saltHex}$${derivedKeyHex}`;
}

export async function verifyPasswordHash(
  password: string,
  storedHash: string
): Promise<boolean> {
  const parsedHash = parsePasswordHash(storedHash);

  if (!parsedHash) {
    return false;
  }

  const candidateHash = await derivePbkdf2Sha256(
    password,
    parsedHash.saltHex,
    parsedHash.iterations
  );

  return timingSafeEqualHex(candidateHash, parsedHash.derivedKeyHex);
}

function parsePasswordHash(
  value: string
): { iterations: number; saltHex: string; derivedKeyHex: string } | null {
  const [algorithm, iterationsText, saltHex, derivedKeyHex] = value.split("$");

  if (algorithm !== PBKDF2_ALGORITHM) {
    return null;
  }

  const iterations = Number.parseInt(iterationsText ?? "", 10);

  if (!Number.isInteger(iterations) || iterations < 1) {
    return null;
  }

  if (!isHex(saltHex) || !isHex(derivedKeyHex)) {
    return null;
  }

  return { iterations, saltHex, derivedKeyHex };
}

async function derivePbkdf2Sha256(
  password: string,
  saltHex: string,
  iterations: number
): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: hexToArrayBuffer(saltHex),
      iterations
    },
    keyMaterial,
    PBKDF2_HASH_BYTES * 8
  );

  return bytesToHex(new Uint8Array(derivedBits));
}

function createSaltHex(byteLength: number): string {
  const saltBytes = new Uint8Array(byteLength);
  crypto.getRandomValues(saltBytes);
  return bytesToHex(saltBytes);
}

function timingSafeEqualHex(leftHex: string, rightHex: string): boolean {
  if (leftHex.length !== rightHex.length) {
    return false;
  }

  const left = hexToBytes(leftHex);
  const right = hexToBytes(rightHex);
  let mismatch = 0;

  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left[index] ^ right[index];
  }

  return mismatch === 0;
}

function isHex(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0 && value.length % 2 === 0 && /^[0-9a-f]+$/i.test(value);
}

function hexToArrayBuffer(value: string): ArrayBuffer {
  return hexToBytes(value).buffer as ArrayBuffer;
}

function hexToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length / 2);

  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }

  return bytes;
}

function bytesToHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
