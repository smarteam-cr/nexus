"use client";

/**
 * components/tareas/PropuestaDeTarea.tsx — una tarea por decidir, en una fila azul (FilaSugerida del sistema).
 *
 * Usar · Más adelante · Descartar, y lo que corresponda: «¿Es T-12?» (la tarea que ya existe), «No es mía», el cliente
 * que sugiere Nexus. Lo azul es lo que propuso Nexus; usarlo no lo pinta de verde ni lo mueve de lugar: la fila se va
 * de «Por decidir» y aparece en su semana.
 */
import { useState } from "react";
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

function deDondeSale(t: TareaVista): string | null {
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
  onDecidir,
  onAbrir,
}: {
  t: TareaVista;
  personas: readonly PersonaVista[];
  ocupada: boolean;
  onDecidir: (t: TareaVista, d: DecisionEnPantalla) => void;
  onAbrir: (t: TareaVista) => void;
}) {
  const [verCita, setVerCita] = useState(false);
  const [pasar, setPasar] = useState(false);
  const [usarCliente, setUsarCliente] = useState(true);
  const s = t.sugerencias;
  const origen = deDondeSale(t);
  const cita = t.salioDe?.visible ? t.salioDe.cita : null;
  const candidatas = s?.candidatas ?? [];

  return (
    <FilaSugerida
      dataRecorrido="tareas.propuesta"
      encima={t.proyecto ? `Dentro de «${t.proyecto.nombre}»${t.proyecto.estado === "propuesta" ? " (sugerido)" : ""}` : undefined}
      origen={
        origen ? (
          <>
            <span className="min-w-0 truncate">{origen}</span>
            {cita && (
              <button type="button" aria-expanded={verCita} className="flex-shrink-0 font-medium text-brand hover:underline" onClick={() => setVerCita((x) => !x)}>
                {verCita ? "ocultar" : s?.deLaConversacion ? "ver lo que se dijo" : "ver la línea"}
              </button>
            )}
          </>
        ) : undefined
      }
      debajo={
        <>
          {verCita && cita && <p className="mt-2 border-l-2 border-info-line bg-surface px-2.5 py-2 text-xs italic leading-relaxed text-fg-secondary">«{cita}»</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {t.semana && <Chip>Semana del {diaCortoConSemana(t.semana).split(" ").slice(1).join(" ")}</Chip>}
            {t.venceEl && <Chip tono={t.atrasada ? "rojo" : "neutro"}>Vence {diaCortoConSemana(t.venceEl)}</Chip>}
            {t.cliente && <Chip>{t.ambito.etiqueta}</Chip>}
            {s?.cliente && !t.cliente && (
              <Chip tono="azul" title="Nexus sugiere este cliente por lo que dice la línea">
                {usarCliente ? `Para ${s.cliente.nombre}` : <s>Para {s.cliente.nombre}</s>}
                <button type="button" className="ml-1 font-semibold hover:underline" onClick={() => setUsarCliente((x) => !x)}>
                  {usarCliente ? "Quitar" : "Usar"}
                </button>
              </Chip>
            )}
            {s?.menciones?.map((m) => (
              <Chip key={m.nombreDicho} title={m.candidatos.map((c) => c.nombre).join(" o ")}>
                Menciona a {m.nombreDicho}
              </Chip>
            ))}
            {s?.sinIa && <Chip tono="ambar">Sin revisar por la IA</Chip>}
            {s?.deLaConversacion && <Chip title="Nexus la sacó de lo que se dijo en la reunión, no de las notas">De la conversación</Chip>}
            {s?.revisarTitulo && (
              <Chip tono="ambar" title="El título lo escribió la IA: se recortó o no suena a como hablamos. Edítalo antes de usarla.">
                Revisa el título
              </Chip>
            )}
          </div>
          {candidatas.length > 0 && (
            <div className="mt-2 space-y-1">
              {candidatas.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-md border border-info-line bg-surface px-2.5 py-1.5 text-xs">
                  <span className="text-fg">
                    ¿Es <span className="font-semibold">T-{c.numero}</span> «{c.titulo}»{c.responsable ? ` (de ${c.responsable.split(" ")[0]}` : ""}
                    {c.pases ? ` · pasó ${c.pases === 1 ? "1 vez" : `${c.pases} veces`}` : ""}
                    {c.responsable ? ")" : ""}?
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
            <BotonTexto disabled={ocupada} onClick={() => setPasar((x) => !x)}>
              No es mía
            </BotonTexto>
            <BotonTexto disabled={ocupada} onClick={() => onDecidir(t, { tipo: "mas_adelante" })}>
              Más adelante
            </BotonTexto>
            <BotonTexto disabled={ocupada} onClick={() => onAbrir(t)}>
              Cambiar
            </BotonTexto>
            <BotonUsar disabled={ocupada} onClick={() => onDecidir(t, { tipo: "usar", usarClienteSugerido: !!s?.cliente && usarCliente })} />
          </>
        ) : t.acciones.retirar ? (
          <BotonTexto disabled={ocupada} onClick={() => onDecidir(t, { tipo: "retirar" })}>
            Retirar el pedido
          </BotonTexto>
        ) : undefined
      }
    >
      {t.titulo}
      {t.contexto && <span className="block line-clamp-3 text-[13px] leading-snug text-fg-secondary">{t.contexto}</span>}
      {t.notas && <span className="block text-[13px] leading-snug text-fg-secondary">{t.notas}</span>}
    </FilaSugerida>
  );
}
