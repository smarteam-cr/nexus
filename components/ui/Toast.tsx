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
 * Auto-dismiss por defecto: success 4s · info 5s · error 8s. Si hay `action` →
 * sticky (no se auto-cierra) para que el usuario alcance a clickearla. Siempre hay
 * botón "×" para cerrar a mano. `toast.error` reporta vía reportClientError (gancho
 * F0.4 Sentry). Montado una vez en app/layout.tsx via <ToastProvider>.
 */
import {
  createContext,
  useContext,
  useState,
  useCallback,
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
  success: 4000,
  info: 5000,
  error: 8000,
};

const TYPE_STYLES: Record<ToastType, string> = {
  success: "bg-emerald-600 text-white",
  error: "bg-red-600 text-white",
  info: "bg-gray-800 text-white border border-gray-700",
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

  const api: ToastApi = {
    success: (m, o) => push("success", m, o),
    error: (m, o) => push("error", m, o),
    info: (m, o) => push("info", m, o),
    dismiss,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto flex items-center gap-3 max-w-md px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium ${TYPE_STYLES[t.type]}`}
            >
              <span className="flex-1">{t.message}</span>
              {t.action && (
                <button
                  onClick={() => {
                    t.action!.onClick();
                    dismiss(t.id);
                  }}
                  className="flex-shrink-0 text-xs font-bold underline underline-offset-2 hover:opacity-80"
                >
                  {t.action.label}
                </button>
              )}
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Cerrar"
                className="flex-shrink-0 -mr-1 opacity-70 hover:opacity-100"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
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
