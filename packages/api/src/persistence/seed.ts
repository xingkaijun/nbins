import type { InspectionStorageSnapshot } from "./records.ts";

// Password: nbins-dev-2026
const SYSTEM_USER_PASSWORD_HASH =
  "pbkdf2_sha256$120000$736565642d7379732d73616c742d3031$e2b18d69b836e060955d3fb4a1044218fd45f64a8b21f52dff8b093d5e5d1ca1";

export function createSeedInspectionStorageSnapshot(): InspectionStorageSnapshot {
  const snapshot: InspectionStorageSnapshot = {
    users: [
      {
        id: "sys-admin",
        username: "admin",
        displayName: "System Admin",
        // Password: 123456
        passwordHash: "pbkdf2_sha256$120000$c9a53f0869da3fdced70c3a63fa227fa$0ec61f4bec112ed51219189b49c730b844b40e9423f3bfa09cc915977c45ee36",
        role: "admin",
        disciplines: [],
        accessibleProjectIds: [],
        isActive: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: "sys-user",
        username: "user",
        displayName: "NBINS Local Tester",
        passwordHash: SYSTEM_USER_PASSWORD_HASH,
        role: "admin", // temp elevate for dev
        disciplines: ["HULL", "PAINT", "ELEC"],
        accessibleProjectIds: ["P-100", "P-200"],
        isActive: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ],
    projects: [],
    projectMembers: [],
    ships: [],
    inspectionItems: [],
    inspectionRounds: [],
    comments: [],
    observations: [],
    ncrs: []
  };

  // 生成固定测试数据
  generateFixedMockData(snapshot);
    
  return snapshot;
}

// ---------------------------------------------------------------------------
// Helper: generate deterministic mock data for two projects, two ships each,
// all disciplines, three inspections per ship‑discipline, and observations.
// Also creates 20 additional inspector users.
// ---------------------------------------------------------------------------
function generateFixedMockData(snapshot: InspectionStorageSnapshot) {
  const DISCIPLINES = [
    "HULL",
    "OUTFIT",
    "MACHINERY",
    "CHS",
    "ELEC",
    "PAINT",
    "CCS"
  ];

  const INSPECTION_RESULTS = ["CX", "AA", "QCC", "OWC", "RJ"];

  const projectConfigs = [
    { code: 'P-001', name: 'Hudong LNG Carrier', owner: 'MOL', shipyard: 'Hudong-Zhonghua', class: 'ABS' },
    { code: 'P-002', name: 'CSSC Containment Series', owner: 'CSSC Leasing', shipyard: 'Jiangnan', class: 'DNV' },
    { code: 'P-003', name: 'Standard Tanker Project', owner: 'Cosco', shipyard: 'SWS', class: 'NK' },
    { code: 'P-100', name: 'Project Alpha', owner: 'Owner A', shipyard: 'Yard A', class: 'LR' },
    { code: 'P-200', name: 'Project Beta',  owner: 'Owner B', shipyard: 'Yard B', class: 'LR' },
  ];

  const shipConfigs = [
    { projectCode: 'P-100', hullNumber: 'H-1100', shipName: 'NB1100' },
    { projectCode: 'P-100', hullNumber: 'H-1200', shipName: 'NB1200' },
    { projectCode: 'P-200', hullNumber: 'H-2100', shipName: 'NB2100' },
    { projectCode: 'P-200', hullNumber: 'H-2200', shipName: 'NB2200' },
    { projectCode: 'P-001', hullNumber: 'H-2748', shipName: 'NB2748' },
    { projectCode: 'P-001', hullNumber: 'H-2777', shipName: 'NB2777' },
    { projectCode: 'P-002', hullNumber: 'H-2751', shipName: 'NB2751' },
    { projectCode: 'P-002', hullNumber: 'H-2752', shipName: 'NB2752' },
    { projectCode: 'P-003', hullNumber: 'H-2802', shipName: 'NB2802' },
    { projectCode: 'P-003', hullNumber: 'H-3501', shipName: 'NB3501' },
    { projectCode: 'P-003', hullNumber: 'H-3502', shipName: 'NB3502' },
  ];

  // 1. Ensure projects exist
  for (const proj of projectConfigs) {
    let projRec = snapshot.projects.find(p => p.code === proj.code);
    if (!projRec) {
      projRec = {
        id: `project-${proj.code.toLowerCase()}`,
        name: proj.name,
        code: proj.code,
        status: 'active',
        owner: proj.owner,
        shipyard: proj.shipyard,
        class: proj.class,
        reportRecipients: [],
        ncrRecipients: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      snapshot.projects.push(projRec);
    }
    
    // system user membership
    if (!snapshot.projectMembers.some(m => m.projectId === projRec!.id && m.userId === 'sys-user')) {
      snapshot.projectMembers.push({
        id: `project-member-sys-${projRec!.id}`,
        projectId: projRec!.id,
        userId: 'sys-user',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  // 2. Ensure ships exist and generate inspections
  for (const shipCfg of shipConfigs) {
    const projRec = snapshot.projects.find(p => p.code === shipCfg.projectCode);
    if (!projRec) continue;

    const shipId = `ship-${shipCfg.hullNumber.replace('-', '').toLowerCase()}`;
    let shipRec = snapshot.ships.find(s => s.hullNumber === shipCfg.hullNumber);
    
    if (!shipRec) {
      shipRec = {
        id: shipId,
        projectId: projRec.id,
        hullNumber: shipCfg.hullNumber,
        shipName: shipCfg.shipName,
        shipType: 'Virtual Testing Hull',
        status: 'building',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      snapshot.ships.push(shipRec);

      // Generate inspections (3 per ship-discipline) for NEWLY added ships
      for (const discipline of DISCIPLINES) {
        for (let i = 1; i <= 3; i++) {
          const inspId = `insp-${shipCfg.projectCode}-${shipCfg.hullNumber}-${discipline}-${i}`;
          const itemName = `${discipline} Inspection ${i}`;
          const workflowStatus = Math.random() < 0.4 ? 'pending' : (Math.random() < 0.5 ? 'open' : 'closed');
          const currentResult = workflowStatus === 'pending' ? null : INSPECTION_RESULTS[Math.floor(Math.random() * INSPECTION_RESULTS.length)];
          
          snapshot.inspectionItems.push({
            id: inspId,
            shipId: shipRec.id,
            itemName,
            itemNameNormalized: itemName.toLowerCase(),
            // @ts-ignore
            discipline,
            workflowStatus: workflowStatus as any,
            lastRoundResult: null,
            resolvedResult: workflowStatus === 'closed' ? currentResult as any : null,
            currentRound: 1,
            openCommentsCount: 0,
            version: 1,
            source: 'manual',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          {
            const roundId = `${inspId}-round-1`;
            snapshot.inspectionRounds.push({
              id: roundId,
              inspectionItemId: inspId,
              roundNumber: 1,
              rawItemName: itemName,
              plannedDate: new Date().toLocaleDateString('en-CA'),
              actualDate: workflowStatus !== 'pending' ? new Date().toLocaleDateString('en-CA') : null,
              yardQc: 'QC Staff',
              result: currentResult as any,
              inspectedBy: workflowStatus !== 'pending' ? 'sys-user' : null,
              notes: null,
              source: 'manual',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }

          // Observation linked to the ship
          const obsId = `obs-${inspId}`;
          (snapshot as any).observations.push({
            id: obsId,
            shipId: shipRec.id,
            type: 'patrol',
            // @ts-ignore
            discipline,
            authorId: 'sys-user',
            date: new Date().toISOString(),
            content: `Auto-generated observation for ${discipline} on ${shipCfg.shipName}`,
            status: 'open',
            closedBy: null,
            closedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }
  }

  // 3. Add 20 extra inspector users
  const extraUsers = [
    { id: 'li.si', name: 'Li Si' },
    { id: 'wang.wu', name: 'Wang Wu' }
  ];
  for (let i = 1; i <= 20; i++) {
    extraUsers.push({ id: `user-${i.toString().padStart(2, '0')}`, name: `Mock User ${i}` });
  }

  for (const u of extraUsers) {
    if (!snapshot.users.find(user => user.id === u.id)) {
      snapshot.users.push({
        id: u.id,
        username: u.id,
        displayName: u.name,
        passwordHash: SYSTEM_USER_PASSWORD_HASH,
        role: 'inspector',
        disciplines: [],
        accessibleProjectIds: [],
        isActive: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    
    // Assign each user to all test projects
    for (const proj of projectConfigs) {
      const projRec = snapshot.projects.find(p => p.code === proj.code);
      if (projRec && !snapshot.projectMembers.some(m => m.projectId === projRec.id && m.userId === u.id)) {
        snapshot.projectMembers.push({
          id: `project-member-${u.id}-${projRec.id}`,
          projectId: projRec.id,
          userId: u.id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }
}
