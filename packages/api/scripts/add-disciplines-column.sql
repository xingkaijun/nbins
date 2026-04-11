-- Add disciplines column to projects table if it doesn't exist
-- Run this migration on your local D1 database

-- SQLite doesn't support "IF NOT EXISTS" for ALTER TABLE ADD COLUMN
-- So we need to check if the column exists first

-- Add disciplines column to projects table
ALTER TABLE "projects" ADD COLUMN "disciplines" TEXT NOT NULL DEFAULT '[]';

-- Verify the column was added
SELECT * FROM "projects" LIMIT 1;
