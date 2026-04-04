import type { InspectionStorageSnapshot } from "./records.ts";
import type { InspectionStorage } from "./inspection-storage.ts";

const NOW = "2026-04-03T09:00:00.000Z";
const LI_SI_PASSWORD_HASH =
  "pbkdf2_sha256$120000$6d6f636b2d6c692d73616c742d3031$53a16fb17e44d9ab4ff18c6e7f98d6fc8d1ed6f9716085a0f507a55ceaecd891";
const WANG_WU_PASSWORD_HASH =
  "pbkdf2_sha256$120000$6d6f636b2d77616e672d73616c742d3031$f5b19573d092f340ec36f187041b4fc6d78c00bbada4d3fbc38aa2081d513559";

const BASELINE_DATA: InspectionStorageSnapshot = {
  users: [
    {
      id: "user-inspector-li",
      username: "li.si",
      displayName: "Li Si",
      passwordHash: LI_SI_PASSWORD_HASH,
      role: "inspector",
      disciplines: ["PAINT", "MACHINERY"],
      accessibleProjectIds: ["project-hd-lng"],
      isActive: 1,
      createdAt: NOW,
      updatedAt: NOW
    },
    {
      id: "user-inspector-wang",
      username: "wang.wu",
      displayName: "Wang Wu",
      passwordHash: WANG_WU_PASSWORD_HASH,
      role: "inspector",
      disciplines: ["CCS", "HULL"],
      accessibleProjectIds: ["project-cssc-series"],
      isActive: 1,
      createdAt: NOW,
      updatedAt: NOW
    },
    {
      id: "user-admin-chen",
      username: "admin.chen",
      displayName: "Chen Admin",
      passwordHash: "disabled",
      role: "admin",
      disciplines: [],
      accessibleProjectIds: [],
      isActive: 1,
      createdAt: NOW,
      updatedAt: NOW
    }
  ],
  projects: [
    {
      id: "project-hd-lng",
      name: "Hudong LNG Carrier",
      code: "P-001",
      status: "active",
      owner: "MOL",
      shipyard: "Hudong-Zhonghua",
      class: "ABS",
      recipients: [],
      createdAt: NOW,
      updatedAt: NOW
    },
    {
      id: "project-cssc-series",
      name: "CSSC Containment Series",
      code: "P-002",
      status: "active",
      owner: "CSSC Leasing",
      shipyard: "Jiangnan",
      class: "DNV",
      recipients: [],
      createdAt: NOW,
      updatedAt: NOW
    }
  ],
  ships: [
    {
      id: "ship-h2748",
      projectId: "project-hd-lng",
      hullNumber: "H-2748",
      shipName: "NB2748",
      shipType: "LNG Carrier",
      status: "building",
      createdAt: NOW,
      updatedAt: NOW
    },
    {
      id: "ship-h2751",
      projectId: "project-cssc-series",
      hullNumber: "H-2751",
      shipName: "NB2751",
      shipType: "Containment Series",
      status: "building",
      createdAt: NOW,
      updatedAt: NOW
    }
  ],
  inspectionItems: [
    {
      id: "insp-002",
      shipId: "ship-h2748",
      itemName: "Cargo Tank Coating Final Check",
      itemNameNormalized: "cargo tank coating final check",
      discipline: "PAINT",
      workflowStatus: "open",
      lastRoundResult: "QCC",
      resolvedResult: null,
      currentRound: 1,
      openCommentsCount: 2,
      version: 3,
      source: "manual",
      createdAt: NOW,
      updatedAt: NOW
    },
    {
      id: "insp-003",
      shipId: "ship-h2751",
      itemName: "Containment Weld Visual Survey",
      itemNameNormalized: "containment weld visual survey",
      discipline: "CCS",
      workflowStatus: "open",
      lastRoundResult: "OWC",
      resolvedResult: null,
      currentRound: 2,
      openCommentsCount: 1,
      version: 5,
      source: "n8n",
      createdAt: NOW,
      updatedAt: NOW
    }
  ],
  inspectionRounds: [
    {
      id: "round-insp-002-r1",
      inspectionItemId: "insp-002",
      roundNumber: 1,
      rawItemName: "Cargo Tank Coating Final Check",
      plannedDate: (new Date().toLocaleDateString("en-CA")),
      actualDate: (new Date().toLocaleDateString("en-CA")),
      yardQc: "Li Si",
      result: "QCC",
      inspectedBy: "user-inspector-li",
      notes: "Touch-up required before close-out.",
      source: "manual",
      createdAt: NOW,
      updatedAt: NOW
    },
    {
      id: "round-insp-003-r1",
      inspectionItemId: "insp-003",
      roundNumber: 1,
      rawItemName: "Containment Weld Visual Survey",
      plannedDate: "2026-04-01",
      actualDate: "2026-04-01",
      yardQc: "Wang Wu",
      result: "OWC",
      inspectedBy: "user-inspector-wang",
      notes: "Initial welding repair requested.",
      source: "n8n",
      createdAt: "2026-04-01T08:00:00.000Z",
      updatedAt: "2026-04-01T08:00:00.000Z"
    },
    {
      id: "round-insp-003-r2",
      inspectionItemId: "insp-003",
      roundNumber: 2,
      rawItemName: "Containment Weld Visual Survey 2nd",
      plannedDate: (new Date().toLocaleDateString("en-CA")),
      actualDate: null,
      yardQc: "Wang Wu",
      result: null,
      inspectedBy: null,
      notes: null,
      source: "n8n",
      createdAt: NOW,
      updatedAt: NOW
    }
  ],
  comments: [
    {
      id: "comment-insp-002-1",
      localId: 1,
      inspectionItemId: "insp-002",
      createdInRoundId: "round-insp-002-r1",
      closedInRoundId: null,
      authorId: "user-inspector-li",
      content: "Stripe coat uneven at frame 54.",
      status: "open",
      closedBy: null,
      closedAt: null,
      createdAt: NOW,
      updatedAt: NOW
    },
    {
      id: "comment-insp-002-2",
      localId: 2,
      inspectionItemId: "insp-002",
      createdInRoundId: "round-insp-002-r1",
      closedInRoundId: null,
      authorId: "user-inspector-li",
      content: "Repair pinholes near lower hopper corner.",
      status: "open",
      closedBy: null,
      closedAt: null,
      createdAt: NOW,
      updatedAt: NOW
    },
    {
      id: "comment-insp-003-1",
      localId: 1,
      inspectionItemId: "insp-003",
      createdInRoundId: "round-insp-003-r1",
      closedInRoundId: null,
      authorId: "user-inspector-wang",
      content: "Reinspect weld repair after grinding and MT.",
      status: "open",
      closedBy: null,
      closedAt: null,
      createdAt: "2026-04-01T08:00:00.000Z",
      updatedAt: "2026-04-01T08:00:00.000Z"
    }
  ]
};

