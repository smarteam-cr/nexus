"use client";

/**
 * Propuestas — lo que sugirió el agente para una casilla, como FILAS azules (diseño del 2026-10-03,
 * «Una sugerencia, en su lugar»): qué propone, de dónde sale en una línea —la cita completa y el
 * porqué al tocar «ver de dónde sale»— y a la derecha «Descartar» en texto y «Usar» como botón.
 * Azul es siempre «lo sugiere el agente y espera tu decisión»; nunca una tarjeta grande.
 *
 * Va EN su lugar (debajo de la casilla, en la fila de la dimensión…): se decide mirando lo que ya
 * está confirmado al lado. Lo descartado no vuelve (queda su lápida).
 */
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { BotonAzul, BotonTexto } from "./FranjaDeSugerencias";
import { cn } from "@/lib/cn";
import { dondeQuedoLoUsado, ordenarPorGrupo, type GrupoDeDestino } from "@/lib/exploraciones/lo-que-aprendimos";
import { ConfirmDialog } from "@/components/ui";
import CollapsibleSection from "@/components/ui/CollapsibleSection";
import { BotonUsar, FilaSugerida as FilaSugeridaDelSistema } from "@/components/ui/sistema";
import { useMe } from "@/hooks/useMe";
import { etiquetaDelLote, horaDelUso, loQueVaAPasar, type LugarDelLote } from "@/lib/exploraciones/usar-sugerencias";
import {
  ETIQUETA_DE_LA_OBJECION,
  ETIQUETA_DEL_CANAL,
  ETIQUETA_DEL_MODELO,
  ETIQUETA_DEL_ROL,
  type EstrategiaDeConexion,
  type Radiografia,
  type Apertura,
  type Meta,
  type Objecion,
  type Persona,
  type Reto,
  type SiguientePaso,
} from "@/lib/exploraciones/casillas";
import {
  esFuenteDeHipotesis,
  ETIQUETA_DEL_MOTIVO,
  sePuedeDeshacer,
  type AExplorar,
  type DestinoDePropuesta,
  type CasoDeUsoElegido,
  type EstadoDeCriterio,
  type EstimadoGuardado,
  type ItemPropuesto,
  type UsoDeSugerencia,
} from "@/lib/exploraciones/contenido";
import type { EscalaDelLienzo } from "@/lib/exploraciones/escala-del-lienzo";
import type { Letra } from "@/lib/escala/documento/tipos";
import { useLienzo } from "./contexto";

const ESTADO_DEL_CRITERIO: Record<EstadoDeCriterio["estado"], string> = {
  tiene: "Lo tiene",
  no_tiene: "No lo tiene",
  no_se: "No se sabe",
};

const APERTURA: Record<Apertura["valor"], string> = { si: "Sí", no: "No", no_se: "No se sabe todavía" };

function nombreDeDimension(escala: EscalaDelLienzo, id: string): string {
  for (const a of escala.areas) {
    const d = a.dimensiones.find((x) => x.id === id);
    if (d) return d.nombre;
  }
  return id;
}

