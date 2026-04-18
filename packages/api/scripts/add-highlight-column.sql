-- Add isHighlighted column to observations table
ALTER TABLE "observations" ADD COLUMN "isHighlighted" INTEGER NOT NULL DEFAULT 0;

-- Add isHighlighted column to comments table
ALTER TABLE "comments" ADD COLUMN "isHighlighted" INTEGER NOT NULL DEFAULT 0;
