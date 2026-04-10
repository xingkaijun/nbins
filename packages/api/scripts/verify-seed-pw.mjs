import { verifyPasswordHash } from "../src/auth/password.ts";

const PASSWORD_1234_HASH = "pbkdf2_sha256$120000$162da04d72ee27260448eab610d9c5bc$97761007c6cd78f4aaac7f53c67a54fb1ded164b2c6a28e55f0088358677f13e";

const candidates = ["1234", "123456", "password", "admin", "nbins"];

for (const pw of candidates) {
  const ok = await verifyPasswordHash(pw, PASSWORD_1234_HASH);
  if (ok) {
    console.log(`FOUND: "${pw}"`);
    process.exit(0);
  }
}
console.log("NOT FOUND");
