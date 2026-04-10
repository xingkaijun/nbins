import type { AuthenticatedUser } from "../auth.ts";
import type { InspectionStorage } from "../persistence/inspection-storage.ts";
import { ProjectMembershipRepository } from "../repositories/project-membership-repository.ts";
import { ProjectAuthorizationService } from "./project-authorization-service.ts";

export async function resolveAllowedProjectIdsForAuthUser(
  storage: InspectionStorage,
  authUser: AuthenticatedUser
): Promise<string[]> {
  // P1: admin 角色可见所有项目，跳过成员关系过滤
  if (authUser.role === "admin") {
    const snapshot = await storage.read();
    return snapshot.projects.map((project) => project.id);
  }

  const authorization = new ProjectAuthorizationService(
    new ProjectMembershipRepository(storage)
  );

  return authorization.getAllowedProjectIds(authUser.id);
}
