/**
 * Framework-free toast queue. The React layer (components/Toast.tsx) keeps an
 * array of these in state and calls the pure functions below, which keeps the
 * rules (dedupe, cap, timeouts, live-region role) unit-testable.
 */

export type ToastTone = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
  /** How many times the same message was raised while still visible. */
  count: number;
}

export const MAX_VISIBLE_TOASTS = 4;

/** Errors stay longer: they usually need reading, and they are announced assertively. */
export function toastDuration(tone: ToastTone): number {
  return tone === "error" ? 7000 : 4000;
}

/** Errors go to the role="alert" region, everything else to role="status". */
export function toastLiveRole(tone: ToastTone): "alert" | "status" {
  return tone === "error" ? "alert" : "status";
}

export function normalizeToastMessage(message: unknown, fallback = "Something went wrong."): string {
  if (message instanceof Error) {
    return message.message.trim() || fallback;
  }
  if (typeof message === "string") {
    return message.trim() || fallback;
  }
  return fallback;
}

/**
 * Adds a toast. A message identical to a visible one bumps that toast instead
 * of stacking a duplicate (it moves to the end and its timer restarts, which
 * the caller handles by keying timers on the returned id). The queue is capped,
 * dropping the oldest first.
 */
export function pushToast(
  queue: readonly ToastItem[],
  tone: ToastTone,
  message: string,
  id: number
): { queue: ToastItem[]; id: number } {
  const existing = queue.find((toast) => toast.tone === tone && toast.message === message);
  if (existing) {
    const bumped: ToastItem = { ...existing, id, count: existing.count + 1 };
    return { queue: [...queue.filter((toast) => toast !== existing), bumped], id };
  }

  const next = [...queue, { id, tone, message, count: 1 }];
  return { queue: next.slice(Math.max(0, next.length - MAX_VISIBLE_TOASTS)), id };
}

export function dismissToast(queue: readonly ToastItem[], id: number): ToastItem[] {
  return queue.filter((toast) => toast.id !== id);
}
