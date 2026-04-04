import type {
  InspectionItemComment,
  InspectionItemDetailResponse,
  InspectionRoundHistoryEntry
} from "./inspection-detail";

export const DISCIPLINES = [
  "HULL",
  "OUTFIT",
  "MACHINERY",
  "CHS",
  "ELEC",
  "PAINT",
  "CCS",
  "ENGINE",
  "CTNMT"
] as const;

export type Discipline = (typeof DISCIPLINES)[number];

export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  HULL: "HULL",
  OUTFIT: "OUTFIT",
  MACHINERY: "MACHINERY",
  CHS: "CHS",
  ELEC: "ELEC",
  PAINT: "PAINT",
  CCS: "CCS",
  ENGINE: "ENGINE",
  CTNMT: "CTNMT"
};

export const INSPECTION_RESULTS = ["CX", "AA", "QCC", "OWC", "RJ"] as const;
export type InspectionResult = (typeof INSPECTION_RESULTS)[number];

export const INSPECTION_RESULT_LABELS: Record<InspectionResult, string> = {
  CX: "CX",
  AA: "AA",
  QCC: "QCC",
  OWC: "OWC",
  RJ: "RJ"
};

export const WORKFLOW_STATUSES = [
  "pending",
  "open",
  "closed",
  "cancelled"
] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export const ROLES = ["admin", "manager", "reviewer", "inspector"] as const;
export type Role = (typeof ROLES)[number];

export interface InspectionListItem {
  id: string;
  projectCode: string;
  projectName: string;
  hullNumber: string;
  shipName: string;
  itemName: string;
  discipline: Discipline;
  plannedDate: string;
  yardQc: string;
  currentResult: InspectionResult | null;
  workflowStatus: WorkflowStatus;
  openComments: number;
  currentRound: number;
}

export interface DashboardSummary {
  pendingToday: number;
  completedToday: number;
  openComments: number;
  reinspectionQueue: number;
  projectProgress: number;
}

export interface DashboardSnapshot {
  generatedAt: string;
  summary: DashboardSummary;
  items: InspectionListItem[];
}

export * from "./inspection-detail.ts";

function countOpenComments(comments: InspectionItemComment[]): number {
  return comments.filter((comment) => comment.status === "open").length;
}

function buildRoundEntry(input: {
  id: string;
  roundNumber: number;
  actualDate: string | null;
  submittedResult: InspectionResult | null;
  submittedAt: string;
  submittedBy: string;
  inspectorDisplayName?: string;
  notes?: string | null;
  source?: "manual" | "n8n";
  commentIds: string[];
}): InspectionRoundHistoryEntry {
  return {
    id: input.id,
    roundNumber: input.roundNumber,
    actualDate: input.actualDate,
    submittedResult: input.submittedResult,
    submittedAt: input.submittedAt,
    submittedBy: input.submittedBy,
    inspectorDisplayName: input.inspectorDisplayName ?? input.submittedBy,
    notes: input.notes ?? null,
    source: input.source ?? "manual",
    commentIds: input.commentIds
  };
}

const MOCK_ITEMS: InspectionListItem[] = [
  {
    id: "insp-001",
    projectCode: "P-001",
    projectName: "Hudong LNG Carrier",
    hullNumber: "H-2748",
    shipName: "NB2748",
    itemName: "Main Engine Alignment",
    discipline: "MACHINERY",
    plannedDate: "2026-04-03",
    yardQc: "Zhang San",
    currentResult: null,
    workflowStatus: "pending",
    openComments: 0,
    currentRound: 1
  },
  {
    id: "insp-002",
    projectCode: "P-001",
    projectName: "Hudong LNG Carrier",
    hullNumber: "H-2748",
    shipName: "NB2748",
    itemName: "Cargo Tank Coating Final Check",
    discipline: "PAINT",
    plannedDate: "2026-04-03",
    yardQc: "Li Si",
    currentResult: "QCC",
    workflowStatus: "open",
    openComments: 2,
    currentRound: 1
  },
  {
    id: "insp-003",
    projectCode: "P-002",
    projectName: "CSSC Containment Series",
    hullNumber: "H-2751",
    shipName: "NB2751",
    itemName: "Containment Weld Visual Survey",
    discipline: "CCS",
    plannedDate: "2026-04-03",
    yardQc: "Wang Wu",
    currentResult: "OWC",
    workflowStatus: "open",
    openComments: 1,
    currentRound: 2
  },
  {
    id: "insp-004",
    projectCode: "P-002",
    projectName: "CSSC Containment Series",
    hullNumber: "H-2751",
    shipName: "NB2751",
    itemName: "Hull Block Fairing Review",
    discipline: "HULL",
    plannedDate: "2026-04-03",
    yardQc: "Zhao Liu",
    currentResult: "AA",
    workflowStatus: "closed",
    openComments: 0,
    currentRound: 1
  },
  {
    id: "insp-005",
    projectCode: "P-003",
    projectName: "Jiangnan Product Carrier",
    hullNumber: "H-2802",
    shipName: "NB2802",
    itemName: "Electrical Cable Penetration Seal",
    discipline: "ELEC",
    plannedDate: "2026-04-03",
    yardQc: "Chen Qi",
    currentResult: "RJ",
    workflowStatus: "open",
    openComments: 3,
    currentRound: 1
  }
];

