CREATE TABLE IF NOT EXISTS "users" (
  "id" TEXT PRIMARY KEY,
  "username" TEXT NOT NULL UNIQUE,
  "displayName" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "title" TEXT,
  "disciplines" TEXT NOT NULL DEFAULT '[]',
  "accessibleProjectIds" TEXT NOT NULL DEFAULT '[]',
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "projects" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'active',
  "owner" TEXT,
  "shipyard" TEXT,
  "class" TEXT,
  "disciplines" TEXT NOT NULL DEFAULT '[]',
  "reportRecipients" TEXT NOT NULL DEFAULT '[]',
  "ncrRecipients" TEXT NOT NULL DEFAULT '[]',
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "project_members" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "projects"("id"),
  "userId" TEXT NOT NULL REFERENCES "users"("id"),
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "ships" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "projects"("id"),
  "hullNumber" TEXT NOT NULL,
  "shipName" TEXT NOT NULL,
  "shipType" TEXT,
  "status" TEXT NOT NULL DEFAULT 'building',
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "inspection_items" (
  "id" TEXT PRIMARY KEY,
  "shipId" TEXT NOT NULL REFERENCES "ships"("id"),
  "itemName" TEXT NOT NULL,
  "itemNameNormalized" TEXT NOT NULL,
  "discipline" TEXT NOT NULL,
  "workflowStatus" TEXT NOT NULL DEFAULT 'pending',
  "lastRoundResult" TEXT,
  "resolvedResult" TEXT,
  "currentRound" INTEGER NOT NULL DEFAULT 1,
  "openCommentsCount" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "source" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "inspection_rounds" (
  "id" TEXT PRIMARY KEY,
  "inspectionItemId" TEXT NOT NULL REFERENCES "inspection_items"("id"),
  "roundNumber" INTEGER NOT NULL,
  "rawItemName" TEXT NOT NULL,
  "plannedDate" TEXT,
  "actualDate" TEXT,
  "yardQc" TEXT,
  "result" TEXT,
  "inspectedBy" TEXT REFERENCES "users"("id"),
  "notes" TEXT,
  "source" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "comments" (
  "id" TEXT PRIMARY KEY,
  "inspectionItemId" TEXT NOT NULL REFERENCES "inspection_items"("id"),
  "createdInRoundId" TEXT NOT NULL REFERENCES "inspection_rounds"("id"),
  "closedInRoundId" TEXT REFERENCES "inspection_rounds"("id"),
  "authorId" TEXT NOT NULL REFERENCES "users"("id"),
  "localId" INTEGER NOT NULL DEFAULT 0,
  "content" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "closedBy" TEXT REFERENCES "users"("id"),
  "closedAt" TEXT,
  "resolveRemark" TEXT,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "ncrs" (
  "id" TEXT PRIMARY KEY,
  "shipId" TEXT NOT NULL REFERENCES "ships"("id"),
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "authorId" TEXT NOT NULL REFERENCES "users"("id"),
  "status" TEXT NOT NULL DEFAULT 'draft',
  "approvedBy" TEXT REFERENCES "users"("id"),
  "approvedAt" TEXT,
  "pdfObjectKey" TEXT,
  "builderReply" TEXT,
  "replyDate" TEXT,
  "verifiedBy" TEXT,
  "verifyDate" TEXT,
  "closedBy" TEXT REFERENCES "users"("id"),
  "closedAt" TEXT,
  "rectifyRequest" TEXT,
  "attachments" TEXT NOT NULL DEFAULT '[]',
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "ncr_index" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "projects"("id"),
  "shipId" TEXT NOT NULL REFERENCES "ships"("id"),
  "title" TEXT NOT NULL,
  "discipline" TEXT NOT NULL,
  "serialNo" INTEGER NOT NULL DEFAULT 0,
  "remark" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "authorId" TEXT NOT NULL REFERENCES "users"("id"),
  "approvedBy" TEXT REFERENCES "users"("id"),
  "approvedAt" TEXT,
  "pdfObjectKey" TEXT,
  "fileCount" INTEGER NOT NULL DEFAULT 0,
  "builderReply" TEXT,
  "replyDate" TEXT,
  "verifiedBy" TEXT,
  "verifyDate" TEXT,
  "closedBy" TEXT REFERENCES "users"("id"),
  "closedAt" TEXT,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "observation_types" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "label" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "observations" (
  "id" TEXT PRIMARY KEY,
  "shipId" TEXT NOT NULL REFERENCES "ships"("id"),
  "type" TEXT NOT NULL,
  "discipline" TEXT NOT NULL,
  "authorId" TEXT NOT NULL REFERENCES "users"("id"),
  "serialNo" INTEGER NOT NULL DEFAULT 0,
  "location" TEXT,
  "date" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "remark" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "closedBy" TEXT REFERENCES "users"("id"),
  "closedAt" TEXT,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "fat_index" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "projects"("id"),
  "shipId" TEXT NOT NULL REFERENCES "ships"("id"),
  "title" TEXT NOT NULL,
  "discipline" TEXT NOT NULL,
  "serialNo" INTEGER NOT NULL DEFAULT 0,
  "result" TEXT,
  "remark" TEXT,
  "maker" TEXT,
  "inspectionDate" TEXT,
  "openCommentsCount" INTEGER NOT NULL DEFAULT 0,
  "authorId" TEXT NOT NULL REFERENCES "users"("id"),
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);

-- ============================================================
-- Performance Indexes
-- ============================================================

-- ships: 按项目查询船舶
CREATE INDEX IF NOT EXISTS idx_ships_projectId ON "ships"("projectId");

-- inspection_items: 按船/专业/状态筛选检验项
CREATE INDEX IF NOT EXISTS idx_inspection_items_shipId ON "inspection_items"("shipId");
CREATE INDEX IF NOT EXISTS idx_inspection_items_discipline ON "inspection_items"("discipline");
CREATE INDEX IF NOT EXISTS idx_inspection_items_workflowStatus ON "inspection_items"("workflowStatus");

-- inspection_rounds: 按检验项加载轮次
CREATE INDEX IF NOT EXISTS idx_inspection_rounds_inspectionItemId ON "inspection_rounds"("inspectionItemId");
CREATE INDEX IF NOT EXISTS idx_inspection_rounds_item_round ON "inspection_rounds"("inspectionItemId", "roundNumber");

-- comments: 按检验项加载意见 + 按状态统计
CREATE INDEX IF NOT EXISTS idx_comments_inspectionItemId ON "comments"("inspectionItemId");
CREATE INDEX IF NOT EXISTS idx_comments_status ON "comments"("inspectionItemId", "status");

-- observations: 按船+专业筛选意见
CREATE INDEX IF NOT EXISTS idx_observations_shipId ON "observations"("shipId");
CREATE INDEX IF NOT EXISTS idx_observations_ship_discipline ON "observations"("shipId", "discipline");

-- ncr_index: 按项目/船舶筛选 NCR
CREATE INDEX IF NOT EXISTS idx_ncr_index_projectId ON "ncr_index"("projectId");
CREATE INDEX IF NOT EXISTS idx_ncr_index_shipId ON "ncr_index"("shipId");

-- ncrs: 按船舶筛选 NCR（旧表）
CREATE INDEX IF NOT EXISTS idx_ncrs_shipId ON "ncrs"("shipId");

-- fat_index: 按项目/船舶筛选 FAT
CREATE INDEX IF NOT EXISTS idx_fat_index_projectId ON "fat_index"("projectId");
CREATE INDEX IF NOT EXISTS idx_fat_index_shipId ON "fat_index"("shipId");

-- project_members: 按项目/用户查成员关系
CREATE INDEX IF NOT EXISTS idx_project_members_projectId ON "project_members"("projectId");
CREATE INDEX IF NOT EXISTS idx_project_members_userId ON "project_members"("userId");
