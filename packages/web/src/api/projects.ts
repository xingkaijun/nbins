import { requestJson, withQuery } from "./client";
import type { ProjectRecord } from "./types";
import { getAuthToken } from "../auth";
import { createRequestCache, projectsCacheKey } from "../request-cache";

// The project list is read by several components on every page load (project
// context, top bar, pages). Share one request per user and status; refresh
// after 30 s or as soon as a project is created or changed.
const projectsCache = createRequestCache({ ttlMs: 30_000 });

export function invalidateProjectsCache(): void {
  projectsCache.invalidate();
}

export async function fetchProjects(status?: ProjectRecord["status"]): Promise<ProjectRecord[]> {
  const key = projectsCacheKey(getAuthToken(), status);
  return projectsCache.get(key, () => requestJson<ProjectRecord[]>(withQuery("/projects", { status })));
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
  try {
    return await requestJson<ProjectRecord>("/projects", {
      method: "POST",
      body: JSON.stringify(data)
    });
  } finally {
    invalidateProjectsCache();
  }
}

export async function updateProject(
  projectId: string,
  data: Partial<Pick<ProjectRecord, "name" | "code" | "status" | "owner" | "shipyard" | "class" | "disciplines" | "reportRecipients" | "ncrRecipients">>
): Promise<{ id: string; updatedAt: string }> {
  try {
    return await requestJson<{ id: string; updatedAt: string }>(`/projects/${projectId}`, {
      method: "PUT",
      body: JSON.stringify(data)
    });
  } finally {
    invalidateProjectsCache();
  }
}
