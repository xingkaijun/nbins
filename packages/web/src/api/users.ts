import type { Discipline, Role } from "@nbins/shared";
import { requestJson, withQuery } from "./client";
import type { UserRecord } from "./types";

export async function fetchUsers(filters?: {
  role?: Role;
  isActive?: "true" | "false";
}): Promise<UserRecord[]> {
  return requestJson<UserRecord[]>(withQuery("/users", filters ?? {}));
}

export async function createUser(data: {
  username: string;
  displayName: string;
  password: string;
  role: Role;
  title?: string;
  disciplines?: Discipline[];
  accessibleProjectIds?: string[];
}): Promise<UserRecord> {
  return requestJson<UserRecord>("/users", {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export async function updateUser(
  userId: string,
  data: Partial<Pick<UserRecord, "username" | "displayName" | "role" | "title" | "disciplines" | "accessibleProjectIds">> & {
    isActive?: boolean;
  }
): Promise<{ id: string; updatedAt: string }> {
  return requestJson<{ id: string; updatedAt: string }>(`/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

export async function updateUserPassword(
  userId: string,
  password: string
): Promise<{ id: string; updatedAt: string }> {
  return requestJson<{ id: string; updatedAt: string }>(`/users/${userId}/password`, {
    method: "PUT",
    body: JSON.stringify({ password })
  });
}

export async function deleteUser(userId: string): Promise<void> {
  await requestJson<unknown>(`/users/${userId}`, { method: "DELETE" });
}