/** El valor propuesto, dicho en una línea. */
export function describirPropuesta(item: ItemPropuesto, escala: EscalaDelLienzo, nombreDeNivel: (l: Letra) => string): string {
  const v = item.valor;
  const d = item.destino;
  switch (d.tipo) {
    case "casilla":
      switch (d.clave) {
        case "metas": {
          const m = v as Meta;
          const cifras = [m.actual && `de ${m.actual}`, m.objetivo && `a ${m.objetivo}`, m.para && `para ${m.para}`].filter(Boolean).join(" ");
          return cifras ? `${m.que} — ${cifras}` : m.que;
        }
        case "retos": {
          const r = v as Reto;
          return r.dimensionId ? `${r.texto} (${nombreDeDimension(escala, r.dimensionId)})` : r.texto;
        }
        case "autoridad": {
          const p = v as Persona;
          return `${p.nombre}${p.cargo ? `, ${p.cargo}` : ""} — ${ETIQUETA_DEL_ROL[p.rol]}${p.nota ? `. ${p.nota}` : ""}`;
        }
        case "siguientePaso": {
          const s = v as SiguientePaso;
          return [s.que, s.fecha, s.conQuien && `con ${s.conQuien}`].filter(Boolean).join(" · ");
        }
        case "radiografia": {
          const r = v as Radiografia;
          return [
            r.sector,
            r.modelos?.map((m) => ETIQUETA_DEL_MODELO[m]).join(", "),
            r.stack?.length ? `${r.stack.length} herramientas` : null,
            r.hitos?.length ? `${r.hitos.length} hitos` : null,
          ]
            .filter(Boolean)
            .join(" · ");
        }
        case "estrategiaDeConexion": {
          const e = v as EstrategiaDeConexion;
          return `${ETIQUETA_DEL_CANAL[e.canal]}: ${e.pitch}`;
        }
        case "objeciones": {
          const o = v as Objecion;
          return `${o.texto} (${ETIQUETA_DE_LA_OBJECION[o.clase].toLowerCase()})${o.respuesta ? ` — se respondió: ${o.respuesta}` : ""}`;
        }
        case "apertura": {
          const a = v as Apertura;
          return `${APERTURA[a.valor]}${a.porQue ? `: ${a.porQue}` : ""}`;
        }
        default:
          return String(v);
      }
    case "nivel": {
      const e = v as EstimadoGuardado;
      if (esFuenteDeHipotesis(e.fuente)) return `${nombreDeNivel(e.nivel)} (hipótesis)`;
      return `${nombreDeNivel(e.nivel)}${e.evidencia ? ` — «${e.evidencia}»` : ""}`;
    }
    case "falta": {
      const f = v as EstadoDeCriterio;
      return `${ESTADO_DEL_CRITERIO[f.estado]}${f.cita ? ` — «${f.cita}»` : ""}`;
    }
    case "aExplorar": {
      const a = v as AExplorar;
      // La razón va en su propia línea (item.razon); acá solo si es otra.
      const motivo = a.motivo === "otro" ? "" : ` (${ETIQUETA_DEL_MOTIVO[a.motivo].charAt(0).toLowerCase()}${ETIQUETA_DEL_MOTIVO[a.motivo].slice(1)})`;
      return `Explorar a fondo: ${nombreDeDimension(escala, d.dimensionId)}${a.razon && a.razon !== item.razon ? `. ${a.razon}` : motivo}`;
    }
    case "area":
      return escala.areas.find((a) => a.id === d.areaId)?.nombre ?? d.areaId;
    case "edicion": {
      const slug = (v as { slug: string | null }).slug;
      return slug ? (escala.ediciones.find((e) => e.slug === slug)?.nombre ?? slug) : "Escala general";
    }
    case "perfil": {
      const p = v as { cierre: string; despues: string };
      return `Venta ${p.cierre === "con equipo" ? "con equipo" : p.cierre} · relación ${p.despues}`;
    }
    case "casoDeUso": {
      const caso = v as CasoDeUsoElegido;
      const area = caso.areaId ? escala.areas.find((a) => a.id === caso.areaId)?.nombre : null;
      return `${caso.titulo}${area ? ` · ${area}` : ""}`;
    }
  }
}

/**
 * Lo propuesto en una línea corta, para las listas compactas de «Lo que aprendimos» (2026-11-08): sin la cita, la nota ni
 * el porqué, que quedan a un clic. `antes` es la dimensión o el criterio (va primero: «Uso del CRM: Inicial»); `despues`,
 * la dimensión de un reto.
 */
export function lineaCorta(item: ItemPropuesto, escala: EscalaDelLienzo, nombreDeNivel: (l: Letra) => string): { antes?: string; texto: string; despues?: string } {
  const v = item.valor;
  const d = item.destino;
  switch (d.tipo) {
    case "nivel": {
      const e = v as EstimadoGuardado;
      return { antes: nombreDeDimension(escala, d.dimensionId), texto: `${nombreDeNivel(e.nivel)}${esFuenteDeHipotesis(e.fuente) ? " (hipótesis)" : ""}` };
    }
    case "aExplorar":
      return { antes: nombreDeDimension(escala, d.dimensionId), texto: "explorar a fondo" };
    case "falta":
      return { antes: "Criterio", texto: ESTADO_DEL_CRITERIO[(v as EstadoDeCriterio).estado] };
    case "area":
      return { antes: "Área en juego", texto: describirPropuesta(item, escala, nombreDeNivel) };
    case "casilla":
      if (d.clave === "retos") {
        const r = v as Reto;
        return { texto: r.texto, despues: r.dimensionId ? nombreDeDimension(escala, r.dimensionId) : undefined };
      }
      if (d.clave === "autoridad") {
        const p = v as Persona;
        return { texto: `${p.nombre}${p.cargo ? `, ${p.cargo}` : ""} — ${ETIQUETA_DEL_ROL[p.rol]}` };
      }
      return { texto: describirPropuesta(item, escala, nombreDeNivel) };
    default:
      return { texto: describirPropuesta(item, escala, nombreDeNivel) };
  }
}

