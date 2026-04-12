-- Project and Ship Data
INSERT INTO projects (id, code, name, status, "owner", class, createdAt, updatedAt) VALUES
('proj-demo-1', 'D-100', 'Demo Container Series', 'active', 'Demo Owner Ltd', 'ABS', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('proj-demo-2', 'D-200', 'Demo LNG Carrier', 'active', 'Demo Energy', 'DNV', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO ships (id, projectId, hullNumber, shipName, shipType, status, createdAt, updatedAt) VALUES
('ship-demo-1001', 'proj-demo-1', 'H-1001', 'DM-Container-1', 'Container', 'building', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ship-demo-1002', 'proj-demo-1', 'H-1002', 'DM-Container-2', 'Container', 'building', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ship-demo-2001', 'proj-demo-2', 'H-2001', 'DM-LNG-A', 'LNG Carrier', 'building', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Additional Users for Demo
INSERT INTO users (id, username, displayName, passwordHash, role, disciplines, accessibleProjectIds, isActive, createdAt, updatedAt) VALUES
('user-demo-qc', 'demo.qc', 'Demo QC', 'pbkdf2_sha256$90000$736565642d7379732d73616c742d3031$1e79dc790dc7d87ffaa25aacf6b8b25fa805d339bed4523b9808cd27727b53b1', 'inspector', '["HULL", "OUTFIT"]', '["proj-demo-1", "proj-demo-2"]', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('user-demo-owner', 'demo.owner', 'Owner Rep', 'pbkdf2_sha256$90000$736565642d7379732d73616c742d3031$1e79dc790dc7d87ffaa25aacf6b8b25fa805d339bed4523b9808cd27727b53b1', 'reviewer', '[]', '["proj-demo-1", "proj-demo-2"]', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Assign Admin and Demo Users to new Projects
INSERT INTO project_members (id, projectId, userId, createdAt, updatedAt) VALUES
('pm-admin-d1', 'proj-demo-1', 'sys-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('pm-admin-d2', 'proj-demo-2', 'sys-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('pm-qc-d1', 'proj-demo-1', 'user-demo-qc', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('pm-qc-d2', 'proj-demo-2', 'user-demo-qc', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Inspection Items for Ship 1001
INSERT INTO inspection_items (id, shipId, itemName, itemNameNormalized, discipline, workflowStatus, lastRoundResult, resolvedResult, currentRound, openCommentsCount, version, "source", createdAt, updatedAt) VALUES
('insp-demo-h1', 'ship-demo-1001', 'Hull Block Assembly 1', 'hull block assembly 1', 'HULL', 'closed', 'AA', 'AA', 1, 0, 1, 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('insp-demo-h2', 'ship-demo-1001', 'Accommodation Fitting', 'accommodation fitting', 'OUTFIT', 'open', 'OWC', NULL, 1, 1, 2, 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('insp-demo-h3', 'ship-demo-1001', 'Main Switchboard Test', 'main switchboard test', 'ELEC', 'open', 'RJ', NULL, 2, 2, 3, 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('insp-demo-h4', 'ship-demo-1001', 'Cargo Pump Test', 'cargo pump test', 'CHS', 'pending', NULL, NULL, 1, 0, 1, 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Inspection Items for Ship 2001
INSERT INTO inspection_items (id, shipId, itemName, itemNameNormalized, discipline, workflowStatus, lastRoundResult, resolvedResult, currentRound, openCommentsCount, version, "source", createdAt, updatedAt) VALUES
('insp-demo-lng1', 'ship-demo-2001', 'Membrane Leak Test', 'membrane leak test', 'CCS', 'open', 'QCC', NULL, 1, 1, 1, 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('insp-demo-lng2', 'ship-demo-2001', 'Paint Final Check', 'paint final check', 'PAINT', 'closed', 'CX', 'CX', 1, 0, 1, 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Insert Inspection Rounds
INSERT INTO inspection_rounds (id, inspectionItemId, roundNumber, rawItemName, actualDate, result, inspectedBy, "source", createdAt, updatedAt) VALUES
('rnd-demo-h1-1', 'insp-demo-h1', 1, 'Hull Block Assembly 1', '2026-04-09', 'AA', 'user-demo-qc', 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('rnd-demo-h2-1', 'insp-demo-h2', 1, 'Accommodation Fitting', '2026-04-08', 'OWC', 'user-demo-qc', 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('rnd-demo-h3-1', 'insp-demo-h3', 1, 'Main Switchboard Test', '2026-04-07', 'RJ', 'user-demo-qc', 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('rnd-demo-h3-2', 'insp-demo-h3', 2, 'Main Switchboard Test', NULL, NULL, NULL, 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('rnd-demo-h4-1', 'insp-demo-h4', 1, 'Cargo Pump Test', NULL, NULL, NULL, 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('rnd-demo-lng1-1', 'insp-demo-lng1', 1, 'Membrane Leak Test', '2026-04-09', 'QCC', 'user-demo-qc', 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('rnd-demo-lng2-1', 'insp-demo-lng2', 1, 'Paint Final Check', '2026-04-09', 'CX', 'user-demo-qc', 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Comments
INSERT INTO comments (id, inspectionItemId, createdInRoundId, authorId, localId, content, status, createdAt, updatedAt) VALUES
('cmt-demo-1', 'insp-demo-h2', 'rnd-demo-h2-1', 'user-demo-owner', 1, 'Surface is scratched, needs polishing.', 'open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cmt-demo-2', 'insp-demo-h3', 'rnd-demo-h3-1', 'user-demo-owner', 1, 'Wiring missing labeling.', 'open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cmt-demo-3', 'insp-demo-h3', 'rnd-demo-h3-1', 'user-demo-owner', 2, 'Insulation resistance too low.', 'open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cmt-demo-4', 'insp-demo-lng1', 'rnd-demo-lng1-1', 'user-demo-owner', 1, 'Minor leak on frame 50. Please seal.', 'open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

