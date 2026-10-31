import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import {
  dismissToast,
  normalizeToastMessage,
  pushToast,
  toastDuration,
  type ToastItem,
  type ToastTone
} from "../toast-store";

export interface ToastApi {
  success(message: string): void;
  info(message: string): void;
  /** Accepts an Error or string; `fallback` is used when it carries no text. */
  error(message: unknown, fallback?: string): void;
}

const noop: ToastApi = { success() {}, info() {}, error() {} };
const ToastContext = createContext<ToastApi>(noop);

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

const ICONS: Record<ToastTone, React.ReactNode> = {
  success: <CheckCircle2 size={16} aria-hidden="true" />,
  info: <Info size={16} aria-hidden="true" />,
  error: <TriangleAlert size={16} aria-hidden="true" />
};

/**
 * Non-blocking replacement for window.alert(). Success/info messages go to a
 * polite role="status" region, errors to an assertive role="alert" region.
 * Toasts close on their own (hover or focus pauses that) or with their X.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const clearTimer = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const dismiss = useCallback((id: number) => {
    clearTimer(id);
    setToasts((current) => dismissToast(current, id));
  }, [clearTimer]);

  const schedule = useCallback((id: number, tone: ToastTone) => {
    clearTimer(id);
    timers.current.set(id, setTimeout(() => dismiss(id), toastDuration(tone)));
  }, [clearTimer, dismiss]);

  const show = useCallback((tone: ToastTone, message: string) => {
    const id = nextId.current++;
    setToasts((current) => {
      const previous = current.find((toast) => toast.tone === tone && toast.message === message);
      if (previous) {
        clearTimer(previous.id);
      }
      return pushToast(current, tone, message, id).queue;
    });
    schedule(id, tone);
  }, [clearTimer, schedule]);

  useEffect(() => () => {
    for (const timer of timers.current.values()) {
      clearTimeout(timer);
    }
    timers.current.clear();
  }, []);

  const api = useMemo<ToastApi>(() => ({
    success: (message) => show("success", normalizeToastMessage(message)),
    info: (message) => show("info", normalizeToastMessage(message)),
    error: (message, fallback) => show("error", normalizeToastMessage(message, fallback))
  }), [show]);

  function renderToast(toast: ToastItem) {
    return (
      <div
        key={toast.id}
        className={`toast toast--${toast.tone}`}
        onMouseEnter={() => clearTimer(toast.id)}
        onMouseLeave={() => schedule(toast.id, toast.tone)}
        onFocus={() => clearTimer(toast.id)}
        onBlur={() => schedule(toast.id, toast.tone)}
      >
        <span className="toastIcon">{ICONS[toast.tone]}</span>
        <span className="toastMessage">
          {toast.message}
          {toast.count > 1 ? <span className="toastCount"> ×{toast.count}</span> : null}
        </span>
        <button type="button" className="toastClose" onClick={() => dismiss(toast.id)} aria-label="Dismiss notification">
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toastViewport">
        <div role="status" aria-live="polite" className="toastRegion">
          {toasts.filter((toast) => toast.tone !== "error").map(renderToast)}
        </div>
        <div role="alert" aria-live="assertive" className="toastRegion">
          {toasts.filter((toast) => toast.tone === "error").map(renderToast)}
        </div>
      </div>
    </ToastContext.Provider>
  );
}
