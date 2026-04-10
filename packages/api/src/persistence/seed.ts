import type { InspectionStorageSnapshot } from "./records.ts";

const PASSWORD_1234_HASH = "pbkdf2_sha256$120000$162da04d72ee27260448eab610d9c5bc$97761007c6cd78f4aaac7f53c67a54fb1ded164b2c6a28e55f0088358677f13e";

export function createSeedInspectionStorageSnapshot(): InspectionStorageSnapshot {
  const snapshot: InspectionStorageSnapshot = {
    users: [],
    projects: [],
    projectMembers: [],
    ships: [],
    inspectionItems: [],
    inspectionRounds: [],
    comments: [],
    observations: [],
    ncrs: []
  };

  generateCustomMockData(snapshot);
    
  return snapshot;
}

function generateCustomMockData(snapshot: InspectionStorageSnapshot) {
  const now = new Date().toISOString();

  // 1. Projects
  const projs = [
    { id: "proj-A", code: "P-01", name: "Alpha Ocean Testing" },
    { id: "proj-B", code: "P-02", name: "Beta Container Operations" }
  ];
  for (const p of projs) {
    snapshot.projects.push({ ...p, status: "active", owner: "Owner ABC", shipyard: "Yard XYZ", class: "LR", reportRecipients: [], ncrRecipients: [], createdAt: now, updatedAt: now });
  }

  // 2. Ships
  const ships = [
    { id: "ship-A1", projectId: "proj-A", hullNumber: "A-001", shipName: "Alpha One" },
    { id: "ship-A2", projectId: "proj-A", hullNumber: "A-002", shipName: "Alpha Two" },
    { id: "ship-B1", projectId: "proj-B", hullNumber: "B-001", shipName: "Beta One" },
    { id: "ship-B2", projectId: "proj-B", hullNumber: "B-002", shipName: "Beta Two" }
  ];
  for (const s of ships) {
    snapshot.ships.push({ ...s, shipType: "Testing Hull", status: "building", createdAt: now, updatedAt: now });
  }

  // 3. Users (2 per role)
  const roles = ["admin", "manager", "reviewer", "inspector"];
  const userList: any[] = [];
  for (const role of roles) {
    for (let i = 1; i <= 2; i++) {
      const uId = `user-${role}-${i}`;
      const disciplines = role === "inspector" ? ["HULL", "PAINT"] : [];
      let allowedProjs = [projs[i-1].id];
      if (role === "admin") {
        allowedProjs = [projs[0].id, projs[1].id];
      }

      userList.push({
        id: uId,
        username: `${role}${i}`,
        displayName: `${role.toUpperCase()} ${i}`,
        passwordHash: PASSWORD_1234_HASH,
        role: role as any,
        disciplines,
        accessibleProjectIds: [],
        isActive: 1,
        createdAt: now,
        updatedAt: now
      });

      for (const pid of allowedProjs) {
        snapshot.projectMembers.push({
          id: `pm-${uId}-${pid}`,
          projectId: pid,
          userId: uId,
          createdAt: now,
          updatedAt: now
        });
      }
    }
  }
  snapshot.users.push(...userList);

  // 4. Inspections
  const disciplines = ["HULL", "OUTFIT", "MACHINERY", "PAINT"];
  const results = ["CX", "AA", "QCC", "OWC", "RJ"];
  for (const ship of ships) {
    for (let i = 0; i < 4; i++) {
      const inspId = `insp-${ship.id}-${i}`;
      const discipline = disciplines[i];
      const wfStatus = Math.random() > 0.5 ? "open" : "pending";
      const result = wfStatus === "open" ? results[Math.floor(Math.random() * results.length)] : null;
      
      snapshot.inspectionItems.push({
        id: inspId,
        shipId: ship.id,
        itemName: `${discipline} Block #0${i+1} Inspection`,
        itemNameNormalized: `${discipline.toLowerCase()} block #0${i+1}`,
        discipline: discipline as any,
        workflowStatus: wfStatus as any,
        lastRoundResult: null,
        resolvedResult: null,
        currentRound: 1,
        openCommentsCount: wfStatus === "open" ? 1 : 0,
        version: 1,
        source: "manual",
        createdAt: now,
        updatedAt: now
      });

      const roundId = `${inspId}-r1`;
      snapshot.inspectionRounds.push({
        id: roundId,
        inspectionItemId: inspId,
        roundNumber: 1,
        rawItemName: `${discipline} Block #0${i+1} Inspection`,
        plannedDate: now,
        actualDate: now, // 所有的测试项目全带入今天的检验日期，避免日期字段产生 null 空档
        yardQc: "QC User",
        result: result as any,
        inspectedBy: wfStatus === "open" ? (ship.projectId === "proj-A" ? "user-inspector-1" : "user-inspector-2") : null,
        notes: null,
        source: "manual",
        createdAt: now,
        updatedAt: now
      });

      if (wfStatus === "open") {
        snapshot.comments.push({
          id: `cmt-${inspId}`,
          inspectionItemId: inspId,
          createdInRoundId: roundId,
          closedInRoundId: null,
          authorId: (ship.projectId === "proj-A" ? "user-inspector-1" : "user-inspector-2"),
          localId: 0,
          content: `Random testing comment for ${ship.shipName}. Please fix the issue.`,
          status: "open",
          closedBy: null,
          closedAt: null,
          resolveRemark: null,
          createdAt: now,
          updatedAt: now
        });
      }
    }
  }
}
