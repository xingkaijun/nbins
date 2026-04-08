import test from "node:test";
import assert from "node:assert/strict";
import { ProjectMembershipRepository } from "../repositories/project-membership-repository.ts";
import { ProjectAuthorizationService } from "./project-authorization-service.ts";

test("ProjectAuthorizationService resolves allowed project ids from narrow membership reads", async () => {
  const storage = {
    async readProjectMembersByUserId(userId) {
      return [
        {
          id: "member-li-p1",
          projectId: "project-hd-lng",
          userId: "user-inspector-li",
          createdAt: "2026-04-03T09:00:00.000Z",
          updatedAt: "2026-04-03T09:00:00.000Z"
        }
      ].filter((member) => member.userId === userId);
    }
  };
  const service = new ProjectAuthorizationService(new ProjectMembershipRepository(storage));

  assert.deepEqual(
    await service.getAllowedProjectIds("user-inspector-li"),
    ["project-hd-lng"]
  );
  assert.deepEqual(await service.getAllowedProjectIds("missing-user"), []);
});

test("ProjectAuthorizationService falls back to snapshot membership reads", async () => {
  const storage = {
    async read() {
      return {
        users: [],
        projects: [],
        projectMembers: [
          {
            id: "member-li-p1",
            projectId: "project-hd-lng",
            userId: "user-inspector-li",
            createdAt: "2026-04-03T09:00:00.000Z",
            updatedAt: "2026-04-03T09:00:00.000Z"
          },
          {
            id: "member-li-p2",
            projectId: "project-cssc-series",
            userId: "user-inspector-li",
            createdAt: "2026-04-03T09:00:00.000Z",
            updatedAt: "2026-04-03T09:00:00.000Z"
          }
        ],
        ships: [],
        inspectionItems: [],
        inspectionRounds: [],
        comments: []
      };
    },
    async write() {}
  };

  const service = new ProjectAuthorizationService(new ProjectMembershipRepository(storage));

  assert.deepEqual(
    await service.getAllowedProjectIds("user-inspector-li"),
    ["project-hd-lng", "project-cssc-series"]
  );
});