const MOCK_INSPECTION_DETAILS: Record<string, InspectionItemDetailResponse> = {
  "insp-001": {
    id: "insp-001",
    projectCode: "P-001",
    projectName: "Hudong LNG Carrier",
    hullNumber: "H-2748",
    shipName: "NB2748",
    itemName: "Main Engine Alignment",
    discipline: "MACHINERY",
    source: "manual",
    yardQc: "Zhang San",
    plannedDate: "2026-04-03",
    actualDate: null,
    currentRound: 1,
    currentRoundId: "round-insp-001-r1",
    version: 1,
    workflowStatus: "pending",
    resolvedResult: null,
    lastRoundResult: null,
    openCommentCount: 0,
    pendingFinalAcceptance: false,
    waitingForNextRound: false,
    comments: [],
    roundHistory: []
  },
  "insp-002": {
    id: "insp-002",
    projectCode: "P-001",
    projectName: "Hudong LNG Carrier",
    hullNumber: "H-2748",
    shipName: "NB2748",
    itemName: "Cargo Tank Coating Final Check",
    discipline: "PAINT",
    source: "manual",
    yardQc: "Li Si",
    plannedDate: "2026-04-03",
    actualDate: "2026-04-03",
    currentRound: 1,
    currentRoundId: "round-insp-002-r1",
    version: 3,
    workflowStatus: "open",
    resolvedResult: null,
    lastRoundResult: "QCC",
    openCommentCount: 2,
    pendingFinalAcceptance: true,
    waitingForNextRound: false,
    comments: [
      {
        id: "insp-002-comment-1",
        roundNumber: 1,
        status: "open",
        message: "Stripe coat at nozzle edge needs one more touch-up.",
        createdAt: "2026-04-03T08:15:00.000Z",
        createdBy: "ABS Inspector Lin",
        resolvedAt: null,
        resolvedBy: null
      },
      {
        id: "insp-002-comment-2",
        roundNumber: 1,
        status: "open",
        message: "Holiday test record must be attached before final acceptance.",
        createdAt: "2026-04-03T08:19:00.000Z",
        createdBy: "ABS Inspector Lin",
        resolvedAt: null,
        resolvedBy: null
      }
    ],
    roundHistory: [
      buildRoundEntry({
        id: "insp-002-round-1",
        roundNumber: 1,
        actualDate: "2026-04-03",
        submittedResult: "QCC",
        submittedAt: "2026-04-03T08:20:00.000Z",
        submittedBy: "user-inspector-li",
        inspectorDisplayName: "ABS Inspector Lin",
        notes: "Touch-up required before close-out.",
        source: "manual",
        commentIds: ["insp-002-comment-1", "insp-002-comment-2"]
      })
    ]
  },
  "insp-003": {
    id: "insp-003",
    projectCode: "P-002",
    projectName: "CSSC Containment Series",
    hullNumber: "H-2751",
    shipName: "NB2751",
    itemName: "Containment Weld Visual Survey",
    discipline: "CCS",
    source: "n8n",
    yardQc: "Wang Wu",
    plannedDate: "2026-04-03",
    actualDate: null,
    currentRound: 2,
    currentRoundId: "round-insp-003-r2",
    version: 5,
    workflowStatus: "open",
    resolvedResult: null,
    lastRoundResult: "OWC",
    openCommentCount: 1,
    pendingFinalAcceptance: false,
    waitingForNextRound: true,
    comments: [
      {
        id: "insp-003-comment-1",
        roundNumber: 1,
        status: "closed",
        message: "Toe grinding required at frame 72 insert joint.",
        createdAt: "2026-04-02T09:05:00.000Z",
        createdBy: "Owner Rep Sun",
        resolvedAt: "2026-04-02T14:30:00.000Z",
        resolvedBy: "Yard QC Wang Wu"
      },
      {
        id: "insp-003-comment-2",
        roundNumber: 2,
        status: "open",
        message: "Reinspect after final MT result is uploaded.",
        createdAt: "2026-04-03T07:40:00.000Z",
        createdBy: "Owner Rep Sun",
        resolvedAt: null,
        resolvedBy: null
      }
    ],
    roundHistory: [
      buildRoundEntry({
        id: "insp-003-round-1",
        roundNumber: 1,
        actualDate: "2026-04-02",
        submittedResult: "QCC",
        submittedAt: "2026-04-02T09:00:00.000Z",
        submittedBy: "user-inspector-wang",
        inspectorDisplayName: "Owner Rep Sun",
        notes: "Initial pass with tracking note.",
        source: "n8n",
        commentIds: ["insp-003-comment-1"]
      }),
      buildRoundEntry({
        id: "insp-003-round-2",
        roundNumber: 2,
        actualDate: null,
        submittedResult: "OWC",
        submittedAt: "2026-04-03T07:45:00.000Z",
        submittedBy: "user-inspector-wang",
        inspectorDisplayName: "Owner Rep Sun",
        notes: "Waiting for MT upload.",
        source: "n8n",
        commentIds: ["insp-003-comment-2"]
      })
    ]
  },
  "insp-004": {
    id: "insp-004",
    projectCode: "P-002",
    projectName: "CSSC Containment Series",
    hullNumber: "H-2751",
    shipName: "NB2751",
    itemName: "Hull Block Fairing Review",
    discipline: "HULL",
    source: "manual",
    yardQc: "Zhao Liu",
    plannedDate: "2026-04-03",
    actualDate: "2026-04-03",
    currentRound: 1,
    currentRoundId: "round-insp-004-r1",
    version: 1,
    workflowStatus: "closed",
    resolvedResult: "AA",
    lastRoundResult: "AA",
    openCommentCount: 0,
    pendingFinalAcceptance: false,
    waitingForNextRound: false,
    comments: [],
    roundHistory: [
      buildRoundEntry({
        id: "insp-004-round-1",
        roundNumber: 1,
        actualDate: "2026-04-03",
        submittedResult: "AA",
        submittedAt: "2026-04-03T09:30:00.000Z",
        submittedBy: "user-inspector-luo",
        inspectorDisplayName: "Class Surveyor Luo",
        notes: null,
        source: "manual",
        commentIds: []
      })
    ]
  },
  "insp-005": {
    id: "insp-005",
    projectCode: "P-003",
    projectName: "Jiangnan Product Carrier",
    hullNumber: "H-2802",
    shipName: "NB2802",
    itemName: "Electrical Cable Penetration Seal",
    discipline: "ELEC",
    source: "manual",
    yardQc: "Chen Qi",
    plannedDate: "2026-04-03",
    actualDate: "2026-04-03",
    currentRound: 1,
    currentRoundId: "round-insp-005-r1",
    version: 2,
    workflowStatus: "open",
    resolvedResult: null,
    lastRoundResult: "RJ",
    openCommentCount: 3,
    pendingFinalAcceptance: false,
    waitingForNextRound: true,
    comments: [
      {
        id: "insp-005-comment-1",
        roundNumber: 1,
        status: "open",
        message: "Sealant coverage incomplete at upper penetration edge.",
        createdAt: "2026-04-03T06:55:00.000Z",
        createdBy: "Class Surveyor Hu",
        resolvedAt: null,
        resolvedBy: null
      },
      {
        id: "insp-005-comment-2",
        roundNumber: 1,
        status: "open",
        message: "Firestop batch certificate missing from package.",
        createdAt: "2026-04-03T07:00:00.000Z",
        createdBy: "Class Surveyor Hu",
        resolvedAt: null,
        resolvedBy: null
      },
      {
        id: "insp-005-comment-3",
        roundNumber: 1,
        status: "open",
        message: "Cable tray support spacing exceeds approved drawing.",
        createdAt: "2026-04-03T07:04:00.000Z",
        createdBy: "Class Surveyor Hu",
        resolvedAt: null,
        resolvedBy: null
      }
    ],
    roundHistory: [
      buildRoundEntry({
        id: "insp-005-round-1",
        roundNumber: 1,
        actualDate: "2026-04-03",
        submittedResult: "RJ",
        submittedAt: "2026-04-03T07:05:00.000Z",
        submittedBy: "user-inspector-hu",
        inspectorDisplayName: "Class Surveyor Hu",
        notes: "Rework required before reinspection.",
        source: "manual",
        commentIds: [
          "insp-005-comment-1",
          "insp-005-comment-2",
          "insp-005-comment-3"
        ]
      })
    ]
  }
};

