INSERT OR IGNORE INTO users (id, username, displayName, passwordHash, role, disciplines, accessibleProjectIds, isActive, createdAt, updatedAt)
VALUES (
  'sys-admin',
  'admin',
  'System Admin',
  'pbkdf2_sha256$90000$736565642d7379732d73616c742d3031$1e79dc790dc7d87ffaa25aacf6b8b25fa805d339bed4523b9808cd27727b53b1',
  'admin',
  '[]',
  '[]',
  1,
  datetime('now'),
  datetime('now')
);
