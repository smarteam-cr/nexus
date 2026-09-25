"use client";

/**
 * components/canvas/LineaDeLasTareas.tsx — LA LÍNEA DE LAS TAREAS de la propuesta del cronograma
 * (E2a del borrador, 2026-09-25).
 *
 * «Regenerar todo» y «Generar cronograma» dejan UNA propuesta con fases y tareas. Las tareas las arma
 * una corrida aparte (el paso 2), y mientras tanto la propuesta ya se puede mirar: esta línea dice en
 * qué está esa corrida —«Armando las tareas…», con la fase que reporta—, si las tareas no llegaron y
 * se pueden pedir, o si fallaron y por qué. Va DENTRO de la barra de revisión como segunda línea, o
 * suelta en el mismo lugar cuando todavía no hay nada que revisar (`suelta`).
 *
 * Chica a propósito: texto y, a lo sumo, un botón. Los textos salen de `textoDeLaLineaDeTareas`
 * (lib/timeline/borrador.ts), que los prueban los tests; acá solo se pintan. Tokens del tema SIEMPRE:
 * info = algo en curso, warn = algo que falta.
 */
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { textoDeLaLineaDeTareas, type EstadoDeLasTareas } from "@/lib/timeline/borrador";

/** Lo que la pantalla sabe de las tareas de la propuesta: el estado que calculó el servidor, la fase
 *  que reporta la corrida («armando») y por qué falló («fallo»). */
export interface TareasEnPantalla {
  estado: EstadoDeLasTareas;
  fase: string | null;
  motivo: string | null;
}

export default function LineaDeLasTareas({
  estado,
  fase,
  motivo,
  conMaterial = false,
  onAccion,
  trabajando = false,
  suelta = false,
}: {
  /** «paso-1»: la revisión de fases y tiempos está corriendo (todavía no hay propuesta). */
  estado: EstadoDeLasTareas | "paso-1" | null;
  fase: string | null;
  motivo: string | null;
  /** El CSE eligió material para el paso 1: solo así se dice «Paso 1 de 2 · Revisando…». */
  conMaterial?: boolean;
  /** «Armar las tareas» / «Volver a intentar». Sin él, la línea solo informa. */
  onAccion?: () => void;
  /** Aplicando, descartando o ya pidiendo: el botón no puede lanzar otra corrida. */
  trabajando?: boolean;
  /** Sin barra alrededor: la línea lleva su propio recuadro. */
  suelta?: boolean;
}) {
  const linea = textoDeLaLineaDeTareas(estado, fase, motivo, conMaterial);
  if (!linea) return null;
  const enCurso = estado === "paso-1" || estado === "armando";
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1",
        suelta && "rounded-xl border px-3 py-2",
        suelta && (enCurso ? "border-info-line bg-info-surface" : "border-warn-line bg-warn-surface"),
      )}
    >
      {enCurso && (
        <span
          aria-hidden="true"
          className="h-3 w-3 flex-shrink-0 animate-spin rounded-full border-2 border-info-line border-t-info-ink"
        />
      )}
      <p className={cn("min-w-0 flex-1 text-xs", enCurso ? "text-info-ink" : "text-warn-ink")}>{linea.texto}</p>
      {linea.accion && onAccion && (
        <Button size="xs" variant="secondary" onClick={onAccion} disabled={trabajando}>
          {linea.accion}
        </Button>
      )}
    </div>
  );
}
