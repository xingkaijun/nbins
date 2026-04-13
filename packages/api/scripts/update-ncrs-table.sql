-- Add missing columns to ncrs table
ALTER TABLE ncrs ADD COLUMN pdfObjectKey TEXT;
ALTER TABLE ncrs ADD COLUMN builderReply TEXT;
ALTER TABLE ncrs ADD COLUMN replyDate TEXT;
ALTER TABLE ncrs ADD COLUMN verifiedBy TEXT;
ALTER TABLE ncrs ADD COLUMN verifyDate TEXT;
ALTER TABLE ncrs ADD COLUMN rectifyRequest TEXT;
ALTER TABLE ncrs ADD COLUMN closedBy TEXT REFERENCES users(id);
ALTER TABLE ncrs ADD COLUMN closedAt TEXT;
