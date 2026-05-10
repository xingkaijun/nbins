import { requestJson, withQuery } from "./client";
import type { ShipRecord } from "./types";

export async function fetchShips(projectId?: string, status?: ShipRecord["status"]): Promise<ShipRecord[]> {
  return requestJson<ShipRecord[]>(withQuery("/ships", { projectId, status }));
}

export async function createShip(data: {
  projectId: string;
  hullNumber: string;
  shipName: string;
  shipType?: string;
}): Promise<ShipRecord> {
  return requestJson<ShipRecord>("/ships", {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export async function updateShip(
  shipId: string,
  data: Partial<Pick<ShipRecord, "projectId" | "hullNumber" | "shipName" | "shipType" | "status">>
): Promise<{ id: string; updatedAt: string }> {
  return requestJson<{ id: string; updatedAt: string }>(`/ships/${shipId}`, {
    method: "PUT",
    body: JSON.stringify(data)
  });
}
