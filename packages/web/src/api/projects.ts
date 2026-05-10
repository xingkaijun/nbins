import { requestJson, withQuery } from "./client";
import type { ProjectRecord } from "./types";

export async function fetchProjects(status?: ProjectRecord["status"]): Promise<ProjectRecord[]> {
  return requestJson<ProjectRecord[]>(withQuery("/projects", { status }));
}

export async function fetchProject(projectId: string): Promise<ProjectRecord> {
  return requestJson<ProjectRecord>(`/projects/${projectId}`);
}

export async function createProject(data: {
  name: string;
  code: string;
  owner?: string;
  shipyard?: string;
  class?: string;
  disciplines?: string[];
  reportRecipients?: string[];
  ncrRecipients?: string[];
}): Promise<ProjectRecord> {
  return requestJson<ProjectRecord>("/projects", {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export async function updateProject(
  projectId: string,
  data: Partial<Pick<ProjectRecord, "name" | "code" | "status" | "owner" | "shipyard" | "class" | "disciplines" | "reportRecipients" | "ncrRecipients">>
): Promise<{ id: string; updatedAt: string }> {
  return requestJson<{ id: string; updatedAt: string }>(`/projects/${projectId}`, {
    method: "PUT",
    body: JSON.stringify(data)
  });
}
