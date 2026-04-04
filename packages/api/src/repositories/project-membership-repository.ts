import type { InspectionStorage } from "../persistence/inspection-storage.ts";

export class ProjectMembershipRepository {
  private readonly storage: InspectionStorage;

  constructor(storage: InspectionStorage) {
    this.storage = storage;
  }

  async findAllowedProjectIdsByUserId(userId: string): Promise<string[]> {
    if (this.storage.readProjectMembersByUserId) {
      const memberships = await this.storage.readProjectMembersByUserId(userId);
      return memberships.map((membership) => membership.projectId);
    }

    const snapshot = await this.storage.read();
    return snapshot.projectMembers
      .filter((membership) => membership.userId === userId)
      .map((membership) => membership.projectId);
  }
}
