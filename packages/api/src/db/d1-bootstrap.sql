CREATE TABLE IF NOT EXISTS "users" (
  "id" TEXT PRIMARY KEY,
  "username" TEXT NOT NULL UNIQUE,
  "displayName" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" TEXT NOT NULL,
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
  "recipients" TEXT NOT NULL DEFAULT '[]',
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
  "date" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "closedBy" TEXT REFERENCES "users"("id"),
  "closedAt" TEXT,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);
