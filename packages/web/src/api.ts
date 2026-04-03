import type {
  InspectionItemDetailResponse,
  SubmitInspectionResultRequest,
  SubmitInspectionResultResponse
} from "@nbins/shared";

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const DEFAULT_API_BASE_URL = "/api";
const configuredApiBaseUrl =
  typeof import.meta !== "undefined" &&
  import.meta.env &&
  typeof import.meta.env.VITE_NBINS_API_BASE_URL === "string"
    ? import.meta.env.VITE_NBINS_API_BASE_URL.trim()
    : "";

function getApiBaseUrl(): string {
  return configuredApiBaseUrl || DEFAULT_API_BASE_URL;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  let payload: ApiEnvelope<T> | null = null;

  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok || payload.data === undefined) {
    throw new ApiError(
      payload?.error ?? `Request failed with status ${response.status}`,
      response.status
    );
  }

  return payload.data;
}

export async function fetchInspectionDetail(
  inspectionItemId: string
): Promise<InspectionItemDetailResponse> {
  return requestJson<InspectionItemDetailResponse>(`/inspections/${inspectionItemId}`);
}

export async function submitInspectionResult(
  inspectionItemId: string,
  request: SubmitInspectionResultRequest
): Promise<SubmitInspectionResultResponse> {
  return requestJson<SubmitInspectionResultResponse>(
    `/inspections/${inspectionItemId}/rounds/current/result`,
    {
      method: "PUT",
      body: JSON.stringify(request)
    }
  );
}
