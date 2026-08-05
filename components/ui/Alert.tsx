"use client";

import { cn } from "@/lib/cn";
import { IconButton } from "./IconButton";

// ── Alert ──────────────────────────────────────────────────────────────────────
//
// Banner inline de feedback NO-transitorio: errores de carga/validación que deben
// quedarse en pantalla, avisos de estado, confirmaciones persistentes. Es el
// segundo canal coherente junto al Toast (que es transitorio y flotante):
//   - pasó algo y ya → toast.success / toast.error
//   - hay un estado que el usuario debe VER mientras decide → <Alert>
//
// Por qué existe: el mismo error se mostraba como toast en una pantalla, como
// <p className="text-red-400"> en otra y como caja border-red-500/20 en una
// tercera (219 text-red-* + 105 border-red-* ad-hoc). El ratchet DEUDA_ALERTS
// (token-vocab.test.ts) frena los nuevos.
//
// Semántica: warning/danger anuncian con role="alert" (interrupción); info/success
// con role="status" (cortésmente). El color viene de acentos de intención — nunca
// de un text-red-400 suelto en el consumidor.

/**
 * ⚠ CADA VARIANTE SE PINTA CON SUS TOKENS, NUNCA CON COLORES CRUDOS. (2026-08-05)
 *
 * Hasta hoy esta tabla usaba `border-amber-500/30 bg-amber-500/10 text-amber-400` y compañía, y
 * eso es exactamente lo que rompe la legibilidad. El tema claro de los colores crudos de estado
 * no sale de una fórmula: es una lista de ~158 clases remapeadas a mano en globals.css. Si tu
 * clase exacta está en la lista se ve; si le agregás una opacidad o cambiás de tono, cae al valor
 * original de Tailwind —pensado para fondo oscuro— y desaparece sobre el fondo claro.
 *
 * Medido el 2026-08-05 en el cartel que lo destapó: el título daba 8,75:1 (estaba en la lista) y
 * la descripción, de la MISMA familia pero con `/80`, daba 1,16:1. El botón, 1,00:1 — el mismo
 * color que su fondo, literalmente invisible.
 *
 * Con tokens no hay combinación que inventar: los cuatro tripletes están medidos en los DOS temas
 * y pasan AA holgado. Un cartel deja de depender de qué tema tenga puesto quien lo mira.
 */
const VARIANT = {
  info: {
    box: "border-info-line bg-info-surface",
    icon: "text-info-ink",
    ink: "text-info-ink",
    role: "status" as const,
    path: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  success: {
    box: "border-success-line bg-success-surface",
    icon: "text-success-ink",
    ink: "text-success-ink",
    role: "status" as const,
    path: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  warning: {
    box: "border-warn-line bg-warn-surface",
    icon: "text-warn-ink",
    ink: "text-warn-ink",
    role: "alert" as const,
    path: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  },
  danger: {
    box: "border-danger-line bg-danger-surface",
    icon: "text-danger-ink",
    ink: "text-danger-ink",
    role: "alert" as const,
    path: "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z",
  },
} as const;

export type AlertVariant = keyof typeof VARIANT;

export interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children?: React.ReactNode;
  /** CTA a la derecha (ej. <Button size="xs">Reintentar</Button>). */
  action?: React.ReactNode;
  /** Si se pasa, muestra la X de descartar. */
  onDismiss?: () => void;
  className?: string;
}

export function Alert({ variant = "info", title, children, action, onDismiss, className }: AlertProps) {
  const v = VARIANT[variant];
  return (
    <div
      role={v.role}
      className={cn("flex items-start gap-2.5 rounded-lg border px-3 py-2.5", v.box, className)}
    >
      <svg
        className={cn("w-4 h-4 mt-0.5 flex-shrink-0", v.icon)}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={v.path} />
      </svg>
      {/* ⚠ El texto va con la TINTA de la variante, no con `text-fg`/`text-fg-secondary`. Sobre un
          tint de color, el gris del tema pierde contraste justo en la línea que explica qué pasó
          — que es la que más se lee. La tinta está medida contra su propia superficie. */}
      <div className="min-w-0 flex-1 text-sm">
        {title && <p className={cn("font-semibold", v.ink)}>{title}</p>}
        {children && <div className={cn(v.ink, title && "mt-0.5")}>{children}</div>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
      {onDismiss && (
        <IconButton
          aria-label="Descartar aviso"
          size="xs"
          onClick={onDismiss}
          className="-mr-1 -mt-0.5"
          icon={
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          }
        />
      )}
    </div>
  );
}
