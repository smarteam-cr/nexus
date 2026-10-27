/**
 * «El criterio» del análisis de la venta (S1, 2026-10-25; vino de Sesiones › «Reuniones de venta», que se retiró el
 * 2026-10-27: S6): el proceso consultivo escrito que mira el analizador y el posicionamiento (las reuniones de referencia se
 * quitaron el 2026-10-27).
 * Server component, solo tokens.
 */
import { PROCESO_CONSULTIVO, PUNTOS_DEL_ANALISIS, SIN_POSICIONAMIENTO, VERSION_DEL_CRITERIO } from "@/lib/analizador-venta/criterio";

export function ElCriterio({ positionStatement }: { positionStatement: string | null }) {
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-fg-secondary">
        Lo que mira el analizador en cada reunión de venta (versión {VERSION_DEL_CRITERIO}). Es la primera propuesta: la revisan Elías y Andrés, y lo que haya que
        cambiar se cambia en el código (lib/analizador-venta/criterio.ts) con una versión nueva.
      </p>
      <section aria-label="El proceso consultivo" className="space-y-3">
        <h2 className="text-sm font-semibold text-fg">El proceso consultivo</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {PROCESO_CONSULTIVO.map((e, i) => (
            <div key={e.id} className="space-y-2 rounded-xl border border-line bg-surface p-4">
              <p className="text-sm font-semibold text-fg">
                {i + 1}. {e.nombre}
              </p>
              <p className="text-[13px] leading-[19px] text-fg">{e.seEspera}</p>
              <p className="text-xs text-success-ink">Se hizo si: {e.seHizo.join("; ")}.</p>
              <p className="text-xs text-warn-ink">Se saltó si: {e.seSalto.join("; ")}.</p>
            </div>
          ))}
        </div>
      </section>
      <section aria-label="Lo que responde cada análisis" className="space-y-2">
        <h2 className="text-sm font-semibold text-fg">Lo que responde cada análisis</h2>
        <ol className="list-decimal space-y-1 pl-5 text-[13px] text-fg">
          {PUNTOS_DEL_ANALISIS.map((p) => (
            <li key={p.id}>{p.titulo}</li>
          ))}
        </ol>
        <p className="text-xs text-fg-muted">Cada juicio trae su cita textual de la transcripción; sin cita, no hay juicio. No hay puntaje ni ranking entre vendedores.</p>
      </section>
      <section aria-label="El posicionamiento" className="space-y-1">
        <h2 className="text-sm font-semibold text-fg">El posicionamiento de Smarteam</h2>
        <p className="text-[13px] text-fg">{positionStatement?.trim() || SIN_POSICIONAMIENTO}</p>
      </section>
    </div>
  );
}
