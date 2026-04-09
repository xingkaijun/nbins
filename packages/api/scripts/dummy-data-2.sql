-- Inspection Items for Ship 1002 (H-1002)
-- Using random UUID-like IDs to avoid conflicts
INSERT INTO inspection_items (id, shipId, itemName, itemNameNormalized, discipline, workflowStatus, lastRoundResult, resolvedResult, currentRound, openCommentsCount, version, "source", createdAt, updatedAt) VALUES
('insp-demo-s2-h1', 'ship-demo-1002', 'Double Bottom Block Fairing', 'double bottom block fairing', 'HULL', 'pending', NULL, NULL, 1, 0, 1, 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('insp-demo-s2-o1', 'ship-demo-1002', 'Mooring Winch Foundation Check', 'mooring winch foundation check', 'OUTFIT', 'open', 'OWC', NULL, 1, 1, 1, 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('insp-demo-s2-e1', 'ship-demo-1002', 'Bridge Console Installation', 'bridge console installation', 'ELEC', 'closed', 'AA', 'AA', 1, 0, 1, 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('insp-demo-s2-p1', 'ship-demo-1002', 'Water Ballast Tank Primer', 'water ballast tank primer', 'PAINT', 'open', 'RJ', NULL, 1, 2, 1, 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- More Inspection Items for Ship 1001 (H-1001)
INSERT INTO inspection_items (id, shipId, itemName, itemNameNormalized, discipline, workflowStatus, lastRoundResult, resolvedResult, currentRound, openCommentsCount, version, "source", createdAt, updatedAt) VALUES
('insp-demo-s1-p1', 'ship-demo-1001', 'Deck Anti-slip Paint', 'deck anti-slip paint', 'PAINT', 'open', 'QCC', NULL, 1, 1, 1, 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);


-- Insert Inspection Rounds
INSERT INTO inspection_rounds (id, inspectionItemId, roundNumber, rawItemName, actualDate, result, inspectedBy, "source", createdAt, updatedAt) VALUES
('rnd-demo-s2-h1-1', 'insp-demo-s2-h1', 1, 'Double Bottom Block Fairing', NULL, NULL, NULL, 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

('rnd-demo-s2-o1-1', 'insp-demo-s2-o1', 1, 'Mooring Winch Foundation Check', '2026-04-10', 'OWC', 'user-demo-qc', 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

('rnd-demo-s2-e1-1', 'insp-demo-s2-e1', 1, 'Bridge Console Installation', '2026-04-09', 'AA', 'user-demo-qc', 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

('rnd-demo-s2-p1-1', 'insp-demo-s2-p1', 1, 'Water Ballast Tank Primer', '2026-04-09', 'RJ', 'user-demo-qc', 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

('rnd-demo-s1-p1-1', 'insp-demo-s1-p1', 1, 'Deck Anti-slip Paint', '2026-04-09', 'QCC', 'user-demo-qc', 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Comments
INSERT INTO comments (id, inspectionItemId, createdInRoundId, authorId, localId, content, status, createdAt, updatedAt) VALUES
('cmt-demo-s2-1', 'insp-demo-s2-o1', 'rnd-demo-s2-o1-1', 'user-demo-owner', 1, 'Welding reinforcement is missing on the aft side.', 'open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

('cmt-demo-s2-2', 'insp-demo-s2-p1', 'rnd-demo-s2-p1-1', 'user-demo-owner', 1, 'DFT is below specified standard in corners.', 'open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cmt-demo-s2-3', 'insp-demo-s2-p1', 'rnd-demo-s2-p1-1', 'user-demo-owner', 2, 'Some areas appear to have contamination before coating.', 'open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

('cmt-demo-s1-1', 'insp-demo-s1-p1', 'rnd-demo-s1-p1-1', 'user-demo-owner', 1, 'Slight unevenness in application, QC noted this will be rectified.', 'open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
