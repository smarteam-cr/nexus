"use client";

import { tituloDeLoQueNoto } from "@/lib/timeline/borrador";

/**
 * components/canvas/ObservacionesDelPaso1.tsx — «LA IA TAMBIÉN NOTÓ», CUANDO NO HAY BARRA.
 *
 * El paso 1 de «Regenerar todo» deja observaciones: lo que la IA notó al revisar las fases y lo
 * ACORDADO que no se pudo proponer solo (una fase en una semana que ya pasó, un cambio sobre la
 * Semana 0…). El aviso de la pantalla dice «los ves en «La IA también notó» y decides tú». Con una
 * propuesta que tiene barra, lo muestra la barra (plegado). Sin barra (sin propuesta, o con el
 * borrador vacío que espera sus tareas) lo muestra esta franja: si no, lo acordado no aparecía nunca
 * (revisión adversarial, 2026-09-24).
 *
 * E2b P6 (2026-09-25): el título es el MISMO que el de la barra (`tituloDeLoQueNoto`), y se fue la nota
 * «Solo lo ves tú…»: el borrador vacío las guarda, y las ve cualquiera del equipo que abra el
 * cronograma (el cliente no). Sin `onCerrar` no hay «Entendido».
 *
 * ⚠ Archivo aparte a propósito: CronogramaCanvas.tsx está al tope del trinquete de grises
 * (lib/ui/token-vocab.test.ts). Esto nace con tokens del tema.
 */
export default function ObservacionesDelPaso1({
  observaciones,
  onCerrar,
}: {
  observaciones: readonly string[];
  onCerrar?: () => void;
}) {
  if (observaciones.length === 0) return null;
  return (
    <div role="status" className="rounded-xl border border-info-line bg-info-surface px-4 py-3 space-y-2">
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 text-xs font-semibold text-info-ink">{tituloDeLoQueNoto(observaciones.length)}</p>
        {onCerrar && (
          <button
            type="button"
            onClick={onCerrar}
            className="flex-shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:border-fg-muted hover:text-fg"
          >
            Entendido
          </button>
        )}
      </div>
      <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-info-ink">
        {observaciones.map((o, i) => (
          <li key={i}>{o}</li>
        ))}
      </ul>
    </div>
  );
}
