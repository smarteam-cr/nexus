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
 * ⛔ NINGÚN TOAST ES ETERNO. Las duraciones y el porqué de cada una viven en
 * `lib/ui/toast-duracion.ts` (tabla probada). Hasta el 2026-08-14 un toast con `action`
 * era sticky «para que el usuario alcance a clickearla»: como los avisos de agente
 * terminado traen un «Ver», ninguno se iba y se apilaban seis tapando la pantalla.
 *
 * Lo que reemplaza al sticky: **el reloj se PAUSA mientras el mouse está encima o el foco
 * de teclado está adentro**. Da la misma garantía —no se te escapa lo que estás mirando—
 * sin dejar basura cuando no lo mirás. Y se muestran como mucho MAX_VISIBLES: el más viejo
 * se va solo, porque una pila que tapa la app no informa, estorba.
 *
 * Siempre hay botón "×" para cerrar a mano. `toast.error` reporta vía reportClientError
 * (gancho F0.4 Sentry). Montado una vez en app/layout.tsx via <ToastProvider>.
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
import {
  duracionDeToast,
  MAX_VISIBLES,
  type ToastType as ToastTypeBase,
} from "@/lib/ui/toast-duracion";

export type ToastType = ToastTypeBase;

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  /** ms hasta auto-cerrar. `0` = el MÁXIMO que damos (no «para siempre»). Default por tipo. */
  duration?: number;
  action?: ToastAction;
}

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  action?: ToastAction;
  /** Cuánto vive, en ms. Alimenta el temporizador y la barra de progreso. */
  duracion: number;
}

export interface ToastApi {
  success: (message: string, opts?: ToastOptions) => number;
  error: (message: string, opts?: ToastOptions) => number;
  info: (message: string, opts?: ToastOptions) => number;
  dismiss: (id: number) => void;
}

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

/** Un temporizador que se puede pausar: guarda cuánto le queda al detenerse. */
interface Reloj {
  timer: ReturnType<typeof setTimeout> | null;
  /** ms que faltaban la última vez que arrancó. */
  restante: number;
  /** `Date.now()` del último arranque. `null` = pausado. */
  desde: number | null;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [pausados, setPausados] = useState<ReadonlySet<number>>(() => new Set());
  const idRef = useRef(0);
  const relojes = useRef<Map<number, Reloj>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
    setPausados((p) => {
      if (!p.has(id)) return p;
      const n = new Set(p);
      n.delete(id);
      return n;
    });
    const reloj = relojes.current.get(id);
    if (reloj?.timer) clearTimeout(reloj.timer);
    relojes.current.delete(id);
  }, []);

  /** Arranca (o reanuda) la cuenta regresiva de un toast. */
  const arrancar = useCallback(
    (id: number, ms: number) => {
      const reloj = relojes.current.get(id);
      if (reloj?.timer) clearTimeout(reloj.timer);
      relojes.current.set(id, {
        timer: setTimeout(() => dismiss(id), ms),
        restante: ms,
        desde: Date.now(),
      });
    },
    [dismiss],
  );

  /* Pausa mientras el mouse está encima o el foco de teclado adentro. Es lo que reemplaza al
     sticky: si lo estás leyendo o yendo a apretar su acción, el reloj espera. Sin esto, bajar
     las duraciones haría que un aviso se escape justo cuando alguien estira la mano. */
  const pausar = useCallback((id: number) => {
    const reloj = relojes.current.get(id);
    if (!reloj || reloj.desde === null) return;
    if (reloj.timer) clearTimeout(reloj.timer);
    const consumido = Date.now() - reloj.desde;
    relojes.current.set(id, {
      timer: null,
      restante: Math.max(0, reloj.restante - consumido),
      desde: null,
    });
    setPausados((p) => new Set(p).add(id));
  }, []);

  const reanudar = useCallback(
    (id: number) => {
      const reloj = relojes.current.get(id);
      if (!reloj || reloj.desde !== null) return;
      setPausados((p) => {
        const n = new Set(p);
        n.delete(id);
        return n;
      });
      arrancar(id, reloj.restante);
    },
    [arrancar],
  );

  const push = useCallback(
    (type: ToastType, message: string, opts?: ToastOptions): number => {
      const id = ++idRef.current;
      const action = opts?.action;
      const duracion = duracionDeToast(type, { duration: opts?.duration, conAccion: !!action });
      /* Tope de pila: el más viejo se va para hacerle lugar al nuevo. Seis apilados tapaban
         media pantalla y obligaban a cerrarlos de a uno — un aviso que da trabajo no es aviso.
         Se descarta por el MÁS VIEJO porque el recién llegado es el que el usuario está
         esperando (acaba de terminar algo que él disparó). */
      setToasts((ts) => {
        const siguiente = [...ts, { id, message, type, action, duracion }];
        const sobran = siguiente.length - MAX_VISIBLES;
        if (sobran > 0) {
          for (const viejo of siguiente.slice(0, sobran)) {
            const reloj = relojes.current.get(viejo.id);
            if (reloj?.timer) clearTimeout(reloj.timer);
            relojes.current.delete(viejo.id);
          }
          return siguiente.slice(sobran);
        }
        return siguiente;
      });
      // Gancho de observabilidad: todo error visible al usuario se reporta.
      if (type === "error") reportClientError(message);
      arrancar(id, duracion);
      return id;
    },
    [arrancar],
  );

  // Limpia todos los timers al desmontar el provider.
  useEffect(() => {
    const map = relojes.current;
    return () => map.forEach((r) => r.timer && clearTimeout(r.timer));
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
          <style>{`@keyframes nx-toast-in{from{opacity:0;transform:translateY(10px) scale(.975)}to{opacity:1;transform:translateY(0) scale(1)}}.nx-toast-in{animation:nx-toast-in .18s cubic-bezier(.21,1.02,.73,1)}@keyframes nx-toast-vida{from{transform:scaleX(1)}to{transform:scaleX(0)}}.nx-toast-vida{transform-origin:left;animation-name:nx-toast-vida;animation-timing-function:linear;animation-fill-mode:forwards}@media (prefers-reduced-motion:reduce){.nx-toast-vida{animation:none;transform:scaleX(0)}}`}</style>
          {toasts.map((t) => (
            <div
              key={t.id}
              role="status"
              /* El reloj se detiene mientras lo mirás o lo tenés enfocado con el teclado.
                 `onFocus`/`onBlur` burbujean desde el botón de acción y el de cerrar, así que
                 navegar con Tab también lo congela. */
              onMouseEnter={() => pausar(t.id)}
              onMouseLeave={() => reanudar(t.id)}
              onFocus={() => pausar(t.id)}
              onBlur={() => reanudar(t.id)}
              className="nx-toast-in pointer-events-auto relative overflow-hidden flex items-start gap-3 w-[min(92vw,26rem)] px-4 py-3 rounded-2xl border border-line bg-surface text-fg shadow-[0_10px_40px_-12px_rgba(0,0,0,0.55)]"
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
              {/* Barra de vida: hace VISIBLE que el aviso se va solo, y que se detuvo cuando
                  ponés el mouse encima. Sin ella, la pausa parece que se colgó. Decorativa
                  (aria-hidden): el contenido ya lo anuncia el role="status" del contenedor. */}
              <span
                aria-hidden="true"
                className={`nx-toast-vida absolute bottom-0 left-0 h-0.5 w-full ${ACCENT_STYLES[t.type]} bg-current opacity-30`}
                style={{
                  animationDuration: `${t.duracion}ms`,
                  animationPlayState: pausados.has(t.id) ? "paused" : "running",
                }}
              />
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
