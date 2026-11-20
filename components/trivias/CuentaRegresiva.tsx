"use client";

/**
 * components/trivias/CuentaRegresiva.tsx — los segundos que le quedan a la pregunta y una barra que se vacía.
 * Mide contra el reloj del SERVIDOR (`ahora` sale de useAhora con ahoraDelServidor): llega a cero cuando el servidor
 * deja de aceptar respuestas, no cuando lo diga el reloj del teléfono.
 */
import { cn } from "@/lib/cn";

export function segundosRestantes(cierraAt: number | null, ahora: number): number {
  if (cierraAt === null) return 0;
  return Math.max(0, Math.ceil((cierraAt - ahora) / 1000));
}

export function CuentaRegresiva({
  abiertaAt,
  cierraAt,
  segundos,
  ahora,
  tamano = "md",
  className,
}: {
  abiertaAt: number | null;
  cierraAt: number | null;
  /** El tiempo total de la pregunta (para la barra). */
  segundos: number;
  ahora: number;
  tamano?: "md" | "lg";
  className?: string;
}) {
  const quedan = segundosRestantes(cierraAt, ahora);
  const total = segundos * 1000;
  const fraccion = abiertaAt === null || cierraAt === null || total <= 0
    ? 0
    : Math.max(0, Math.min(1, (cierraAt - ahora) / total));
  const urgente = quedan > 0 && quedan <= 5;
  return (
    <div className={cn("flex items-center gap-3", className)} role="timer" aria-live="off" aria-label={`Quedan ${quedan} segundos`}>
      <span
        className={cn(
          "tabular-nums font-bold leading-none",
          tamano === "lg" ? "text-5xl" : "text-3xl",
          urgente ? "text-danger-ink" : "text-fg",
        )}
      >
        {quedan}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
        <div
          className={cn("h-full rounded-full transition-[width] duration-200 ease-linear", urgente ? "bg-danger-ink" : "bg-brand")}
          style={{ width: `${fraccion * 100}%` }}
        />
      </div>
    </div>
  );
}
