import { ProjectMembershipRepository } from "../repositories/project-membership-repository.ts";

export class ProjectAuthorizationService {
  private readonly memberships: ProjectMembershipRepository;

  constructor(memberships: ProjectMembershipRepository) {
    this.memberships = memberships;
  }

  async getAllowedProjectIds(userId: string): Promise<string[]> {
    return this.memberships.findAllowedProjectIdsByUserId(userId);
  }
}
