import type {
  InspectionItemComment,
  InspectionItemDetailResponse,
  InspectionRoundHistoryEntry
} from "@nbins/shared";
import { resolveInspectionItemState } from "../domain/inspection-item-state.ts";
import type {
  CommentRecord,
  InspectionItemRecord,
  InspectionRoundRecord,
  InspectionStorageSnapshot,
  ProjectRecord,
  ShipRecord,
  UserRecord
} from "../persistence/records.ts";

export interface InspectionDetailQueryResult {
  item: InspectionItemRecord;
  ship: ShipRecord;
  project: ProjectRecord;
  rounds: InspectionRoundRecord[];
  comments: CommentRecord[];
  users: UserRecord[];
}

export function selectInspectionDetailRecord(
  storage: InspectionStorageSnapshot,
  inspectionItemId: string
): InspectionDetailQueryResult | null {
  const item = storage.inspectionItems.find((record) => record.id === inspectionItemId);

  if (!item) {
    return null;
  }

  const ship = storage.ships.find((record) => record.id === item.shipId);
  if (!ship) {
    throw new Error(`Ship not found for inspection item ${inspectionItemId}`);
  }

  const project = storage.projects.find((record) => record.id === ship.projectId);
  if (!project) {
    throw new Error(`Project not found for inspection item ${inspectionItemId}`);
  }

  return {
    item,
    ship,
    project,
    rounds: storage.inspectionRounds
      .filter((record) => record.inspectionItemId === inspectionItemId)
      .sort((left, right) => left.roundNumber - right.roundNumber),
    comments: storage.comments
      .filter((record) => record.inspectionItemId === inspectionItemId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    users: storage.users
  };
}

export function mapInspectionDetailFromStorage(
  result: InspectionDetailQueryResult
): InspectionItemDetailResponse {
  const state = resolveInspectionItemState({
    latestSubmittedResult: result.item.lastRoundResult,
    openCommentCount: countOpenComments(result.comments)
  });

  const currentRound = result.rounds.find(
    (record) => record.roundNumber === result.item.currentRound
  );

  if (!currentRound) {
    throw new Error(`Current round ${result.item.currentRound} not found for ${result.item.id}`);
  }

  return {
    id: result.item.id,
    projectCode: result.project.code,
    projectName: result.project.name,
    projectOwner: result.project.owner,
    projectShipyard: result.project.shipyard,
    projectClass: result.project.class,
    hullNumber: result.ship.hullNumber,
    shipName: result.ship.shipName,
    itemName: result.item.itemName,
    discipline: result.item.discipline,
    source: result.item.source,
    yardQc: currentRound.yardQc ?? "",
    plannedDate: currentRound.plannedDate,
    actualDate: currentRound.actualDate,
    currentRound: result.item.currentRound,
    currentRoundId: currentRound.id,
    version: result.item.version,
    workflowStatus: state.workflowStatus,
    resolvedResult: state.resolvedResult,
    lastRoundResult: state.lastRoundResult,
    openCommentCount: state.openCommentCount,
    pendingFinalAcceptance: state.pendingFinalAcceptance,
    waitingForNextRound: state.waitingForNextRound,
    comments: result.comments.map((record) =>
      mapCommentRecord(record, result.rounds, result.users)
    ),
    roundHistory: result.rounds.map((record) =>
      mapRoundRecord(record, result.comments, result.users)
    )
  };
}

function mapCommentRecord(
  record: CommentRecord,
  rounds: InspectionRoundRecord[],
  users: UserRecord[]
): InspectionItemComment {
  const createdRound = rounds.find((round) => round.id === record.createdInRoundId);
  const createdBy = users.find((user) => user.id === record.authorId);
  const closedBy = record.closedBy
    ? users.find((user) => user.id === record.closedBy) ?? null
    : null;

  if (!createdRound) {
    throw new Error(`Comment ${record.id} references missing round ${record.createdInRoundId}`);
  }

  return {
    id: record.id,
    localId: record.localId,
    roundNumber: createdRound.roundNumber,
    status: record.status,
    message: record.content,
    createdAt: record.createdAt,
    createdBy: createdBy?.displayName ?? record.authorId,
    resolvedAt: record.closedAt,
    resolvedBy: closedBy?.displayName ?? record.closedBy
  };
}

function mapRoundRecord(
  record: InspectionRoundRecord,
  comments: CommentRecord[],
  users: UserRecord[]
): InspectionRoundHistoryEntry {
  const inspectedBy = record.inspectedBy
    ? users.find((user) => user.id === record.inspectedBy) ?? null
    : null;

  return {
    id: record.id,
    roundNumber: record.roundNumber,
    actualDate: record.actualDate,
    submittedResult: record.result,
    submittedAt: record.updatedAt,
    submittedBy: record.inspectedBy ?? "",
    inspectorDisplayName: inspectedBy?.displayName ?? "",
    notes: record.notes,
    source: record.source,
    commentIds: comments
      .filter((comment) => comment.createdInRoundId === record.id)
      .map((comment) => comment.id)
  };
}

function countOpenComments(comments: CommentRecord[]): number {
  return comments.filter((record) => record.status === "open").length;
}