const ITEM_DICTS: Record<string, string[]> = {
  HULL: ["Block Assembly Verification", "Weld Visual Check", "NDT Setup Joint Survey", "Hull Deflection Measurement", "Tank Tightness Test", "Erection Joint Fit-up"],
  OUTFIT: ["Cabin Furnishing Inspection", "Handrail Installation Check", "Deck Equipment Foundation", "Mooring Fitting Test", "Galley Equipment Trial"],
  MACHINERY: ["Main Engine Shaft Alignment", "Auxiliary Pump Pressure Test", "Steering Gear Sea Trial", "Lube Oil Piping Flush", "Propeller Clearance Check", "Boiler Visual Inspection"],
  CHS: ["Cargo Pump Dry Run", "Manifold Piping Pressure Test", "Heating Coil Test", "Inert Gas Generator Trial", "Cargo Tank Calibration"],
  ELEC: ["Cable Tray Routing", "Main Switchboard Insulation", "Fire Alarm Loop Test", "Navigational Equipment Check", "Battery Charger Load Test", "Emergency Lighting Trial"],
  PAINT: ["Surface Preparation Check", "Primer Coat Thickness", "Final Coat Wet Film", "Anti-fouling Painting Survey", "Stripe Coating Touch-up"],
  CCS: ["Containment Membrane Leak Test", "Insulation Box Bonding check", "Secondary Barrier Leak Test", "Weld Seam PT", "Gas Trial Preparation"]
};

