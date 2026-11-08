"use client";

/**
 * AgendaDeLaGuia — la guía de una sesión como agenda por bloques (2026-11-06, lib/exploraciones/agenda.ts). Arriba, el
 * objetivo y lo que hay que tener claro al terminar; debajo, los bloques. Desde el 2026-11-07 (la guía en bloques, Elías)
 * cada bloque se lee así: a la izquierda su rango de minutos, repartido según la duración de la sesión; de título, lo que
 * hay que averiguar; la pregunta para abrir, en cursiva; una guía corta; y tres preguntas para profundizar. Lo que hay
 * que averiguar sigue debajo, compacto, con sus casillas (las marcas de «En vivo» y de la lectura dependen de ellas).
 * Se lee de un vistazo durante la reunión: en la Preparación y en «En vivo» es la misma, con las mismas marcas.
 */
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { APERTURA_DEL_RESULTADO, faltaElResultadoEnVivo } from "@/lib/exploraciones/resultado";
import {
  alternarAveriguada,
  avanceDeLaAgenda,
  estaAveriguada,
  paraProfundizar,
  rangoDelBloque,
  repartirMinutos,
  type AgendaDeLaGuia as Agenda,
  type CosaPorAveriguar,
} from "@/lib/exploraciones/agenda";
import type { GuiaDeLaSesion, PestanaDeSesion } from "@/lib/exploraciones/guia";
import { duracionDeLaSesion } from "@/lib/exploraciones/contexto-de-la-exploracion";
import { diaCorto } from "@/lib/exploraciones/fechas";
import type { MomentoDeLaSesion } from "./contexto";
import { useLienzo } from "./contexto";
import { Rotulo, useEditarLaSesion } from "./piezas-de-la-sesion";

const sinComillas = (t: string) => t.replace(/^«|»$/g, "");

