"use client";

/**
 * Propuestas — lo que propuso el agente para una casilla, con de dónde salió y «Usar» / «Descartar».
 *
 * Va EN su lugar (debajo de la casilla, en la fila de la dimensión…), no en un panel aparte: se
 * decide mirando lo que ya está confirmado al lado. Lo descartado no vuelve (queda su lápida).
 */
import { Button } from "@/components/ui";
import {
  ETIQUETA_DE_LA_OBJECION,
  ETIQUETA_DEL_ROL,
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

export function Propuestas({ items, compacto = false }: { items: ItemPropuesto[]; compacto?: boolean }) {
  const { escala, nombreDeNivel, cambiar, puedeEditar, guardando } = useLienzo();
  if (items.length === 0) return null;
  return (
    <ul className="space-y-2">
      {items.map((it) => (
        <li key={it.id} className="rounded-lg border border-brand/25 bg-brand/5 px-3 py-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-2xs font-semibold uppercase tracking-wide text-brand-light">Propuesto</p>
              <p className="text-sm text-fg">{describirPropuesta(it, escala, nombreDeNivel)}</p>
              {!compacto && it.razon && <p className="text-xs text-fg-secondary">{it.razon}</p>}
              {it.fuentes.length > 0 && (
                <p className="text-xs text-fg-muted">
                  De:{" "}
                  {it.fuentes.map((f, i) => (
                    <span key={`${f.id}-${i}`}>
                      {i > 0 && " · "}
                      {f.etiqueta}
                      {f.cita && <span className="italic"> «{f.cita}»</span>}
                    </span>
                  ))}
                </p>
              )}
            </div>
            {puedeEditar && (
              <div className="flex flex-shrink-0 items-center gap-1.5">
                <Button size="xs" variant="primary" disabled={guardando} onClick={() => void cambiar([{ op: "usar", itemId: it.id, valor: it.valor }], { refrescar: it.destino.tipo === "edicion" || it.destino.tipo === "perfil" })}>
                  Usar
                </Button>
                <Button size="xs" variant="secondary" disabled={guardando} onClick={() => void cambiar([{ op: "descartar", itemIds: [it.id] }])}>
                  Descartar
                </Button>
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
