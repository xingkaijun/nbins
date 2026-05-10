import type { ApproveNcrRequest, CreateNcrRequest, NcrItemResponse, NcrPdfMeta, NcrRelatedFile, UpdateNcrRequest } from "@nbins/shared";
import { requestBlob, requestJson, withQuery } from "./client";
import type { NcrListFilters } from "./types";

export async function fetchNcrList(filters?: NcrListFilters): Promise<NcrItemResponse[]> {
  return requestJson<NcrItemResponse[]>(withQuery("/ncrs", {
    projectId: filters?.projectId,
    shipId: filters?.shipId,
    status: filters?.status,
    keyword: filters?.keyword
  }));
}

export async function fetchNcrs(shipId: string): Promise<NcrItemResponse[]> {
  return requestJson<NcrItemResponse[]>(`/ncrs/ships/${shipId}`);
}

export async function fetchNcrById(ncrId: string): Promise<NcrItemResponse> {
  return requestJson<NcrItemResponse>(`/ncrs/${ncrId}`);
}

export async function fetchNextNcrSerial(shipId: string): Promise<{ serial: number; formatted: string }> {
  const encodedShipId = encodeURIComponent(shipId);

  try {
    return await requestJson<{ serial: number; formatted: string }>(`/ncrs/meta/next-serial?shipId=${encodedShipId}`);
  } catch (error: any) {
    if (error?.status === 404) {
      return requestJson<{ serial: number; formatted: string }>(`/ncrs/next-serial?shipId=${encodedShipId}`);
    }
    throw error;
  }
}

export async function createNcr(shipId: string, data: CreateNcrRequest): Promise<NcrItemResponse> {
  return requestJson<NcrItemResponse>(`/ncrs/ships/${shipId}`, {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export async function updateNcr(ncrId: string, data: UpdateNcrRequest): Promise<NcrItemResponse> {
  return requestJson<NcrItemResponse>(`/ncrs/${ncrId}`, {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

export async function updateNcrRemark(ncrId: string, remark: string | null): Promise<NcrItemResponse> {
  return requestJson<NcrItemResponse>(`/ncrs/${ncrId}/remark`, {
    method: "PUT",
    body: JSON.stringify({ remark })
  });
}

export async function approveNcr(ncrId: string, data: ApproveNcrRequest): Promise<NcrItemResponse> {
  return requestJson<NcrItemResponse>(`/ncrs/${ncrId}/approve`, {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

export async function deleteNcr(ncrId: string): Promise<void> {
  await requestJson<{ deleted: boolean }>(`/ncrs/${ncrId}`, {
    method: "DELETE"
  });
}

export async function generateNcrPdf(ncrId: string): Promise<NcrPdfMeta> {
  return requestJson<NcrPdfMeta>(`/ncrs/${ncrId}/pdf`, {
    method: "POST"
  });
}

export async function downloadNcrPdf(ncrId: string): Promise<Blob> {
  return requestBlob(`/ncrs/${ncrId}/pdf`, {
    headers: {
      Accept: "application/pdf"
    }
  });
}

export async function uploadNcrFile(ncrId: string, file: File): Promise<NcrRelatedFile> {
  const formData = new FormData();
  formData.set("file", file);
  return requestJson<NcrRelatedFile>(`/ncrs/${ncrId}/files`, {
    method: "POST",
    body: formData
  });
}

export async function closeNcr(ncrId: string, data: { closed: boolean }): Promise<NcrItemResponse> {
  return requestJson<NcrItemResponse>(`/ncrs/${ncrId}/close`, {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

export async function listNcrFiles(ncrId: string): Promise<NcrRelatedFile[]> {
  return requestJson<NcrRelatedFile[]>(`/ncrs/${ncrId}/files`);
}

export async function downloadNcrFile(ncrId: string, fileId: string): Promise<Blob> {
  return requestBlob(`/ncrs/${ncrId}/files/${fileId}`);
}

export async function deleteNcrFile(ncrId: string, fileId: string): Promise<void> {
  await requestJson<{ deleted: boolean }>(`/ncrs/${ncrId}/files/${fileId}`, {
    method: "DELETE"
  });
}
