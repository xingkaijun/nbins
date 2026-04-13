const fs = require('fs');

let content = fs.readFileSync('d:/Code/nbins/packages/web/src/api.ts', 'utf8');

const marker = '/** ----- SQL Console API ----- **/';
const idx = content.indexOf(marker);

if (idx === -1) {
  console.log('Marker not found!');
  process.exit(1);
}

const newBlock = `/** ----- SQL Console API -----
 * 独立的 fetch 封装，不走 requestJson 以避免触发全局 401 session 过期逻辑。
 * SQL 控制台用的是 X-SQL-Secret 而非 JWT，不应影响用户登录状态。
 */

async function sqlFetch<T>(path: string, secret: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  headers.set("X-SQL-Secret", secret);
  if (token) headers.set("Authorization", \`Bearer \${token}\`);

  const response = await fetch(\`\${getApiBaseUrl()}\${path}\`, { ...init, headers });

  let payload: { ok: boolean; data?: T; error?: string } | null = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error ?? \`SQL request failed (\${response.status})\`);
  }

  return payload.data as T;
}

export async function executeSql(sql: string, secret: string) {
  return sqlFetch<any>("/sql/execute", secret, {
    method: "POST",
    body: JSON.stringify({ sql })
  });
}

export async function exportDatabase(secret: string) {
  return sqlFetch<any>("/sql/export-db", secret, { method: "GET" });
}

export async function importDatabase(data: object, secret: string) {
  return sqlFetch<any>("/sql/import-db", secret, {
    method: "POST",
    body: JSON.stringify({ data })
  });
}

export async function exportProject(projectId: string, secret: string) {
  return sqlFetch<any>(\`/sql/export-project/\${projectId}\`, secret, { method: "GET" });
}

export async function importProject(data: object, secret: string) {
  return sqlFetch<any>("/sql/import-project", secret, {
    method: "POST",
    body: JSON.stringify({ data })
  });
}

export async function deleteProject(projectId: string, secret: string) {
  return sqlFetch<any>(\`/sql/delete-project/\${projectId}\`, secret, { method: "DELETE" });
}
`;

content = content.substring(0, idx) + newBlock;
fs.writeFileSync('d:/Code/nbins/packages/web/src/api.ts', content);
console.log('OK, wrote', content.length, 'chars');
