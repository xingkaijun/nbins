import type { CreateFatRequest, FatItemResponse, UpdateFatRequest } from "@nbins/shared";
import { requestJson, withQuery } from "./client";
import type { FatListFilters } from "./types";

export async function fetchFatList(filters?: FatListFilters): Promise<FatItemResponse[]> {
  return requestJson<FatItemResponse[]>(withQuery("/fats", {
    projectId: filters?.projectId,
    shipId: filters?.shipId,
    keyword: filters?.keyword
  }));
}

export async function fetchFatById(fatId: string): Promise<FatItemResponse> {
  return requestJson<FatItemResponse>(`/fats/${fatId}`);
}

export async function fetchNextFatSerial(shipId: string): Promise<{ serial: number; formatted: string }> {
  const encodedShipId = encodeURIComponent(shipId);
  return requestJson<{ serial: number; formatted: string }>(`/fats/meta/next-serial?shipId=${encodedShipId}`);
}

export async function createFat(shipId: string, data: CreateFatRequest): Promise<FatItemResponse> {
  return requestJson<FatItemResponse>(`/fats/ships/${shipId}`, {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export async function updateFat(fatId: string, data: UpdateFatRequest): Promise<FatItemResponse> {
  return requestJson<FatItemResponse>(`/fats/${fatId}`, {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

export async function deleteFat(fatId: string): Promise<void> {
  await requestJson<{ deleted: boolean }>(`/fats/${fatId}`, {
    method: "DELETE"
  });
}