const DYNAMIC_ITEMS: InspectionListItem[] = [];
const DYNAMIC_DETAILS: Record<string, InspectionItemDetailResponse> = {};

for (let index = 0; index < 30; index++) {
  const i = index + 6;
  const id = `insp-00${i > 9 ? i : `0${i}`}`;
  
  const discipline = DISCIPLINES[Math.floor(Math.random() * DISCIPLINES.length)];
  const disciplineItems = ITEM_DICTS[discipline] || ["General Check"];
  const itemName = disciplineItems[Math.floor(Math.random() * disciplineItems.length)];
  
  const randRound = Math.random();
  const currentRound = randRound < 0.7 ? 1 : (randRound < 0.9 ? 2 : 3);
  
  const isPending = Math.random() < 0.4;
  const currentResult = isPending ? null : INSPECTION_RESULTS[Math.floor(Math.random() * INSPECTION_RESULTS.length)];
  
  const today = new Date().toLocaleDateString("en-CA");
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("en-CA");
  const theDayBefore = new Date(Date.now() - 2 * 86400000).toLocaleDateString("en-CA");
  
  const workflowStatus = isPending ? "pending" : (currentResult === "AA" || currentResult === "CX" ? "closed" : "open");
  
  const listItem: InspectionListItem = {
    id,
    projectCode: "P-001",
    projectName: "NBINS Carrier Fleet",
    hullNumber: `H-${2740 + (i % 5)}`,
    shipName: `NB${2740 + (i % 5)}`,
    itemName,
    discipline,
    plannedDate: today,
    yardQc: "QC Staff " + i,
    currentResult,
    workflowStatus,
    openComments: 0,
    currentRound
  };

  const roundHistory = [];
  const comments = [];
  
  if (currentRound > 1) {
     const c1Id = `${id}-comment-r1-1`;
     comments.push({
        id: c1Id,
        roundNumber: 1,
        status: "open" as const,
        message: "Defect found in previous round. Critical rectification required.",
        createdAt: new Date(Date.now() - 90000000).toISOString(),
        createdBy: "System Alert",
        resolvedAt: null,
        resolvedBy: null
     });
     roundHistory.push(buildRoundEntry({
        id: `${id}-round-1`,
        roundNumber: 1,
        actualDate: yesterday,
        submittedResult: "RJ" as any,
        submittedAt: new Date(Date.now() - 86400000).toISOString(),
        submittedBy: "sys-user",
        inspectorDisplayName: "Past Surveyor",
        notes: "Failed in first attempt.",
        source: "manual",
        commentIds: [c1Id]
     }));
  }
  
  if (currentRound > 2) {
     const c2Id = `${id}-comment-r2-1`;
     comments.push({
        id: c2Id,
        roundNumber: 2,
        status: "open" as const,
        message: "Still not complying with standards.",
        createdAt: new Date(Date.now() - 50000000).toISOString(),
        createdBy: "System Alert",
        resolvedAt: null,
        resolvedBy: null
     });
     roundHistory.push(buildRoundEntry({
        id: `${id}-round-2`,
        roundNumber: 2,
        actualDate: theDayBefore,
        submittedResult: "OWC" as any,
        submittedAt: new Date(Date.now() - 40000000).toISOString(),
        submittedBy: "sys-user",
        inspectorDisplayName: "Past Surveyor",
        notes: "Second attempt failed.",
        source: "manual",
        commentIds: [c2Id]
     }));
  }
  
  if (!isPending && currentResult) {
     const c3Id = `${id}-comment-rc-${currentRound}`;
     if (currentResult === 'RJ' || currentResult === 'OWC' || currentResult === 'QCC') {
        comments.push({
          id: c3Id,
          roundNumber: currentRound,
          status: "open" as const,
          message: `Issued from round ${currentRound}. Needs immediate attention.`,
          createdAt: new Date().toISOString(),
          createdBy: "Active Inspector",
          resolvedAt: null,
          resolvedBy: null
        });
     }
     roundHistory.push(buildRoundEntry({
        id: `${id}-round-${currentRound}`,
        roundNumber: currentRound,
        actualDate: today,
        submittedResult: currentResult as any,
        submittedAt: new Date().toISOString(),
        submittedBy: "sys-user",
        inspectorDisplayName: "Current Auth",
        notes: "Latest action recorded.",
        source: "manual",
        commentIds: (currentResult === 'RJ' || currentResult === 'OWC' || currentResult === 'QCC') ? [c3Id] : []
     }));
  }

  listItem.openComments = comments.filter(c => c.status === 'open').length;
  DYNAMIC_ITEMS.push(listItem);

  DYNAMIC_DETAILS[id] = {
    id: listItem.id,
    projectCode: listItem.projectCode,
    projectName: listItem.projectName,
    hullNumber: listItem.hullNumber,
    shipName: listItem.shipName,
    itemName: listItem.itemName,
    discipline: listItem.discipline,
    source: "manual",
    yardQc: listItem.yardQc,
    plannedDate: listItem.plannedDate,
    actualDate: isPending ? null : listItem.plannedDate,
    currentRound: listItem.currentRound,
    currentRoundId: `round-${listItem.id}-r${listItem.currentRound}`,
    version: 1,
    workflowStatus: listItem.workflowStatus,
    resolvedResult: listItem.workflowStatus === "closed" ? "AA" : null,
    lastRoundResult: currentResult,
    openCommentCount: listItem.openComments,
    pendingFinalAcceptance: currentResult === "QCC",
    waitingForNextRound: currentResult === "OWC" || currentResult === "RJ",
    comments: comments, 
    roundHistory: roundHistory
  };
}

