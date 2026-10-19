"use client";

/**
 * components/tareas/PropuestaDeTarea.tsx — una tarea por decidir, en una fila azul (FilaSugerida del sistema).
 *
 * Una fila corta (Elías, 2026-10-19: «tiene que ser muy simple»): el título, una línea con para quién y para cuándo, y
 * solo lo que pide una decisión ahí mismo («¿Es T-12?», el cliente que sugiere Nexus, «Revisa el título»). El contexto,
 * la cita y la historia están en el cajón: el título lo abre. Las acciones: Descartar, Usar y «Más» (Más adelante, No es
 * mía, Cambiar). Lo azul es lo que propuso Nexus; usarlo no lo pinta de verde ni lo mueve de lugar.
 *
 * De qué reunión salió lo dice el grupo (MisTareas agrupa por reunión); `conOrigen` lo muestra en la fila cuando la
 * fila va suelta.
 */
import { useState } from "react";
import Link from "next/link";
import { Menu } from "@/components/ui/Menu";
import { BotonTexto, BotonUsar, FilaSugerida } from "@/components/ui/sistema";
import { Chip } from "./chips";
import type { PersonaVista, TareaVista } from "@/lib/tareas/tipos";
import { diaCortoConSemana, horaDeCostaRica } from "@/lib/tareas/semana";

export type DecisionEnPantalla =
  | { tipo: "usar"; usarClienteSugerido?: boolean }
  | { tipo: "mas_adelante" }
  | { tipo: "rechazar" }
  | { tipo: "no_es_mia"; para: string }
  | { tipo: "misma"; otraId: string }
  | { tipo: "retirar" };

export function deDondeSale(t: TareaVista): string | null {
  if (t.salioDe?.visible) {
    const fecha = t.salioDe.fecha ? ` · ${diaCortoConSemana(horaDeCostaRica(t.salioDe.fecha).fecha)}` : "";
    return `De «${t.salioDe.titulo}»${fecha}`;
  }
  if (t.salioDe && !t.salioDe.visible) return t.salioDe.texto;
  if (t.pedidaPor) return `Te la sugiere ${t.pedidaPor.nombre}${t.pedidaPorEquipoNombre ? ` (${t.pedidaPorEquipoNombre})` : ""}`;
  return null;
}

export function PropuestaDeTarea({
  t,
  personas,
  ocupada,
  conOrigen = true,
  onDecidir,
  onAbrir,
}: {
  t: TareaVista;
  personas: readonly PersonaVista[];
  ocupada: boolean;
  /** Mostrar de dónde salió (en un grupo por reunión, el grupo ya lo dice). */
  conOrigen?: boolean;
  onDecidir: (t: TareaVista, d: DecisionEnPantalla) => void;
  onAbrir: (t: TareaVista) => void;
}) {
  const [pasar, setPasar] = useState(false);
  const [usarCliente, setUsarCliente] = useState(true);
  const s = t.sugerencias;
  const candidatas = s?.candidatas ?? [];
  const meta = [
    t.cliente ? t.ambito.etiqueta : null,
    t.venceEl ? `vence ${diaCortoConSemana(t.venceEl)}` : t.semana ? `semana del ${diaCortoConSemana(t.semana).split(" ").slice(1).join(" ")}` : null,
    conOrigen ? deDondeSale(t) : null,
  ].filter((x): x is string => !!x);
  const conAviso = (s?.cliente && !t.cliente) || s?.sinIa || s?.revisarTitulo;

  return (
    <FilaSugerida
      dataRecorrido="tareas.propuesta"
      encima={t.proyecto ? `Dentro de «${t.proyecto.nombre}»${t.proyecto.estado === "propuesta" ? " (sugerido)" : ""}` : undefined}
      origen={meta.length ? <span className={t.atrasada ? "min-w-0 truncate text-danger-ink" : "min-w-0 truncate"}>{meta.join(" · ")}</span> : undefined}
      debajo={
        <>
          {conAviso && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {s?.cliente && !t.cliente && (
                <Chip tono="azul" title="Nexus sugiere este cliente por lo que dice la línea">
                  {usarCliente ? `Para ${s.cliente.nombre}` : <s>Para {s.cliente.nombre}</s>}
                  <button type="button" className="ml-1 font-semibold hover:underline" onClick={() => setUsarCliente((x) => !x)}>
                    {usarCliente ? "Quitar" : "Usar"}
                  </button>
                </Chip>
              )}
              {s?.sinIa && <Chip tono="ambar">Sin revisar por la IA</Chip>}
              {s?.revisarTitulo && (
                <Chip tono="ambar" title="El título lo escribió la IA: se recortó o no suena a como hablamos. Edítalo antes de usarla.">
                  Revisa el título
                </Chip>
              )}
            </div>
          )}
          {candidatas.length > 0 && (
            <div className="mt-2 space-y-1">
              {candidatas.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-md border border-info-line bg-surface px-2.5 py-1.5 text-xs">
                  <span className="text-fg">
                    ¿Es <span className="font-semibold">T-{c.numero}</span> «{c.titulo}»{c.responsable ? ` (de ${c.responsable.split(" ")[0]})` : ""}?
                  </span>
                  <span className="ml-auto flex gap-1">
                    <BotonTexto disabled={ocupada} onClick={() => onDecidir(t, { tipo: "misma", otraId: c.id })}>
                      Sí, es esa
                    </BotonTexto>
                  </span>
                </div>
              ))}
            </div>
          )}
          {pasar && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-fg-secondary">¿De quién es?</span>
              {personas
                .filter((p) => p.email !== t.responsable?.email)
                .map((p) => (
                  <button
                    key={p.email}
                    type="button"
                    disabled={ocupada}
                    onClick={() => onDecidir(t, { tipo: "no_es_mia", para: p.email })}
                    className="rounded-full border border-line bg-surface px-2 py-[1px] text-[11px] text-fg-secondary hover:border-info-line hover:text-brand"
                  >
                    {p.nombre}
                  </button>
                ))}
            </div>
          )}
        </>
      }
      acciones={
        t.acciones.decidir ? (
          <>
            <BotonTexto disabled={ocupada} onClick={() => onDecidir(t, { tipo: "rechazar" })}>
              Descartar
            </BotonTexto>
            <Menu
              align="end"
              aria-label="Más opciones"
              triggerClassName="rounded-md px-2 py-1 text-xs font-medium text-fg-secondary hover:bg-surface-hover hover:text-fg disabled:opacity-50"
              trigger="Más"
              items={[
                { key: "mas_adelante", label: "Más adelante", disabled: ocupada, onSelect: () => onDecidir(t, { tipo: "mas_adelante" }) },
                { key: "no_es_mia", label: "No es mía", disabled: ocupada, onSelect: () => setPasar((x) => !x) },
                { key: "cambiar", label: "Cambiarla antes de usarla", onSelect: () => onAbrir(t) },
              ]}
            />
            <BotonUsar disabled={ocupada} onClick={() => onDecidir(t, { tipo: "usar", usarClienteSugerido: !!s?.cliente && usarCliente })} />
          </>
        ) : t.acciones.retirar ? (
          <BotonTexto disabled={ocupada} onClick={() => onDecidir(t, { tipo: "retirar" })}>
            Retirar el pedido
          </BotonTexto>
        ) : undefined
      }
    >
      <button type="button" onClick={() => onAbrir(t)} className="line-clamp-2 text-left hover:text-brand hover:underline" title="Abrir la tarea">
        {t.titulo}
      </button>
    </FilaSugerida>
  );
}

