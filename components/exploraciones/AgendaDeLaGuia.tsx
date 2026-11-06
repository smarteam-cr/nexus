"use client";

/**
 * AgendaDeLaGuia — la guía de una sesión como agenda por bloques (2026-11-06, lib/exploraciones/agenda.ts). Arriba, el
 * objetivo y lo que hay que tener claro al terminar; debajo, los bloques con sus minutos, su pregunta para abrir y lo
 * que hay que averiguar, cada cosa con su casilla y sus preguntas sugeridas. Se lee de un vistazo durante la reunión:
 * en la Preparación y en «En vivo» es la misma, con las mismas marcas.
 */
import { cn } from "@/lib/cn";
import { alternarAveriguada, avanceDeLaAgenda, estaAveriguada, minutosDelBloque, type AgendaDeLaGuia as Agenda, type CosaPorAveriguar } from "@/lib/exploraciones/agenda";
import type { PestanaDeSesion } from "@/lib/exploraciones/guia";
import type { MomentoDeLaSesion } from "./contexto";
import { useLienzo } from "./contexto";
import { Rotulo, useEditarLaSesion } from "./piezas-de-la-sesion";

function Cosa({ c, marcada, alMarcar, puede }: { c: CosaPorAveriguar; marcada: boolean; alMarcar: () => void; puede: boolean }) {
  return (
    <li className="flex gap-2.5 py-1.5">
      <input
        type="checkbox"
        checked={marcada}
        disabled={!puede}
        onChange={alMarcar}
        aria-label={`Ya se sabe: ${c.que}`}
        className="mt-[3px] h-4 w-4 flex-shrink-0 accent-brand"
      />
      <div className="min-w-0 flex-1">
        <p className={cn("text-[14px] font-semibold leading-5", marcada ? "text-fg-muted" : "text-fg")}>
          {c.que}
          {c.sabido && <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-fg-muted">Ya se sabía · {c.sabido}</span>}
        </p>
        {!marcada &&
          c.preguntas.map((p, i) => (
            <p key={i} className="mt-0.5 text-[13px] leading-[19px] text-fg-secondary">
              «{p.replace(/^«|»$/g, "")}»
            </p>
          ))}
      </div>
    </li>
  );
}

export function AgendaDeLaGuia({
  pestana,
  agenda,
  objetivo,
  momento,
  editable,
}: {
  pestana: PestanaDeSesion;
  agenda: Agenda;
  objetivo: string | null;
  momento: MomentoDeLaSesion;
  /** Se pueden marcar las cosas (quien puede editar la exploración). */
  editable: boolean;
}) {
  const { guardando } = useLienzo();
  const editar = useEditarLaSesion(pestana, momento);
  const hechas = pestana.sesion?.hechas;
  const { sabidas, total } = avanceDeLaAgenda(agenda, hechas);
  const marcar = (c: CosaPorAveriguar) => void editar((x) => ({ ...x, hechas: alternarAveriguada(c, x.hechas) }));
  const duracion = agenda.bloques.length ? agenda.bloques[agenda.bloques.length - 1].hasta : 0;

  return (
    <section data-recorrido="preventa.sesion.preguntas" className="overflow-hidden rounded-xl border border-line bg-surface">
      <header className="space-y-2.5 border-b border-line px-[18px] py-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h3 className="text-[15px] font-semibold text-fg">La guía</h3>
          <span className="text-[12.5px] text-fg-muted">
            {duracion} min · {agenda.bloques.length} bloques · {sabidas} de {total} averiguadas
          </span>
        </div>
        {objetivo && <p className="text-[14px] leading-5 text-fg">{objetivo}</p>}
        <div>
          <Rotulo>Al terminar, tenemos que tener claro</Rotulo>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13.5px] leading-5 text-fg-secondary">
            {agenda.claves.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
        {agenda.fraseDeDemo && (
          <p className="rounded-lg border border-info-line bg-info-surface px-3 py-2 text-[13px] leading-[19px] text-fg">
            <span className="font-semibold">Si piden un demo o precios: </span>«{agenda.fraseDeDemo.replace(/^«|»$/g, "")}»
          </p>
        )}
      </header>
      <ol>
        {agenda.bloques.map((b, i) => (
          <li key={i} className={cn("flex gap-4 border-b border-line px-[18px] py-3.5 last:border-b-0", b.central && "bg-surface-muted")}>
            <div className="w-[72px] flex-none pt-0.5 text-[12px] font-medium text-fg-muted">{minutosDelBloque(b)}</div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-[14.5px] font-semibold text-fg">{b.titulo}</h4>
                {b.central && <span className="rounded-full border border-info-line bg-info-surface px-2 py-0.5 text-[11px] font-semibold text-info-ink">Bloque central: sin prisa</span>}
              </div>
              <p className={cn("text-[14px] leading-5", b.tipo === "cuerpo" ? "font-medium text-brand" : "text-fg")}>«{b.abre.replace(/^«|»$/g, "")}»</p>
              {b.averiguar.length > 0 && (
                <ul>
                  {b.averiguar.map((c) => (
                    <Cosa key={c.id} c={c} marcada={estaAveriguada(c, hechas)} alMarcar={() => marcar(c)} puede={editable && !guardando} />
                  ))}
                </ul>
              )}
              {b.impacto && <p className="text-[12.5px] leading-[18px] text-fg-muted">Para medir el dolor: {b.impacto}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