export class MockInspectionDatabase implements InspectionStorage {
  private data: InspectionStorageSnapshot;

  constructor(seed: InspectionStorageSnapshot = BASELINE_DATA) {
    this.data = cloneStorageSnapshot(seed);
  }

  async read(): Promise<InspectionStorageSnapshot> {
    return this.data;
  }

  async write(next: InspectionStorageSnapshot): Promise<void> {
    this.data = cloneStorageSnapshot(next);
  }

  async readUserById(id: string) {
    return this.data.users.find((user) => user.id === id) ?? null;
  }

  async readUserByUsername(username: string) {
    const normalizedUsername = username.trim().toLowerCase();

    return (
      this.data.users.find(
        (user) => user.username.trim().toLowerCase() === normalizedUsername
      ) ?? null
    );
  }

  async reset(seed: InspectionStorageSnapshot = BASELINE_DATA): Promise<void> {
    this.data = cloneStorageSnapshot(seed);
  }
}

export function createMockInspectionDatabase(seed?: InspectionStorageSnapshot): MockInspectionDatabase {
  return new MockInspectionDatabase(seed);
}

export function cloneStorageSnapshot(snapshot: InspectionStorageSnapshot): InspectionStorageSnapshot {
  return {
    users: snapshot.users.map((record) => ({
      ...record,
      disciplines: [...record.disciplines],
      accessibleProjectIds: [...record.accessibleProjectIds]
    })),
    projects: snapshot.projects.map((record) => ({ ...record, recipients: [...record.recipients] })),
    ships: snapshot.ships.map((record) => ({ ...record })),
    inspectionItems: snapshot.inspectionItems.map((record) => ({ ...record })),
    inspectionRounds: snapshot.inspectionRounds.map((record) => ({ ...record })),
    comments: snapshot.comments.map((record) => ({ ...record }))
  };
}

export function createBaselineInspectionStorage(): InspectionStorageSnapshot {
  return cloneStorageSnapshot(BASELINE_DATA);
}
