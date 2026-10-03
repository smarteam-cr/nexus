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
import { Button } from "@/components/ui";
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
  type AExplorar,
  type CasoDeUsoElegido,
  type EstadoDeCriterio,
  type EstimadoGuardado,
  type ItemPropuesto,
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

/** Una sugerencia: una fila azul con su texto, su origen en una línea, «Descartar» y «Usar». */
export function FilaSugerida({ item, texto, destino }: { item: ItemPropuesto; texto?: React.ReactNode; destino?: string }) {
  const { escala, nombreDeNivel, cambiar, puedeEditar, guardando } = useLienzo();
  const [abierta, setAbierta] = useState(false);
  const origen = origenEnUnaLinea(item);
  const hayMas = !!item.razon || item.fuentes.length > 1 || (origen.cita?.length ?? 0) > 70;
  return (
    <li className="flex items-start gap-2.5 rounded-lg border border-info-line bg-info-surface py-2.5 pl-3 pr-2.5">
      <div className="min-w-0 flex-1">
        {destino && <p className="text-2xs font-semibold text-brand">{destino}</p>}
        <p className="text-sm leading-snug text-fg">{texto ?? describirPropuesta(item, escala, nombreDeNivel)}</p>
        {(origen.etiqueta || hayMas) && (
          <p className="mt-0.5 flex min-w-0 items-baseline gap-1 text-xs text-fg-muted">
            <span className="min-w-0 truncate">
              {origen.etiqueta}
              {origen.cita && <span className="italic"> · «{origen.cita}»</span>}
            </span>
            {hayMas && (
              <button type="button" aria-expanded={abierta} className="flex-shrink-0 font-medium text-brand hover:underline" onClick={() => setAbierta((x) => !x)}>
                {abierta ? "ocultar" : "ver de dónde sale"}
              </button>
            )}
          </p>
        )}
        {abierta && <DeDondeSale item={item} />}
      </div>
      {puedeEditar && (
        <div className="flex flex-shrink-0 items-center gap-1">
          <button type="button" className="rounded px-1.5 py-1 text-xs text-fg-muted hover:text-fg" disabled={guardando} onClick={() => void cambiar([{ op: "descartar", itemIds: [item.id] }])}>
            Descartar
          </button>
          <Button
            size="xs"
            variant="primary"
            disabled={guardando}
            onClick={() => void cambiar([{ op: "usar", itemId: item.id, valor: item.valor }], { refrescar: item.destino.tipo === "edicion" || item.destino.tipo === "perfil" })}
          >
            Usar
          </Button>
        </div>
      )}
    </li>
  );
}

/** Las sugerencias de un lugar, con su rótulo azul arriba. */
export function Propuestas({ items }: { items: ItemPropuesto[]; compacto?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-2xs font-semibold uppercase tracking-widest text-brand">
        {items.length === 1 ? "Sugerida por el agente" : `Sugeridas por el agente · ${items.length}`}
      </p>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <FilaSugerida key={it.id} item={it} />
        ))}
      </ul>
    </div>
  );
}