/** Una cosa por averiguar, compacta: su casilla y lo que hay que saber (las preguntas ya están arriba, en el bloque). */
function Cosa({ c, marcada, alMarcar, puede }: { c: CosaPorAveriguar; marcada: boolean; alMarcar: () => void; puede: boolean }) {
  return (
    <li className="flex items-start gap-2 py-0.5">
      <input
        type="checkbox"
        checked={marcada}
        disabled={!puede}
        onChange={alMarcar}
        aria-label={`Ya se sabe: ${c.que}`}
        className="mt-[2px] h-3.5 w-3.5 flex-shrink-0 accent-brand"
      />
      <p className={cn("min-w-0 flex-1 text-[12.5px] leading-[18px]", marcada ? "text-fg-muted" : "text-fg-secondary")}>
        {c.que}
        {c.sabido && <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-fg-muted">Ya se sabía · {c.sabido}</span>}
      </p>
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
  /* Los minutos, repartidos según la duración de la sesión (2026-11-07): si la cambiaron después de armar la guía, los
     bloques se ajustan solos. La de la sesión sale de su reunión del calendario; sin ella ni duración guardada, la que
     trae la agenda. */
  const delaAgenda = agenda.bloques.length ? agenda.bloques[agenda.bloques.length - 1].hasta : 0;
  const s = pestana.sesion;
  const duracion = s?.duracion || s?.evento?.fin ? duracionDeLaSesion(s) : delaAgenda;
  const bloques = duracion > 0 ? repartirMinutos(agenda.bloques, duracion) : agenda.bloques;
  /* «En vivo» (2026-11-06): pasada la mitad sin saber qué resultado busca, aviso. Empieza a la hora de la reunión o, sin
     ella, cuando se abrió esta pestaña. Se mira cada 30 segundos. */
  const enVivo = momento === "durante";
  const [abierta] = useState(() => Date.now());
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!enVivo) return;
    const t = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [enVivo]);
  const inicioDeLaReunion = Date.parse(pestana.sesion?.evento?.inicio ?? pestana.sesion?.reunion?.inicio ?? "");
  const inicio = Number.isFinite(inicioDeLaReunion) && inicioDeLaReunion <= ahora ? inicioDeLaReunion : abierta;
  const sinResultado = enVivo && faltaElResultadoEnVivo({ agenda, hechas, inicio, ahora, minutos: duracion || 60 });

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
      {sinResultado && (
        <p role="status" className="border-b border-warn-line bg-warn-surface px-[18px] py-2.5 text-[13.5px] text-warn-ink">
          <span className="font-semibold">Todavía no sabes qué resultado busca.</span> Vuelve a «{APERTURA_DEL_RESULTADO}»
        </p>
      )}
      <ol>
        {bloques.map((b, i) => {
          const profundizar = paraProfundizar(b);
          const sabidasDelBloque = b.averiguar.filter((c) => estaAveriguada(c, hechas)).length;
          return (
            <li key={i} className={cn("flex gap-4 border-b border-line px-[18px] py-4 last:border-b-0", b.central && "bg-surface-muted")}>
              <div className="w-[52px] flex-none pt-[3px] text-[12.5px] font-medium tabular-nums text-fg-muted" aria-label={`Del minuto ${b.desde} al ${b.hasta}`}>
                {rangoDelBloque(b)}
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-[14.5px] font-semibold leading-5 text-fg">{b.titulo}</h4>
                  {b.central && <span className="rounded-full border border-info-line bg-info-surface px-2 py-0.5 text-[11px] font-semibold text-info-ink">Bloque central: sin prisa</span>}
                </div>
                <p className="text-[14px] italic leading-[21px] text-fg">«{sinComillas(b.abre)}»</p>
                {b.guia && <p className="text-[13.5px] leading-5 text-fg-secondary">{b.guia}</p>}
                {profundizar.length > 0 && (
                  <div className="pt-0.5">
                    <p className="text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Para profundizar</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] leading-[19px] text-fg-secondary marker:text-fg-muted">
                      {profundizar.map((p, k) => (
                        <li key={k}>{sinComillas(p)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {b.impacto && <p className="text-[12.5px] leading-[18px] text-fg-muted">Para medir el dolor: {b.impacto}</p>}
                {b.averiguar.length > 0 && (
                  <div className="rounded-lg border border-line px-2.5 py-1.5">
                    <p className="text-[11.5px] font-medium text-fg-muted">
                      Lo que hay que averiguar · {sabidasDelBloque} de {b.averiguar.length}
                    </p>
                    <ul className="mt-0.5">
                      {b.averiguar.map((c) => (
                        <Cosa key={c.id} c={c} marcada={estaAveriguada(c, hechas)} alMarcar={() => marcar(c)} puede={editable && !guardando} />
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * La guía con el formato de antes, plegada (2026-11-06, Elías): no se borra; queda como versión anterior mientras la
 * nueva se arma con el contexto. Solo lectura.
 */
export function GuiaAnterior({ guia }: { guia: GuiaDeLaSesion }) {
  return (
    <details className="rounded-xl border border-line bg-surface">
      <summary className="cursor-pointer select-none px-[18px] py-3.5 text-sm font-semibold text-fg">
        Guía anterior <span className="text-[13px] font-normal text-fg-muted">· del {diaCorto(guia.en)}, con el formato de antes</span>
      </summary>
      <div className="space-y-2.5 border-t border-line px-[18px] py-3.5 text-[13.5px] leading-5">
        {guia.objetivo && <p className="text-fg">{guia.objetivo}</p>}
        {guia.apertura.map((a, i) => (
          <p key={`a-${i}`} className="text-fg-secondary">
            «{a.replace(/^«|»$/g, "")}»
          </p>
        ))}
        <ol className="list-decimal space-y-1.5 pl-5">
          {[...guia.preguntas.map((p) => ({ k: p.para, q: p.pregunta, r: p.repreguntas })), ...(guia.loVendido ?? []).map((v) => ({ k: v.id, q: v.pregunta, r: v.repreguntas }))].map((p) => (
            <li key={p.k} className="text-fg">
              {p.q}
              {p.r.length > 0 && <span className="block text-[12.5px] text-fg-muted">{p.r.join(" · ")}</span>}
            </li>
          ))}
        </ol>
        {guia.cierre && <p className="text-fg-secondary">Cierre: {guia.cierre}</p>}
      </div>
    </details>
  );
}