export const ALL_MOCK_ITEMS = [...MOCK_ITEMS, ...DYNAMIC_ITEMS];
export const ALL_MOCK_DETAILS = { ...MOCK_INSPECTION_DETAILS, ...DYNAMIC_DETAILS };

export function createMockDashboardSnapshot(): DashboardSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      pendingToday: ALL_MOCK_ITEMS.filter((item) => item.workflowStatus === "pending").length,
      completedToday: ALL_MOCK_ITEMS.filter((item) => item.currentResult === "AA").length,
      openComments: ALL_MOCK_ITEMS.reduce((count, item) => count + item.openComments, 0),
      reinspectionQueue: ALL_MOCK_ITEMS.filter((item) => item.currentResult === "OWC" || item.currentResult === "RJ").length,
      projectProgress: 68
    },
    items: ALL_MOCK_ITEMS
  };
}

export function createMockInspectionDetails(): Record<string, InspectionItemDetailResponse> {
  return Object.fromEntries(
    Object.entries(ALL_MOCK_DETAILS).map(([id, detail]) => [
      id,
      {
        ...detail,
        comments: detail.comments.map((comment) => ({ ...comment })),
        roundHistory: detail.roundHistory.map((entry) => ({
          ...entry,
          commentIds: [...entry.commentIds]
        }))
      }
    ])
  );
}

export function createMockInspectionDetail(
  id: string
): InspectionItemDetailResponse | null {
  return createMockInspectionDetails()[id] ?? null;
}

export function syncListItemWithDetail(
  item: InspectionListItem,
  detail: InspectionItemDetailResponse
): InspectionListItem {
  return {
    ...item,
    currentResult: detail.resolvedResult ?? detail.lastRoundResult,
    workflowStatus: detail.workflowStatus,
    openComments: countOpenComments(detail.comments),
    currentRound: detail.currentRound
  };
}
