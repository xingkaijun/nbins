INSERT OR IGNORE INTO users (id, username, displayName, passwordHash, role, disciplines, accessibleProjectIds, isActive, createdAt, updatedAt)
VALUES (
  'sys-admin',
  'admin',
  'System Admin',
  'pbkdf2_sha256$120000$162da04d72ee27260448eab610d9c5bc$97761007c6cd78f4aaac7f53c67a54fb1ded164b2c6a28e55f0088358677f13e',
  'admin',
  '[]',
  '[]',
  1,
  datetime('now'),
  datetime('now')
);
