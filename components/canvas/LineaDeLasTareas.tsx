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
 * Chica a propósito: texto y, a lo sumo, la acción y «Descartar» (este solo suelta, con un borrador sin
 * cambios: no hay barra que lo traiga). Los textos salen de `textoDeLaLineaDeTareas`
 * (lib/timeline/borrador.ts), que los prueban los tests; acá solo se pintan. Tokens del tema SIEMPRE:
 * info = algo en curso, warn = algo que falta.
 *
 * E2b (2026-09-25): «ofrecer» — la propuesta ya se resolvió y sus tareas no llegaron: la línea suelta
 * ofrece armarlas, con «Ahora no». Reemplaza a la franja `PasoDeTareasPendiente`, que se borró con la
 * cadena vieja. Info si se aplicaron fases (falta el siguiente paso), warn si no (falló).
 *
 * E2c P3 (2026-09-25): también es la línea del RECÁLCULO de las tareas de las fases desfasadas
 * (`recalculo`): «Recalculando las tareas de «X»…», «no calzan con lo que marcaste» o «No se pudieron
 * recalcular…». Sus textos salen de `textoDelRecalculo` (lib/timeline/recalculo-de-tareas.ts). UN solo
 * botón chico secundario (`onSecundaria`), con el texto que da la línea: «Ahora no» en «ofrecer»,
 * «Aplicar de todos modos» cuando el recálculo falló.
 */
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { textoDeLaLineaDeTareas, type EstadoDeLasTareas } from "@/lib/timeline/borrador";
import { textoDelRecalculo, type RecalculoEnPantalla } from "@/lib/timeline/recalculo-de-tareas";

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
  conCambiosDeFases = true,
  onAccion,
  onDescartar,
  onSecundaria,
  recalculo = null,
  descartando = false,
  trabajando = false,
  suelta = false,
}: {
  /** «paso-1»: la revisión de fases y tiempos está corriendo (todavía no hay propuesta).
   *  «ofrecer»: ya no hay propuesta y sus tareas no llegaron (`pasoTrasResolver`). */
  estado: EstadoDeLasTareas | "paso-1" | "ofrecer" | null;
  fase: string | null;
  motivo: string | null;
  /** El CSE eligió material para el paso 1: solo así se dice «Paso 1 de 2 · Revisando…». */
  conMaterial?: boolean;
  /** La propuesta trae cambios de fases que se aplican sin las tareas. Sin ellos (el borrador que nace
   *  vacío) no se promete «solo se aplican los cambios de fases». */
  conCambiosDeFases?: boolean;
  /** «Armar las tareas» / «Volver a intentar». Sin él (o sin permiso de generar), la línea solo informa. */
  onAccion?: () => void;
  /** «Descartar», para el borrador SIN cambios (no tiene barra, y la barra es la que lo trae). Sin él,
   *  un borrador vacío que espera tareas no tenía salida hasta que la corrida terminara o se colgara. */
  onDescartar?: () => void;
  /** El botón chico secundario, con el texto que da la línea (`secundaria`): «Ahora no» en «ofrecer»
   *  (esconde la oferta sin pedir nada), «Aplicar de todos modos» si el recálculo falló. */
  onSecundaria?: () => void;
  /** E2c: el recálculo de las fases desfasadas. Con él, la línea es la suya (`estado` no cuenta). */
  recalculo?: RecalculoEnPantalla | null;
  /** El DELETE de «Descartar» está en curso. */
  descartando?: boolean;
  /** Aplicando, descartando o ya pidiendo: el botón no puede lanzar otra corrida. */
  trabajando?: boolean;
  /** Sin barra alrededor: la línea lleva su propio recuadro. */
  suelta?: boolean;
}) {
  const deLasTareas = recalculo ? null : textoDeLaLineaDeTareas(estado, fase, motivo, conMaterial, conCambiosDeFases);
  // Con el recálculo, `onAccion` es «Recalcular las tareas»: sin él (sin permiso), la línea lo dice.
  const delRecalculo = recalculo ? textoDelRecalculo(recalculo, { puedePedir: !!onAccion }) : null;
  const linea = delRecalculo ?? deLasTareas;
  if (!linea) return null;
  const enCurso = delRecalculo ? delRecalculo.enCurso : estado === "paso-1" || estado === "armando";
  // Info = algo en curso, o la oferta después de aplicar fases; warn = algo que falta o falló.
  const info = enCurso || (!recalculo && estado === "ofrecer" && conCambiosDeFases);
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1",
        suelta && "rounded-xl border px-3 py-2",
        suelta && (info ? "border-info-line bg-info-surface" : "border-warn-line bg-warn-surface"),
      )}
    >
      {enCurso && (
        <span
          aria-hidden="true"
          className="h-3 w-3 flex-shrink-0 animate-spin rounded-full border-2 border-info-line border-t-info-ink"
        />
      )}
      <p className={cn("min-w-0 flex-1 text-xs", info ? "text-info-ink" : "text-warn-ink")}>{linea.texto}</p>
      {linea.accion && onAccion && (
        <Button size="xs" variant="secondary" onClick={onAccion} disabled={trabajando || descartando}>
          {linea.accion}
        </Button>
      )}
      {onDescartar && (
        <Button size="xs" variant="secondary" onClick={onDescartar} disabled={trabajando || descartando}>
          {descartando ? "Descartando…" : "Descartar"}
        </Button>
      )}
      {linea.secundaria && onSecundaria && (
        <Button size="xs" variant="secondary" onClick={onSecundaria} disabled={trabajando}>
          {linea.secundaria}
        </Button>
      )}
    </div>
  );
}
