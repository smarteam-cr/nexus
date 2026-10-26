/**
 * «El criterio» del análisis de la venta (S1, 2026-10-25; vino de Sesiones › «Reuniones de venta», que se retiró el
 * 2026-10-27: S6): el proceso consultivo escrito que mira el analizador, el posicionamiento y las reuniones de referencia.
 * Server component, solo tokens.
 */
import Link from "next/link";
import { PROCESO_CONSULTIVO, PUNTOS_DEL_ANALISIS, SIN_POSICIONAMIENTO, VERSION_DEL_CRITERIO } from "@/lib/analizador-venta/criterio";

const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "short", timeZone: "America/Costa_Rica" }).replace(".", "");

export function ElCriterio({ positionStatement, referencias }: { positionStatement: string | null; referencias: { sessionId: string; titulo: string; fecha: string; nota: string | null }[] }) {
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
      <section aria-label="Reuniones de referencia" className="space-y-1">
        <h2 className="text-sm font-semibold text-fg">Reuniones de referencia</h2>
        {referencias.length ? (
          <ul className="space-y-1 text-[13px]">
            {referencias.map((r) => (
              <li key={r.sessionId}>
                <Link href={`/sessions/${r.sessionId}`} className="font-semibold text-brand hover:text-brand-dark">
                  {r.titulo}
                </Link>{" "}
                <span className="text-fg-muted">({fechaCorta(r.fecha)})</span>
                {r.nota && <span className="text-fg-secondary"> — {r.nota}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-fg-secondary">
            Ninguna todavía. La candidata es «Camosa l Exploración de retos operativos» (23 oct): en su preventa, abre la sesión › Análisis › «Cómo trabajaste
            esta sesión» y usa «Marcar como referencia». Se muestran al lado de cada análisis para comparar; el analizador no las lee (son de otra empresa).
          </p>
        )}
      </section>
    </div>
  );
}
