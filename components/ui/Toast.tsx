"use client";

/**
 * components/ui/Toast.tsx
 *
 * Sistema central de notificaciones (F0.1). Reemplaza los toasts locales que cada
 * componente reimplementaba (CanvasAgentButton, CronogramaProgressButton, …).
 *
 *   const toast = useToast();
 *   toast.success("Listo");
 *   toast.error("No se pudo", { action: { label: "Reintentar", onClick } });
 *
 * Auto-dismiss por defecto: success 7s · info 9s · error 14s. Si hay `action` →
 * sticky (no se auto-cierra) para que el usuario alcance a clickearla. Siempre hay
 * botón "×" para cerrar a mano. `toast.error` reporta vía reportClientError (gancho
 * F0.4 Sentry). Montado una vez en app/layout.tsx via <ToastProvider>.
 */
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { reportClientError } from "@/lib/observability/report-error";

export type ToastType = "success" | "error" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  /** ms hasta auto-cerrar. 0 = sticky (no se auto-cierra). Default por tipo. */
  duration?: number;
  action?: ToastAction;
}

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  action?: ToastAction;
}

export interface ToastApi {
  success: (message: string, opts?: ToastOptions) => number;
  error: (message: string, opts?: ToastOptions) => number;
  info: (message: string, opts?: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 7000,
  info: 9000,
  error: 14000,
};

// Ícono + color por tipo. La card es neutra (surface + texto foreground = legible en
// claro y oscuro); el color vive solo en el chip del ícono y el acento de la acción.
const ICONS: Record<ToastType, ReactNode> = {
  success: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.42l3.3 3.3 6.79-6.79a1 1 0 011.42 0z" clipRule="evenodd" />
    </svg>
  ),
  error: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 6a1 1 0 112 0v4a1 1 0 11-2 0V6zm1 8.25A1.25 1.25 0 1010 11.75a1.25 1.25 0 000 2.5z" clipRule="evenodd" />
    </svg>
  ),
  info: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM10 6.75A1.25 1.25 0 1010 4.25a1.25 1.25 0 000 2.5zM9 9a1 1 0 112 0v5a1 1 0 11-2 0V9z" clipRule="evenodd" />
    </svg>
  ),
};

const CHIP_STYLES: Record<ToastType, string> = {
  success: "bg-emerald-500/12 text-emerald-500",
  error: "bg-red-500/12 text-red-500",
  info: "bg-blue-500/12 text-blue-500",
};

const ACCENT_STYLES: Record<ToastType, string> = {
  success: "text-emerald-500",
  error: "text-red-500",
  info: "text-blue-500",
};

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (type: ToastType, message: string, opts?: ToastOptions): number => {
      const id = ++idRef.current;
      const action = opts?.action;
      setToasts((ts) => [...ts, { id, message, type, action }]);
      // Gancho de observabilidad: todo error visible al usuario se reporta.
      if (type === "error") reportClientError(message);
      // Sticky si hay acción (o duration 0); si no, default por tipo.
      const duration = opts?.duration ?? (action ? 0 : DEFAULT_DURATION[type]);
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  // Limpia todos los timers al desmontar el provider.
  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  // Memoizado para que `toast` sea estable entre renders (seguro en dep arrays de
  // useCallback/useEffect). push y dismiss ya son estables (useCallback).
  const api = useMemo<ToastApi>(
    () => ({
      success: (m, o) => push("success", m, o),
      error: (m, o) => push("error", m, o),
      info: (m, o) => push("info", m, o),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2.5 pointer-events-none">
          <style>{`@keyframes nx-toast-in{from{opacity:0;transform:translateY(10px) scale(.975)}to{opacity:1;transform:translateY(0) scale(1)}}.nx-toast-in{animation:nx-toast-in .18s cubic-bezier(.21,1.02,.73,1)}`}</style>
          {toasts.map((t) => (
            <div
              key={t.id}
              role="status"
              className="nx-toast-in pointer-events-auto flex items-start gap-3 w-[min(92vw,26rem)] px-4 py-3 rounded-2xl border border-line bg-surface text-fg shadow-[0_10px_40px_-12px_rgba(0,0,0,0.55)]"
            >
              <span
                className={`mt-px flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${CHIP_STYLES[t.type]}`}
              >
                {ICONS[t.type]}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium leading-relaxed text-fg">{t.message}</p>
                {t.action && (
                  <button
                    onClick={() => {
                      t.action!.onClick();
                      dismiss(t.id);
                    }}
                    className={`mt-1.5 text-xs font-semibold hover:underline underline-offset-2 ${ACCENT_STYLES[t.type]}`}
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Cerrar"
                className="flex-shrink-0 -mr-0.5 -mt-0.5 text-fg-muted hover:text-fg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}
