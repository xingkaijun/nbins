-- ITP 集成迁移：部署 feature/nbins-itp-integration 分支前，
-- 在生产库执行一次（本地开发库由 d1-bootstrap.sql 自动覆盖，无需执行）：
--   pnpm --filter @nbins/api exec wrangler d1 execute nbins-prod --remote --file migrations/0001-itp-sync.sql

ALTER TABLE "inspection_items" ADD COLUMN "itpCode" TEXT;

CREATE TABLE IF NOT EXISTS "sync_outbox" (
  "id" INTEGER PRIMARY KEY,
  "createdAt" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "projectCode" TEXT NOT NULL,
  "hullNumber" TEXT NOT NULL,
  "itpCode" TEXT NOT NULL,
  "itpStatus" TEXT NOT NULL,
  "inspectionItemId" TEXT,
  "detail" TEXT
);