/** La línea corta como texto plano (para comparar con la completa y para el `title`). */
function lineaCortaEnTexto(l: ReturnType<typeof lineaCorta>): string {
  return `${l.antes ? `${l.antes}: ` : ""}${l.texto}${l.despues ? ` · ${l.despues}` : ""}`;
}

function LineaCorta({ l }: { l: ReturnType<typeof lineaCorta> }) {
  return (
    <>
      {l.antes && <span className="text-fg-secondary">{l.antes}: </span>}
      {l.texto}
      {l.despues && <span className="text-fg-muted"> · {l.despues}</span>}
    </>
  );
}

/** El destino a la izquierda de una fila compacta: solo en la primera de su grupo (las demás dejan el hueco). */
function ColumnaDelDestino({ nombre }: { nombre: string | null }) {
  return (
    <span className={cn("truncate text-xs font-semibold text-brand sm:w-[8.5rem] sm:flex-none", !nombre && "hidden sm:block")} title={nombre ?? undefined}>
      {nombre}
    </span>
  );
}

/**
 * Una sugerencia en UNA línea (2026-11-08, «Lo que aprendimos» con una reunión real era ilegible): a la izquierda a qué
 * lugar va (`grupo`, solo en la primera fila de su grupo), lo aprendido en corto y «Descartar» / «Usar». Al pasar el
 * cursor, lo completo y la cita; al tocar la línea se abre lo que antes estaba a la vista: el texto completo, «Al usarla»
 * y de dónde sale, con el porqué. Va dentro de una lista azul (`ListaCompacta`).
 */
export function FilaCompacta({ item, grupo }: { item: ItemPropuesto; grupo: string | null }) {
  const { escala, nombreDeNivel, cambiar, usar, queHace, puedeEditar, guardando } = useLienzo();
  const [abierta, setAbierta] = useState(false);
  const corta = lineaCorta(item, escala, nombreDeNivel);
  const completa = describirPropuesta(item, escala, nombreDeNivel);
  const origen = origenEnUnaLinea(item);
  const pista = [completa, origen.cita ? `«${origen.cita}»` : null].filter(Boolean).join("\n");
  return (
    <li data-recorrido="preventa.sugerencia" className={cn("px-3 py-1", grupo && "border-t border-info-line first:border-t-0")}>
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
        <ColumnaDelDestino nombre={grupo} />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 sm:flex-nowrap">
          <button
            type="button"
            aria-expanded={abierta}
            title={pista}
            onClick={() => setAbierta((x) => !x)}
            className="flex min-w-0 flex-1 basis-full items-center gap-1.5 text-left text-[13px] leading-5 text-fg sm:basis-auto"
          >
            <ChevronRight className={cn("h-3.5 w-3.5 flex-none text-fg-muted transition-transform", abierta && "rotate-90")} aria-hidden="true" />
            <span className="min-w-0 sm:truncate">
              <LineaCorta l={corta} />
            </span>
          </button>
          {puedeEditar && (
            <span className="ml-auto flex flex-none items-center gap-1">
              <BotonTexto disabled={guardando} onClick={() => void cambiar([{ op: "descartar", itemIds: [item.id] }])}>
                Descartar
              </BotonTexto>
              <BotonUsar disabled={guardando} title={queHace(item).texto} onClick={() => void usar([item])} />
            </span>
          )}
        </div>
      </div>
      {abierta && (
        <div className="pb-1 pl-5 sm:pl-[calc(8.5rem+0.75rem+1.25rem)]">
          {completa !== lineaCortaEnTexto(corta) && <p className="mt-1 text-[13px] text-fg">{completa}</p>}
          {puedeEditar && <LoQueHaceUsar item={item} />}
          <DeDondeSale item={item} />
        </div>
      )}
    </li>
  );
}

