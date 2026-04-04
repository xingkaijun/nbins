import type { AuthenticatedUser } from "../auth.ts";
import type { InspectionStorage } from "../persistence/inspection-storage.ts";
import { ProjectMembershipRepository } from "../repositories/project-membership-repository.ts";
import { ProjectAuthorizationService } from "./project-authorization-service.ts";

export async function resolveAllowedProjectIdsForAuthUser(
  storage: InspectionStorage,
  authUser: AuthenticatedUser
): Promise<string[]> {
  const authorization = new ProjectAuthorizationService(
    new ProjectMembershipRepository(storage)
  );

  return authorization.getAllowedProjectIds(authUser.id);
}
