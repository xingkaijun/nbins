import type {
  DashboardSnapshot,
  InspectionItemDetailResponse,
  SubmitInspectionResultRequest,
  SubmitInspectionResultResponse
} from "@nbins/shared";
import { InspectionRepository } from "../repositories/inspection-repository.ts";

export class InspectionService {
  private readonly repository: InspectionRepository;

  constructor(repository: InspectionRepository) {
    this.repository = repository;
  }

  listInspections(allowedProjectIds?: string[]): Promise<DashboardSnapshot> {
    return this.repository.listInspections(allowedProjectIds);
  }

  readInspectionItemDetail(
    inspectionItemId: string,
    allowedProjectIds?: string[]
  ): Promise<InspectionItemDetailResponse | null> {
    return this.repository.getInspectionDetail(inspectionItemId, allowedProjectIds);
  }

  submitInspectionResult(
    inspectionItemId: string,
    request: SubmitInspectionResultRequest
  ): Promise<SubmitInspectionResultResponse> {
    assertValidSubmitInspectionResultRequest(request);
    return this.repository.submitCurrentRoundResult(inspectionItemId, request);
  }

  resolveComment(
    inspectionItemId: string,
    commentId: string,
    request: { resolvedBy: string; expectedVersion: number }
  ): Promise<InspectionItemDetailResponse> {
    if (!request.resolvedBy.trim()) {
      throw new Error("resolvedBy is required");
    }
    return this.repository.resolveComment(inspectionItemId, commentId, request);
  }
}

function assertValidSubmitInspectionResultRequest(
  request: SubmitInspectionResultRequest
): void {
  if (!request.submittedBy.trim()) {
    throw new Error("submittedBy is required");
  }

  if (!Number.isInteger(request.expectedVersion) || request.expectedVersion < 1) {
    throw new Error("expectedVersion must be a positive integer");
  }

  if (request.actualDate !== null && !request.actualDate.trim()) {
    throw new Error("actualDate must be null or a non-empty date string");
  }

  for (const comment of request.comments ?? []) {
    if (!comment.message.trim()) {
      throw new Error("comments must include a non-empty message");
    }
  }
}