/** La lista azul de las filas compactas: un solo recuadro, con una división entre grupos; no una tarjeta por sugerencia. */
export function ListaCompacta({ children }: { children: React.ReactNode }) {
  return <ul className="rounded-lg border border-info-line bg-info-surface">{children}</ul>;
}

/** De dónde sale, en una línea: la primera fuente con cita (o las fuentes, si ninguna trae cita). */
export function origenEnUnaLinea(item: ItemPropuesto): { etiqueta: string; cita: string | null } {
  const conCita = item.fuentes.find((f) => f.cita);
  if (conCita) return { etiqueta: conCita.etiqueta, cita: conCita.cita ?? null };
  return { etiqueta: item.fuentes.map((f) => f.etiqueta).join(" · "), cita: null };
}

/** Lo que solo se ve al pedir «ver de dónde sale»: todas las fuentes con su cita, y el porqué. */
export function DeDondeSale({ item }: { item: ItemPropuesto }) {
  return (
    <div className="mt-2 space-y-1 border-l-2 border-info-line bg-surface px-2.5 py-2 text-xs leading-relaxed text-fg-secondary">
      {item.fuentes.map((f, i) => (
        <p key={`${f.id}-${i}`}>
          <span className="text-fg-muted">{f.etiqueta}</span>
          {f.cita && <span className="italic"> «{f.cita}»</span>}
        </p>
      ))}
      {item.razon && (
        <p>
          <span className="font-medium text-fg">Por qué: </span>
          {item.razon}
        </p>
      )}
    </div>
  );
}

/**
 * K12 (2026-10-28): lo que va a escribir «Usar», en azul debajo del origen («Al usarla: Poner Ventas · Datos en
 * Inicial»), y el aviso si cambia algo más (la industria trae su perfil habitual).
 */
export function LoQueHaceUsar({ item }: { item: ItemPropuesto }) {
  const { queHace } = useLienzo();
  const q = queHace(item);
  return (
    <p className="mt-1 text-xs text-fg-secondary">
      <span className="font-medium text-brand">Al usarla: </span>
      {q.texto}
      {q.aviso && <span className="mt-0.5 block font-medium text-warn-ink">{q.aviso}</span>}
    </p>
  );
}

/** Una sugerencia: una fila azul con su texto, su origen en una línea, «Descartar» y «Usar» (la forma vive en el sistema). */
export function FilaSugerida({ item, texto, destino }: { item: ItemPropuesto; texto?: React.ReactNode; destino?: string }) {
  const { escala, nombreDeNivel, cambiar, usar, queHace, puedeEditar, guardando } = useLienzo();
  const [abierta, setAbierta] = useState(false);
  const origen = origenEnUnaLinea(item);
  const hayMas = !!item.razon || item.fuentes.length > 1 || (origen.cita?.length ?? 0) > 70;
  return (
    <FilaSugeridaDelSistema
      dataRecorrido="preventa.sugerencia"
      encima={destino}
      origen={
        origen.etiqueta || hayMas ? (
          <>
            <span className="min-w-0 truncate">
              {origen.etiqueta}
              {origen.cita && <span className="italic"> · «{origen.cita}»</span>}
            </span>
            {hayMas && (
              <button type="button" aria-expanded={abierta} className="flex-shrink-0 font-medium text-brand hover:underline" onClick={() => setAbierta((x) => !x)}>
                {abierta ? "ocultar" : "ver de dónde sale"}
              </button>
            )}
          </>
        ) : undefined
      }
      debajo={
        <>
          {puedeEditar && <LoQueHaceUsar item={item} />}
          {abierta && <DeDondeSale item={item} />}
        </>
      }
      acciones={
        puedeEditar ? (
          <>
            <BotonTexto disabled={guardando} onClick={() => void cambiar([{ op: "descartar", itemIds: [item.id] }])}>
              Descartar
            </BotonTexto>
            <BotonUsar disabled={guardando} title={queHace(item).texto} onClick={() => void usar([item])} />
          </>
        ) : undefined
      }
    >
      {texto ?? describirPropuesta(item, escala, nombreDeNivel)}
    </FilaSugeridaDelSistema>
  );
}

/**
 * K12: el botón que usa todas juntas («Pasar las N al mapa» en La escala). Con más de una pide confirmación con la lista
 * corta de lo que va a pasar; el aviso de después deshace el lote entero.
 */
