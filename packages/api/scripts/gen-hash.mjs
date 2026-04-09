import { createPasswordHash } from "../src/auth/password.ts";

// Generate hash for the standard dev password
const hash = await createPasswordHash("nbins-dev-2026", {
  iterations: 120000,
  saltHex: "736565642d7379732d73616c742d3031"
});
console.log(hash);
