import { verifyPasswordHash } from "../src/auth/password.ts";

const SYSTEM_USER_PASSWORD_HASH =
  "pbkdf2_sha256$120000$736565642d7379732d73616c742d3031$b4463dd10858509c2e000628d10dff3c7e31b2cfbcf869832b6d99437f8a8003";

const candidates = [
  "nbins-dev-li-2026",
  "nbins-dev-wang-2026",
  "nbins-dev-2026",
  "password",
  "nbins",
  "admin",
  "123456",
  "test",
  "dev",
  "nbins-secret",
];

for (const pw of candidates) {
  const ok = await verifyPasswordHash(pw, SYSTEM_USER_PASSWORD_HASH);
  console.log(`  ${ok ? "✅" : "❌"}  "${pw}"`);
  if (ok) {
    console.log(`\n>>> FOUND: password is "${pw}"`);
    break;
  }
}
