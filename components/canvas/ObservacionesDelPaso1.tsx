"use client";

/**
 * components/canvas/ObservacionesDelPaso1.tsx — «LA IA TAMBIÉN NOTÓ», CUANDO NO HAY ACORDEÓN.
 *
 * El paso 1 de «Regenerar todo» deja observaciones: lo que la IA notó al revisar las fases y lo
 * ACORDADO que no se pudo proponer solo (una fase en una semana que ya pasó, un cambio sobre la
 * Semana 0…). El aviso de la pantalla dice «los ves en «La IA también notó» y decides tú», y esa
 * lista vivía SOLO en el acordeón del paso 2. Si el paso 2 fallaba o volvía sin tareas, el acordeón
 * no se abría y lo acordado no aparecía nunca: para verlo había que volver a pagar el paso 1
 * (revisión adversarial, 2026-09-24). Esta franja lo muestra mientras no haya acordeón.
 *
 * ⚠ Archivo aparte a propósito: CronogramaCanvas.tsx está al tope del trinquete de grises
 * (lib/ui/token-vocab.test.ts). Esto nace con tokens del tema.
 */
export default function ObservacionesDelPaso1({
  observaciones,
  onCerrar,
}: {
  observaciones: readonly string[];
  onCerrar: () => void;
}) {
  if (observaciones.length === 0) return null;
  return (
    <div role="status" className="rounded-xl border border-info-line bg-info-surface px-4 py-3 space-y-2">
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 text-xs font-semibold text-info-ink">
          La IA también notó (al revisar las fases y los tiempos)
        </p>
        <button
          type="button"
          onClick={onCerrar}
          className="flex-shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:border-fg-muted hover:text-fg"
        >
          Entendido
        </button>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-info-ink">
        {observaciones.map((o, i) => (
          <li key={i}>{o}</li>
        ))}
      </ul>
      <p className="text-[11px] leading-snug text-fg-muted">
        Solo lo ves tú. Nada de esto se aplicó: si corresponde, cámbialo a mano en el Gantt.
      </p>
    </div>
  );
}