/**
 * Las propuestas agrupadas por la reunión de la que salieron: el grupo dice la reunión una vez y lleva a «Lo que dejó
 * esta reunión», donde se decide todo lo de esa reunión junto. Lo que no salió de una reunión que ves va suelto, con su
 * origen en la fila.
 */
export function PropuestasPorReunion({
  tareas,
  personas,
  ocupadas,
  onDecidir,
  onAbrir,
}: {
  tareas: readonly TareaVista[];
  personas: readonly PersonaVista[];
  ocupadas: ReadonlySet<string>;
  onDecidir: (t: TareaVista, d: DecisionEnPantalla) => void;
  onAbrir: (t: TareaVista) => void;
}) {
  const grupos: { clave: string; salio: Extract<TareaVista["salioDe"], { visible: true }> | null; tareas: TareaVista[] }[] = [];
  for (const t of tareas) {
    const salio = t.salioDe?.visible ? t.salioDe : null;
    const clave = salio ? salio.sesionId : "";
    const g = grupos.find((x) => x.clave === clave);
    if (g) g.tareas.push(t);
    else grupos.push({ clave, salio, tareas: [t] });
  }
  return (
    <div className="space-y-3">
      {grupos.map((g) => (
        <div key={g.clave || "sueltas"} className="space-y-1.5">
          {g.salio && (
            <div className="flex flex-wrap items-baseline gap-x-2 px-1 text-xs">
              <span className="min-w-0 truncate font-medium text-fg-secondary">
                De «{g.salio.titulo}»{g.salio.fecha ? ` · ${diaCortoConSemana(horaDeCostaRica(g.salio.fecha).fecha)}` : ""}
                {g.tareas[0]?.cliente ? ` · ${g.tareas[0].cliente.nombre}` : ""}
              </span>
              <Link href={`/sessions/${encodeURIComponent(g.salio.sesionId)}#lo-que-dejo`} className="font-medium text-brand hover:underline">
                Decidir en la reunión
              </Link>
            </div>
          )}
          <ul className="space-y-1.5">
            {g.tareas.map((t) => (
              <PropuestaDeTarea key={t.id} t={t} personas={personas} ocupada={ocupadas.has(t.id)} conOrigen={!g.salio} onDecidir={onDecidir} onAbrir={onAbrir} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
