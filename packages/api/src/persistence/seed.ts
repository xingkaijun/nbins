import type { InspectionStorageSnapshot } from "./records.ts";
import { ALL_MOCK_DETAILS, DISCIPLINES, INSPECTION_RESULTS } from "@nbins/shared";

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

  const nextLocalIdByItemId = new Map<string, number>();

  for (const comment of snapshot.comments) {
    const next = nextLocalIdByItemId.get(comment.inspectionItemId) ?? 1;
    nextLocalIdByItemId.set(comment.inspectionItemId, Math.max(next, (comment.localId ?? 0) + 1));
  }

  // 把所有自动生成的 shared 测试数据转换注入为 D1 种子数据库结构
  for (const detail of Object.values(ALL_MOCK_DETAILS)) {
    const SEED_DETAIL_IDS = new Set<string>(); // Keep empty for clean seed

    // 防止和原有 mock 数据冲突
    if (snapshot.inspectionItems.find(i => i.id === detail.id)) {
        continue;
    }

    if (!SEED_DETAIL_IDS.has(detail.id)) {
        continue;
    }

    const existingProject = snapshot.projects.find(p => p.code === detail.projectCode);
    const projectId = existingProject?.id ?? `project-${detail.projectCode.toLowerCase()}`;

    // 如果还没有这个项目则插入
    if (!existingProject) {
        snapshot.projects.push({
            id: projectId,
            name: detail.projectName,
            code: detail.projectCode,
            status: "active",
            owner: "Mock Owner",
            shipyard: "Mock Shipyard",
            class: "ABS",
            reportRecipients: [],
            ncrRecipients: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
    }

    const systemMembershipId = `project-member-sys-${projectId}`;
    if (!snapshot.projectMembers.some((member) => member.id === systemMembershipId)) {
      snapshot.projectMembers.push({
        id: systemMembershipId,
        projectId,
        userId: "sys-user",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    const existingShip = snapshot.ships.find(s => s.hullNumber === detail.hullNumber);
    const shipId = existingShip?.id ?? `ship-${detail.hullNumber.replace("-", "").toLowerCase()}`;

    // 如果还没有这条船则插入
    if (!existingShip) {
        snapshot.ships.push({
            id: shipId,
            projectId,
            hullNumber: detail.hullNumber,
            shipName: detail.shipName,
            shipType: "Virtual Testing Hull",
            status: "building",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
    }

    // 组装检验项主记录
    snapshot.inspectionItems.push({
      id: detail.id,
      shipId,
      itemName: detail.itemName,
      itemNameNormalized: detail.itemName.toLowerCase(),
      discipline: detail.discipline,
      workflowStatus: detail.workflowStatus,
      lastRoundResult: detail.lastRoundResult,
      resolvedResult: detail.resolvedResult,
      currentRound: detail.currentRound,
      openCommentsCount: detail.openCommentCount,
      version: detail.version,
      source: detail.source,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // 转换评论
    let commentLocalIdCounter = 1;
    for (const comment of detail.comments) {
        const nextLocalId = nextLocalIdByItemId.get(detail.id) ?? 1;
        nextLocalIdByItemId.set(detail.id, nextLocalId + 1);

        snapshot.comments.push({
            id: comment.id,
            inspectionItemId: detail.id,
            createdInRoundId: `${detail.id}-round-${comment.roundNumber}`,
            closedInRoundId: comment.status === "closed" ? `${detail.id}-round-${detail.currentRound}` : null,
            authorId: "sys-user",
            localId: nextLocalId,
            content: comment.message,
            status: comment.status,
            closedBy: comment.resolvedBy,
            closedAt: comment.resolvedAt,
            resolveRemark: comment.resolveRemark ?? null,
            createdAt: comment.createdAt,
            updatedAt: comment.createdAt
        });
    }

    // 转换检验轮次历史
    for (const entry of detail.roundHistory) {
         snapshot.inspectionRounds.push({
             id: entry.id, // e.g. insp-006-round-1
             inspectionItemId: detail.id,
             roundNumber: entry.roundNumber,
             rawItemName: detail.itemName,
             plannedDate: detail.plannedDate ?? new Date().toLocaleDateString("en-CA"),
             actualDate: entry.actualDate,
             yardQc: detail.yardQc,
             result: entry.submittedResult,
             inspectedBy: "sys-user",
             notes: entry.notes,
             source: detail.source,
             createdAt: entry.submittedAt,
             updatedAt: entry.submittedAt
         });
    }

    // 为进行中的轮次（尚未在 history 中产生条目）补充空记录
    if (detail.workflowStatus === "pending") {
         snapshot.inspectionRounds.push({
             id: `${detail.id}-round-${detail.currentRound}`,
             inspectionItemId: detail.id,
             roundNumber: detail.currentRound,
             rawItemName: detail.itemName,
             plannedDate: detail.plannedDate ?? new Date().toLocaleDateString("en-CA"),
             actualDate: null,
             yardQc: detail.yardQc,
             result: null,
             inspectedBy: null,
             notes: null,
             source: detail.source,
             createdAt: new Date().toISOString(),
             updatedAt: new Date().toISOString()
         });
    }
  }

  // 补全所有缺失的 users 记录以免违反外键约束
  const knownUserIds = new Set(snapshot.users.map(u => u.id));
  const referencedUserIds = new Set<string>();

  snapshot.inspectionRounds.forEach(r => r.inspectedBy && referencedUserIds.add(r.inspectedBy));
  snapshot.comments.forEach(c => {
    if (c.authorId) referencedUserIds.add(c.authorId);
    if (c.closedBy) referencedUserIds.add(c.closedBy);
  });

  for (const uid of referencedUserIds) {
    if (!knownUserIds.has(uid)) {
      snapshot.users.push({
        id: uid,
        username: `user_${uid.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`,
        displayName: `Mock User (${uid})`,
        passwordHash: uid === "sys-user" ? SYSTEM_USER_PASSWORD_HASH : "disabled",
        role: "inspector",
        disciplines: [],
        accessibleProjectIds: [],
        isActive: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      knownUserIds.add(uid);
    }
  }

  for (const user of snapshot.users) {
    if (!snapshot.projectMembers.some((member) => member.userId === user.id)) {
      const firstProject = snapshot.projects[0];

      if (!firstProject) {
        break;
      }

      snapshot.projectMembers.push({
        id: `project-member-${user.id}-${firstProject.id}`,
        projectId: firstProject.id,
        userId: user.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  }

  // ① 处理原有的 ALL_MOCK_DETAILS（保持不变)
  // ② 生成新固定数据 (Disabled to keep seed clean)
  // generateFixedMockData(snapshot);
    
  return snapshot;
}

// ---------------------------------------------------------------------------
// Helper: generate deterministic mock data for two projects, two ships each,
// all disciplines, three inspections per ship‑discipline, and observations.
// Also creates 20 additional inspector users.
// ---------------------------------------------------------------------------
function generateFixedMockData(snapshot: InspectionStorageSnapshot) {
  // Ensure observations array exists
  // @ts-ignore
  if (!('observations' in snapshot) || (snapshot as any).observations === undefined) {
    // @ts-ignore
    (snapshot as any).observations = [];
  }

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
            discipline,
            workflowStatus,
            lastRoundResult: null,
            resolvedResult: workflowStatus === 'closed' ? currentResult : null,
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
