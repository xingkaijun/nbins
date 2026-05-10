import { requestBlob, requestJson } from "./client";
import type { UploadedMedia, UploadMediaOptions } from "./types";

export async function uploadMedia(shipId: string, file: File, options?: UploadMediaOptions): Promise<UploadedMedia> {
  const formData = new FormData();
  formData.set("shipId", shipId);
  formData.set("file", file);
  if (options?.baseId) {
    formData.set("baseId", options.baseId);
  }
  if (options?.variant) {
    formData.set("variant", options.variant);
  }
  if (options?.originalName) {
    formData.set("originalName", options.originalName);
  }
  return requestJson<UploadedMedia>("/media/upload", {
    method: "POST",
    body: formData
  });
}

export async function listMedia(shipId: string): Promise<string[]> {
  return requestJson<string[]>(`/media/${shipId}`);
}

export async function downloadMedia(shipId: string, filename: string): Promise<Blob> {
  return requestBlob(`/media/${shipId}/${encodeURIComponent(filename)}`);
}

export async function deleteMedia(shipId: string, filename: string): Promise<void> {
  await requestJson<{ deleted: boolean }>(`/media/${shipId}/${encodeURIComponent(filename)}`, {
    method: "DELETE"
  });
}
