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

const VARIANT = {
  info: {
    box: "border-brand/25 bg-brand/10",
    icon: "text-brand-light",
    role: "status" as const,
    path: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  success: {
    box: "border-green-500/25 bg-green-500/10",
    icon: "text-green-400",
    role: "status" as const,
    path: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  warning: {
    box: "border-amber-500/30 bg-amber-500/10",
    icon: "text-amber-400",
    role: "alert" as const,
    path: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  },
  danger: {
    box: "border-red-500/25 bg-destructive-muted",
    icon: "text-red-400",
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
      <div className="min-w-0 flex-1 text-sm">
        {title && <p className="font-semibold text-fg">{title}</p>}
        {children && <div className={cn("text-fg-secondary", title && "mt-0.5")}>{children}</div>}
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
