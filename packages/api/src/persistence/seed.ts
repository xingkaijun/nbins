import { createBaselineInspectionStorage } from "./mock-inspection-db.ts";
import type { InspectionStorageSnapshot } from "./records.ts";
import { ALL_MOCK_DETAILS } from "@nbins/shared";

export function createSeedInspectionStorageSnapshot(): InspectionStorageSnapshot {
  const snapshot = createBaselineInspectionStorage();

  // 把所有自动生成的 shared 测试数据转换注入为 D1 种子数据库结构
  for (const detail of Object.values(ALL_MOCK_DETAILS)) {
    // 防止和原有 mock 数据冲突
    if (snapshot.inspectionItems.find(i => i.id === detail.id)) {
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
            recipients: [],
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
    for (const comment of detail.comments) {
        snapshot.comments.push({
            id: comment.id,
            inspectionItemId: detail.id,
            createdInRoundId: `${detail.id}-round-${comment.roundNumber}`,
            closedInRoundId: comment.status === "closed" ? `${detail.id}-round-${detail.currentRound}` : null,
            authorId: "sys-user",
            content: comment.message,
            status: comment.status,
            closedBy: comment.resolvedBy,
            closedAt: comment.resolvedAt,
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
        passwordHash: "dev-only",
        role: "inspector",
        disciplines: [],
        isActive: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      knownUserIds.add(uid);
    }
  }

  return snapshot;
}