export function BotonUsarTodas({ items, lugar }: { items: ItemPropuesto[]; lugar: LugarDelLote }) {
  const { usar, queHace, puedeEditar, guardando } = useLienzo();
  const [abierto, setAbierto] = useState(false);
  if (!puedeEditar || items.length === 0) return null;
  const etiqueta = etiquetaDelLote(lugar, items.length);
  if (items.length === 1) {
    return (
      <BotonAzul disabled={guardando} title={queHace(items[0]).texto} onClick={() => void usar(items, { lugar })}>
        {etiqueta}
      </BotonAzul>
    );
  }
  return (
    <>
      <BotonAzul disabled={guardando} onClick={() => setAbierto(true)}>
        {etiqueta}
      </BotonAzul>
      <ConfirmDialog
        open={abierto}
        variant="default"
        title={`¿${etiqueta}?`}
        confirmLabel={etiqueta}
        onCancel={() => setAbierto(false)}
        onConfirm={async () => {
          setAbierto(false);
          await usar(items, { lugar });
        }}
        description={<LoQueVaAPasar items={items} />}
      />
    </>
  );
}

/** K12: la lista corta de la confirmación de un lote (va dentro del párrafo de ConfirmDialog: solo `span`). */
export function LoQueVaAPasar({ items }: { items: ItemPropuesto[] }) {
  const { queHace } = useLienzo();
  const plan = loQueVaAPasar(items.map(queHace));
  return (
    <>
      {plan.lineas.map((l, i) => (
        <span key={i} className="block">
          · {l}
        </span>
      ))}
      {plan.mas > 0 && <span className="block">· y {plan.mas} más</span>}
      {plan.avisos.map((a) => (
        <span key={a} className="mt-1 block font-medium text-warn-ink">
          {a}
        </span>
      ))}
      <span className="mt-2 block">Después puedes deshacerlo todo junto con el aviso o con Ctrl+Z.</span>
    </>
  );
}

/** «Tú», o el nombre del correo («marco.perez» → «marco.perez»): el registro guarda el correo. */
function quienLaUso(por: string | null, miCorreo: string | null): string {
  if (!por) return "Nexus";
  if (miCorreo && por.toLowerCase() === miCorreo.toLowerCase()) return "Tú";
  return por.split("@")[0];
}

/**
 * K12: «Usadas hoy (N)», plegable: cada sugerencia usada hoy en este lugar —qué era, quién y a qué hora— y «Revertir»,
 * que la deshace y la devuelve a la lista. Si alguien cambió ese lugar después, no se revierte (lo dice). Con
 * `sinPendientes`, arriba dice «No quedan sugerencias»: la sección no desaparece de golpe al usar la última.
 *
 * Con `grupo` («Lo que aprendimos», 2026-11-08) no se pliega bajo «Usadas hoy»: a la vista queda una frase con cuántas y
 * dónde quedaron («Ya usaste 14: 5 en la escala, 3 en retos…») y «Ver cuáles» abre la lista, una línea por cada una. Con
 * tres o menos, la lista ya viene abierta.
 */
export function UsadasHoy({
  filtro,
  sinPendientes = false,
  grupo,
}: {
  filtro: (d: DestinoDePropuesta, item: ItemPropuesto) => boolean;
  sinPendientes?: boolean;
  grupo?: (item: ItemPropuesto) => GrupoDeDestino;
}) {
  const { usadasHoy } = useLienzo();
  const usadas = usadasHoy.filter((u) => filtro(u.item.destino, u.item));
  if (usadas.length === 0) return null;
  if (grupo) return <ResumenDeLoUsado usadas={usadas} grupo={grupo} sinPendientes={sinPendientes} />;
  return <UsadasHoyPlegadas usadas={usadas} sinPendientes={sinPendientes} />;
}

/** «Revertir», o por qué ya no se puede. */
function RevertirUso({ u }: { u: UsoDeSugerencia }) {
  const { deshacer, exp, puedeEditar, guardando } = useLienzo();
  if (!puedeEditar) return null;
  return sePuedeDeshacer(exp.estado, u) ? (
    <BotonTexto disabled={guardando} title="Vuelve a dejar lo que había y devuelve la sugerencia a la lista" onClick={() => void deshacer([u.id])}>
      Revertir
    </BotonTexto>
  ) : (
    <span className="flex-shrink-0 py-[5px] text-xs text-fg-muted" title="Alguien lo cambió después de usarla: revertir pisaría ese cambio">
      Cambió después
    </span>
  );
}

