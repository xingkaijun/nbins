import { createPasswordHash } from "./src/auth/password.ts";

async function main() {
  const hash = await createPasswordHash("123456", {
    saltHex: "736565642d7379732d73616c742d3031", // 使用固定 salt 方便测试
    iterations: 120000
  });
  console.log("HASH_FOR_123456:", hash);
}

main().catch(console.error);
