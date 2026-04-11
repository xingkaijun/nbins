import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

const PROJECT_STORAGE_KEY = "nbins.selectedProjectId";

interface ProjectContextValue {
  selectedProjectId: string;
  setSelectedProjectId: (projectId: string) => void;
  clearSelectedProjectId: () => void;
}

interface ProjectLike {
  id: string;
  status?: string | null;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function readStoredProjectId(): string {
  return getStorage()?.getItem(PROJECT_STORAGE_KEY)?.trim() ?? "";
}

function persistProjectId(projectId: string): void {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  if (projectId) {
    storage.setItem(PROJECT_STORAGE_KEY, projectId);
    return;
  }

  storage.removeItem(PROJECT_STORAGE_KEY);
}

export function resolveAvailableProjectId<T extends ProjectLike>(
  projects: T[],
  currentProjectId: string
): string {
  const currentProject = projects.find((project) => project.id === currentProjectId);

  if (currentProject && currentProject.status !== "archived") {
    return currentProject.id;
  }

  const firstActiveProject = projects.find((project) => project.status !== "archived");
  return firstActiveProject?.id ?? projects[0]?.id ?? "";
}

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [selectedProjectId, setSelectedProjectIdState] = useState<string>(() => readStoredProjectId());

  const setSelectedProjectId = useCallback((projectId: string) => {
    const normalizedProjectId = projectId.trim();
    setSelectedProjectIdState(normalizedProjectId);
    persistProjectId(normalizedProjectId);
  }, []);

  const clearSelectedProjectId = useCallback(() => {
    setSelectedProjectIdState("");
    persistProjectId("");
  }, []);

  const value = useMemo<ProjectContextValue>(
    () => ({
      selectedProjectId,
      setSelectedProjectId,
      clearSelectedProjectId
    }),
    [clearSelectedProjectId, selectedProjectId, setSelectedProjectId]
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProjectContext(): ProjectContextValue {
  const value = useContext(ProjectContext);

  if (!value) {
    throw new Error("useProjectContext must be used within ProjectProvider");
  }

  return value;
}
