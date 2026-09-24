"use client";

/**
 * components/canvas/PasoDeTareasPendiente.tsx — «FALTA EL PASO 2» DE «REGENERAR TODO».
 *
 * «Regenerar todo el cronograma» con reuniones o notas elegidas corre en dos pasos: primero la IA
 * propone cambios de fases y tiempos (el CSE los decide en el Gantt) y después arma las tareas
 * sobre esa estructura. Si la cadena arrancó en ESTA pantalla, el paso 2 sigue solo al resolver la
 * última sugerencia. Si no —el CSE recargó a mitad de camino, o las sugerencias las resolvió otra
 * persona—, esta franja lo OFRECE: un agente de un minuto y medio no se dispara solo para quien no
 * lo pidió.
 *
 * ⚠ Archivo aparte a propósito: CronogramaCanvas.tsx está al tope del trinquete de grises
 * (lib/ui/token-vocab.test.ts). Esto nace con tokens del tema.
 */
export default function PasoDeTareasPendiente({
  trabajando,
  onGenerar,
  onCerrar,
}: {
  /** Ya hay una generación en curso: el botón no puede lanzar otra. */
  trabajando: boolean;
  onGenerar: () => void;
  onCerrar: () => void;
}) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-info-line bg-info-surface px-4 py-3"
    >
      <p className="min-w-0 flex-1 text-xs leading-relaxed text-info-ink">
        <span className="font-semibold">Las fases quedaron decididas.</span> Falta el paso 2: las tareas
        sobre esta estructura.
      </p>
      <span className="flex flex-shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onGenerar}
          disabled={trabajando}
          className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {trabajando ? "Armando la propuesta…" : "Generar las tareas ahora"}
        </button>
        <button
          type="button"
          onClick={onCerrar}
          disabled={trabajando}
          className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:border-fg-muted hover:text-fg disabled:opacity-50"
        >
          Ahora no
        </button>
      </span>
    </div>
  );
}
