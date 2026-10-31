/**
 * Cross-tab helpers for the standalone inspection detail page.
 *
 * - Builds the real, shareable URL of an inspection item (respects the Vite
 *   `base` / router basename used for sub-path deployments).
 * - Opens that URL in a new browser tab.
 * - Broadcasts saved inspection details to other tabs of the same origin so the
 *   Dashboard list can reflect the latest state without a full reload.
 *
 * Why BroadcastChannel (and not the `storage` event or refetch-on-return):
 * - it carries the structured, server-confirmed detail object that the save
 *   request already returned, so the list updates instantly with zero extra
 *   requests, even when both tabs are visible side by side;
 * - it does not write anything into localStorage (no quota use, no stale keys,
 *   no JSON round-trip through a string slot shared with the auth token);
 * - `storage` events would need a dummy key write per save, and refetch on
 *   return only fires when the user switches back and costs a full list request.
 * Browsers without BroadcastChannel (very old Safari) fall back to refetching
 * the list when the Dashboard tab becomes visible again, see Dashboard.tsx.
 */
import type { InspectionItemDetailResponse } from "@nbins/shared";

const INSPECTION_CHANNEL_NAME = "nbins.inspections";

export interface InspectionUpdatedMessage {
  type: "inspection-updated";
  itemId: string;
  detail: InspectionItemDetailResponse;
  sentAt: string;
  /** Id of the tab (JS realm) that published the update. */
  sourceTabId?: string;
}

/** BroadcastChannel also delivers to other channel objects in the same tab; this id lets a page skip its own updates. */
export const CURRENT_TAB_ID = `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export interface SubscribeInspectionUpdatesOptions {
  /** Skip updates this same tab published (the page already applied them locally). */
  ignoreOwnTab?: boolean;
}

export function isBroadcastChannelSupported(): boolean {
  return typeof globalThis.BroadcastChannel === "function";
}

/** Route pattern registered in App.tsx (relative to the "/" layout route). */
export const INSPECTION_DETAIL_ROUTE = "inspections/:itemId";

/** Router path (without basename), used with <Route> / navigate(). */
export function inspectionDetailRoutePath(itemId: string): string {
  return `/inspections/${encodeURIComponent(itemId)}`;
}

/**
 * Browser URL path including the deployment base (e.g. `/nbins/inspections/x`).
 * `baseUrl` defaults to Vite's BASE_URL so this matches the router basename
 * configured in App.tsx.
 */
export function buildInspectionDetailHref(
  itemId: string,
  baseUrl: string = import.meta.env?.BASE_URL ?? "/"
): string {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  return `${normalizedBase}${inspectionDetailRoutePath(itemId)}`;
}

/** Opens the inspection detail page in a new tab without giving it `window.opener`. */
export function openInspectionInNewTab(itemId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const opened = window.open(buildInspectionDetailHref(itemId), "_blank");

  if (opened) {
    try {
      opened.opener = null;
    } catch {
      // ignore: some browsers make opener read-only
    }
  }
}

export function publishInspectionUpdate(detail: InspectionItemDetailResponse): void {
  if (!isBroadcastChannelSupported()) {
    return;
  }

  const channel = new BroadcastChannel(INSPECTION_CHANNEL_NAME);
  const message: InspectionUpdatedMessage = {
    type: "inspection-updated",
    itemId: detail.id,
    detail,
    sentAt: new Date().toISOString(),
    sourceTabId: CURRENT_TAB_ID
  };

  try {
    channel.postMessage(message);
  } finally {
    channel.close();
  }
}

export function subscribeInspectionUpdates(
  handler: (message: InspectionUpdatedMessage) => void,
  options: SubscribeInspectionUpdatesOptions = {}
): () => void {
  if (!isBroadcastChannelSupported()) {
    return () => {};
  }

  const channel = new BroadcastChannel(INSPECTION_CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent<unknown>) => {
    const data = event.data as Partial<InspectionUpdatedMessage> | null;

    if (data && data.type === "inspection-updated" && typeof data.itemId === "string" && data.detail) {
      if (options.ignoreOwnTab && data.sourceTabId === CURRENT_TAB_ID) {
        return;
      }
      handler(data as InspectionUpdatedMessage);
    }
  };

  return () => channel.close();
}