/** Lo usado de «Lo que aprendimos»: la frase con cuántas y dónde, y la lista corta a un clic. */
function ResumenDeLoUsado({ usadas, grupo, sinPendientes }: { usadas: UsoDeSugerencia[]; grupo: (item: ItemPropuesto) => GrupoDeDestino; sinPendientes: boolean }) {
  const { escala, nombreDeNivel } = useLienzo();
  const me = useMe();
  const [abierta, setAbierta] = useState(usadas.length <= 3);
  const donde = dondeQuedoLoUsado(usadas.map((u) => grupo(u.item).nombre));
  const ordenadas = ordenarPorGrupo(usadas, (u) => grupo(u.item));
  return (
    <div className="space-y-1.5">
      <p className="text-[13px] text-fg-secondary">
        <span className="font-semibold text-fg">{sinPendientes ? `Ya usaste todo lo de esta reunión · ${usadas.length}` : `Ya usaste ${usadas.length}`}</span>
        {donde && `: ${donde}.`}{" "}
        <button type="button" aria-expanded={abierta} className="text-brand hover:underline" onClick={() => setAbierta((x) => !x)}>
          {abierta ? "Ocultar" : "Ver cuáles"}
        </button>
      </p>
      {abierta && (
        <ul className="rounded-lg border border-line bg-surface">
          {ordenadas.map((u, i) => {
            const g = grupo(u.item);
            const primera = i === 0 || grupo(ordenadas[i - 1].item).clave !== g.clave;
            const corta = lineaCorta(u.item, escala, nombreDeNivel);
            const quien = `${quienLaUso(u.por, me?.email ?? null)} · ${horaDelUso(u.en)}${u.lote ? " · junto con otras" : ""}`;
            return (
              <li key={`${u.id}-${u.en}`} className={cn("flex flex-col gap-0.5 px-3 py-1 sm:flex-row sm:items-center sm:gap-3", primera && "border-t border-line first:border-t-0")}>
                <ColumnaDelDestino nombre={primera ? g.nombre : null} />
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 sm:flex-nowrap">
                  <span className="min-w-0 flex-1 basis-full text-[13px] leading-5 text-fg sm:basis-auto sm:truncate" title={describirPropuesta(u.item, escala, nombreDeNivel)}>
                    <LineaCorta l={corta} />
                  </span>
                  <span className="ml-auto flex-none text-xs text-fg-muted">{quien}</span>
                  <RevertirUso u={u} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function UsadasHoyPlegadas({ usadas, sinPendientes }: { usadas: UsoDeSugerencia[]; sinPendientes: boolean }) {
  const { escala, nombreDeNivel } = useLienzo();
  const me = useMe();
  const lista = (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {usadas.map((u) => (
            <li key={`${u.id}-${u.en}`} className="flex items-start gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-fg">{describirPropuesta(u.item, escala, nombreDeNivel)}</p>
                <p className="text-xs text-fg-muted">
                  {quienLaUso(u.por, me?.email ?? null)} · {horaDelUso(u.en)}
                  {u.lote ? " · junto con otras" : ""}
                </p>
              </div>
              <RevertirUso u={u} />
            </li>
          ))}
        </ul>
  );
  return (
    <div className="space-y-1.5">
      {sinPendientes && <p className="text-sm text-fg-muted">No quedan sugerencias por revisar acá.</p>}
      <CollapsibleSection title="Usadas hoy" count={usadas.length} defaultOpen={false}>
        {lista}
      </CollapsibleSection>
    </div>
  );
}

/** Las sugerencias de un lugar, con su rótulo azul arriba (y lo usado hoy ahí, para revertirlo). */
export function Propuestas({ items, filtro }: { items: ItemPropuesto[]; compacto?: boolean; filtro?: (d: DestinoDePropuesta) => boolean }) {
  if (items.length === 0) return filtro ? <UsadasHoy filtro={filtro} sinPendientes /> : null;
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand">
        {items.length === 1 ? "Sugerida por el agente" : `Sugeridas por el agente · ${items.length}`}
      </p>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <FilaSugerida key={it.id} item={it} />
        ))}
      </ul>
      {filtro && <UsadasHoy filtro={filtro} />}
    </div>
  );
}
