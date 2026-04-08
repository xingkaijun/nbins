import { useEffect, useState } from "react";
import type {
  InspectionItemDetailResponse,
  ResolveCommentRequest,
  SubmitInspectionResultRequest
} from "@nbins/shared";
import {
  ApiError,
  fetchInspectionDetail,
  resolveInspectionComment as resolveInspectionCommentRequest,
  addInspectionCommentRemark,
  reopenInspectionComment,
  submitInspectionResult as submitInspectionResultRequest
} from "./api";

export type DetailTransportMode = "api" | "demo";

interface UseInspectionDetailOptions {
  inspectionItemId: string;
  fallbackDetail: InspectionItemDetailResponse | undefined;
}

interface SubmitInspectionResultOptions {
  mode: DetailTransportMode;
}

interface ResolveCommentOptions {
  mode: DetailTransportMode;
}

interface UseInspectionDetailResult {
  detail: InspectionItemDetailResponse | undefined;
  mode: DetailTransportMode;
  loading: boolean;
  error: string | null;
  submitError: string | null;
  submitting: boolean;
  refresh: () => Promise<void>;
  applyLocalDetail: (detail: InspectionItemDetailResponse) => void;
  submit: (
    request: SubmitInspectionResultRequest,
    options: SubmitInspectionResultOptions
  ) => Promise<InspectionItemDetailResponse>;
  resolveComment: (
    commentId: string,
    request: ResolveCommentRequest,
    options: ResolveCommentOptions
  ) => Promise<InspectionItemDetailResponse>;
  addRemark: (
    commentId: string,
    request: { expectedVersion: number; remark: string },
    options: ResolveCommentOptions
  ) => Promise<InspectionItemDetailResponse>;
  reopenComment: (
    commentId: string,
    request: { expectedVersion: number },
    options: ResolveCommentOptions
  ) => Promise<InspectionItemDetailResponse>;
}

function isConnectivityError(error: unknown): boolean {
  return error instanceof TypeError;
}

export function useInspectionDetail(
  options: UseInspectionDetailOptions
): UseInspectionDetailResult {
  const { inspectionItemId, fallbackDetail } = options;
  const [detail, setDetail] = useState<InspectionItemDetailResponse | undefined>(fallbackDetail);
  const [mode, setMode] = useState<DetailTransportMode>("demo");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setDetail(fallbackDetail);
  }, [fallbackDetail]);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      setSubmitError(null);

      try {
        const nextDetail = await fetchInspectionDetail(inspectionItemId);

        if (!active) {
          return;
        }

        setDetail(nextDetail);
        setMode("api");
      } catch (loadError) {
        if (!active) {
          return;
        }

        setMode("demo");
        setDetail(fallbackDetail);
        setError(
          fallbackDetail
            ? "API unavailable. Showing demo detail data."
            : loadError instanceof Error
              ? loadError.message
              : "Unable to load inspection detail."
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [fallbackDetail, inspectionItemId]);

  async function refresh(): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      const nextDetail = await fetchInspectionDetail(inspectionItemId);
      setDetail(nextDetail);
      setMode("api");
    } catch (loadError) {
      setMode("demo");
      setDetail(fallbackDetail);
      setError(
        fallbackDetail
          ? "API unavailable. Showing demo detail data."
          : loadError instanceof Error
            ? loadError.message
            : "Unable to load inspection detail."
      );
    } finally {
      setLoading(false);
    }
  }

  function applyLocalDetail(nextDetail: InspectionItemDetailResponse): void {
    setDetail(nextDetail);
    setSubmitError(null);
  }

  async function submit(
    request: SubmitInspectionResultRequest,
    submitOptions: SubmitInspectionResultOptions
  ): Promise<InspectionItemDetailResponse> {
    setSubmitting(true);
    setSubmitError(null);

    try {
      if (submitOptions.mode === "demo") {
        throw new ApiError("Demo mode does not submit to the API.", 0);
      }

      const response = await submitInspectionResultRequest(inspectionItemId, request);
      setDetail(response.item);
      setMode("api");
      return response.item;
    } catch (submitRequestError) {
      if (submitOptions.mode === "demo") {
        throw submitRequestError;
      }

      const message =
        submitRequestError instanceof Error
          ? submitRequestError.message
          : "Unable to submit inspection result.";
      setSubmitError(message);

      if (isConnectivityError(submitRequestError)) {
        throw submitRequestError;
      }

      throw submitRequestError;
    } finally {
      setSubmitting(false);
    }
  }

  async function resolveComment(
    commentId: string,
    request: ResolveCommentRequest,
    resolveOptions: ResolveCommentOptions
  ): Promise<InspectionItemDetailResponse> {
    setSubmitting(true);
    setSubmitError(null);

    try {
      if (resolveOptions.mode === "demo") {
        throw new ApiError("Demo mode does not submit to the API.", 0);
      }

      const response = await resolveInspectionCommentRequest(
        inspectionItemId,
        commentId,
        request
      );
      setDetail(response.item);
      setMode("api");
      return response.item;
    } catch (resolveRequestError) {
      if (resolveOptions.mode === "demo") {
        throw resolveRequestError;
      }

      const message =
        resolveRequestError instanceof Error
          ? resolveRequestError.message
          : "Unable to resolve comment.";
      setSubmitError(message);

      if (isConnectivityError(resolveRequestError)) {
        throw resolveRequestError;
      }

      throw resolveRequestError;
    } finally {
      setSubmitting(false);
    }
  }

  async function addRemark(
    commentId: string,
    request: { expectedVersion: number; remark: string },
    resolveOptions: ResolveCommentOptions
  ): Promise<InspectionItemDetailResponse> {
    setSubmitting(true);
    setSubmitError(null);

    try {
      if (resolveOptions.mode === "demo") throw new ApiError("Demo mode does not submit to the API.", 0);
      const response = await addInspectionCommentRemark(inspectionItemId, commentId, request);
      setDetail(response.item);
      setMode("api");
      return response.item;
    } catch (error) {
      if (resolveOptions.mode === "demo") throw error;
      const message = error instanceof Error ? error.message : "Unable to add remark.";
      setSubmitError(message);
      throw error;
    } finally {
      setSubmitting(false);
    }
  }

  async function reopenComment(
    commentId: string,
    request: { expectedVersion: number },
    resolveOptions: ResolveCommentOptions
  ): Promise<InspectionItemDetailResponse> {
    setSubmitting(true);
    setSubmitError(null);

    try {
      if (resolveOptions.mode === "demo") throw new ApiError("Demo mode does not submit to the API.", 0);
      const response = await reopenInspectionComment(inspectionItemId, commentId, request);
      setDetail(response.item);
      setMode("api");
      return response.item;
    } catch (error) {
      if (resolveOptions.mode === "demo") throw error;
      const message = error instanceof Error ? error.message : "Unable to reopen comment.";
      setSubmitError(message);
      throw error;
    } finally {
      setSubmitting(false);
    }
  }

  return {
    detail,
    mode,
    loading,
    error,
    submitError,
    submitting,
    refresh,
    applyLocalDetail,
    submit,
    resolveComment,
    addRemark,
    reopenComment
  };
}
