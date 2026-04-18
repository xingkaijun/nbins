-- 为 observations 表添加 isHighlighted 字段
ALTER TABLE observations ADD COLUMN isHighlighted INTEGER DEFAULT 0;

-- 为 comments 表添加 isHighlighted 字段
ALTER TABLE comments ADD COLUMN isHighlighted INTEGER DEFAULT 0;
