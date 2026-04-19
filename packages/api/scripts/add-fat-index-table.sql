-- Create fat_index table for Factory Acceptance Test records
CREATE TABLE IF NOT EXISTS "fat_index" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "projects"("id"),
  "shipId" TEXT NOT NULL REFERENCES "ships"("id"),
  "title" TEXT NOT NULL,
  "discipline" TEXT NOT NULL,
  "serialNo" INTEGER NOT NULL DEFAULT 0,
  "result" TEXT,
  "remark" TEXT,
  "authorId" TEXT NOT NULL REFERENCES "users"("id"),
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);
