-- Create ncr_index table
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
