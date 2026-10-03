import "server-only";

/**
 * lib/guia-exploracion/servidor.ts — leer y cambiar la guía de exploración (molde de
 * lib/exploraciones/servidor.ts: fila bloqueada con FOR UPDATE + versión).
 *
 * La vista arma, además de lo guardado, lo que NO se copia en la guía porque vive en otro lado:
 *   · los equipos contratados (los hubs del proyecto);
 *   · la escala: dónde quedó en el diagnóstico preliminar (exploración de venta / test en línea), qué
 *     contestó cada persona en el cuestionario de escala y qué confirmó el CSE. Lo preliminar se
 *     muestra como punto de partida, no como evidencia.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { compararCuestionarios } from "@/lib/cuestionario/comparar";
import { obtenerCuestionarios } from "@/lib/cuestionario/servicio";
import { areasContratadas } from "@/lib/escala/areas-por-hub";
import { aplicarEdicion } from "@/lib/escala/documento/edicion";
import { nombreDeNivel } from "@/lib/escala/documento/parsear";
import type { Letra } from "@/lib/escala/documento/tipos";
import { leerEscalaVigente } from "@/lib/escala/documento/vigente";
import { ubicacionPreviaDelProyecto } from "@/lib/exploraciones/para-el-cuestionario";
import { sanitizeTags } from "@/lib/tags/catalog";
import {
  EQUIPOS,
  HUB_DEL_EQUIPO,
  aplicarOperaciones,
  contenidoVacio,
  leerContenido,
  leerPropuesta,
  pendientes,
  type ClaveDeEquipo,
  type ContenidoDeGuia,
  type ItemPropuesto,
  type OperacionDeGuia,
} from "./contenido";

/** Una corrida que no terminó en este tiempo se da por muerta (el proceso se reinició). */
export const CORRIDA_VENCE_MS = 6 * 60_000;

export interface DimensionDeLaGuia {
  id: string;
  nombre: string;
  /** Dónde la ubicó el preliminar (nombre del nivel) y de dónde salió. */
  previo: { letra: string; nivel: string; fuente: "exploracion" | "test" } | null;
  /** Lo que contestó cada persona en el cuestionario de escala. */
  cuestionario: Array<{ persona: string; letra: string | null; nivel: string | null; confirmada: boolean }>;
  desacuerdo: "difieren" | "se-contradicen" | null;
  confirmado: { letra: string; nivel: string; nota?: string } | null;
}

export interface AreaDeLaGuia {
  id: string;
  nombre: string;
  dimensiones: DimensionDeLaGuia[];
}

export interface VistaDeLaGuia {
  existe: boolean;
  version: number;
  contenido: ContenidoDeGuia;
  pendientes: ItemPropuesto[];
  corrida: { enCurso: boolean; modo: string | null; terminoAt: string | null; error: string | null };
  ultimasCorridas: Array<{ modo: string; en: string; propuestas: number }>;
  equipos: ClaveDeEquipo[];
  escala: {
    disponible: boolean;
    version: string | null;
    hayPreliminar: boolean;
    niveles: Array<{ letra: string; nombre: string }>;
    areas: AreaDeLaGuia[];
  };
}

export class ErrorDeGuia extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function filaDeLaGuia(projectId: string) {
  return prisma.guiaDeExploracion.findUnique({ where: { projectId } });
}

/** La crea vacía si no existe (idempotente: dos clics no crean dos). */
export async function asegurarGuia(projectId: string) {
  return prisma.guiaDeExploracion.upsert({
    where: { projectId },
    create: { projectId, contenido: contenidoVacio() as unknown as Prisma.InputJsonValue },
    update: {},
  });
}

export function corridaEnCurso(f: { corriendoDesde: Date | null; corridaTerminoAt: Date | null }): boolean {
  return (
    !!f.corriendoDesde &&
    (!f.corridaTerminoAt || f.corriendoDesde > f.corridaTerminoAt) &&
    Date.now() - f.corriendoDesde.getTime() < CORRIDA_VENCE_MS
  );
}

export async function vistaDeLaGuia(projectId: string): Promise<VistaDeLaGuia> {
  const [fila, project] = await Promise.all([
    filaDeLaGuia(projectId),
    prisma.project.findUnique({ where: { id: projectId }, select: { tags: true } }),
  ]);
  const tags = sanitizeTags(project?.tags ?? []);
  const equipos = EQUIPOS.filter((e) => tags.includes(HUB_DEL_EQUIPO[e]));
  const contenido = fila ? leerContenido(fila.contenido) : contenidoVacio();
  const propuesta = fila ? leerPropuesta(fila.propuesta) : null;

  return {
    existe: !!fila,
    version: fila?.version ?? 0,
    contenido,
    pendientes: propuesta ? pendientes(propuesta, contenido) : [],
    corrida: {
      enCurso: fila ? corridaEnCurso(fila) : false,
      modo: fila?.corridaModo ?? null,
      terminoAt: fila?.corridaTerminoAt?.toISOString() ?? null,
      error: fila && !corridaEnCurso(fila) ? fila.corridaError : null,
    },
    ultimasCorridas: (propuesta?.corridas ?? []).slice(0, 5).map((c) => ({ modo: c.modo, en: c.en, propuestas: c.propuestas })),
    equipos,
    escala: await escalaDeLaGuia(projectId, tags, contenido),
  };
}

async function escalaDeLaGuia(projectId: string, tags: string[], contenido: ContenidoDeGuia): Promise<VistaDeLaGuia["escala"]> {
  const vacia = { disponible: false, version: null, hayPreliminar: false, niveles: [], areas: [] };
  const vigente = await leerEscalaVigente().catch(() => null);
  if (!vigente || !("escala" in vigente)) return vacia;
  const [previo, cuestionarios] = await Promise.all([
    ubicacionPreviaDelProyecto(projectId).catch(() => null),
    obtenerCuestionarios(projectId).catch(() => null),
  ]);
  const escala = aplicarEdicion(vigente.escala, previo?.edicion ?? null);
  const comparacion = cuestionarios ? compararCuestionarios(cuestionarios) : null;
  const porDim = new Map((comparacion?.escala?.dimensiones ?? []).map((d) => [d.ref, d]));
  const nombre = (l: string) => nombreDeNivel(escala, l as Letra);

  const areas = areasContratadas(tags).flatMap((areaId) => {
    const area = escala.areas.find((a) => a.id === areaId);
    if (!area) return [];
    return [
      {
        id: area.id,
        nombre: area.nombre,
        dimensiones: area.dimensiones.map((d) => {
          const p = previo?.porDimension[d.id];
          const c = porDim.get(d.id);
          const conf = contenido.escala[d.id];
          return {
            id: d.id,
            nombre: d.nombre,
            previo: p ? { letra: p.nivel, nivel: nombre(p.nivel), fuente: p.fuente } : null,
            cuestionario: (c?.respuestas ?? []).map((r) => ({
              persona: r.persona,
              letra: r.nivel,
              nivel: r.nivel ? nombre(r.nivel) : null,
              confirmada: r.origen !== "prellenado" || r.confirmada,
            })),
            desacuerdo: c?.desacuerdo ?? null,
            confirmado: conf ? { letra: conf.nivel, nivel: nombre(conf.nivel), ...(conf.nota ? { nota: conf.nota } : {}) } : null,
          };
        }),
      },
    ];
  });
  return {
    disponible: true,
    version: escala.version,
    hayPreliminar: !!previo && Object.keys(previo.porDimension).length > 0,
    niveles: escala.niveles.map((n) => ({ letra: n.letra, nombre: n.nombre })),
    areas,
  };
}

/**
 * Aplica operaciones del CSE a lo CONFIRMADO. Todas o ninguna, con la fila bloqueada; 409 si otra
 * pestaña ya cambió lo confirmado (la versión no coincide).
 */
export async function aplicarCambios(projectId: string, version: number, ops: OperacionDeGuia[]): Promise<void> {
  await asegurarGuia(projectId);
  await prisma.$transaction(async (tx) => {
    const filas = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "GuiaDeExploracion" WHERE "projectId" = ${projectId} FOR UPDATE`;
    if (filas.length === 0) throw new ErrorDeGuia("La guía no existe.", 404);
    const f = await tx.guiaDeExploracion.findUniqueOrThrow({ where: { projectId } });
    if (f.version !== version) {
      throw new ErrorDeGuia("Alguien más cambió la guía mientras la tenías abierta. Recarga para ver lo último.", 409);
    }
    const propuesta = leerPropuesta(f.propuesta);
    const r = aplicarOperaciones(leerContenido(f.contenido), propuesta, ops);
    if (!r.ok) throw new ErrorDeGuia(r.error, 409);
    await tx.guiaDeExploracion.update({
      where: { projectId },
      data: {
        contenido: r.contenido as unknown as Prisma.InputJsonValue,
        propuesta: { ...propuesta, descartadas: r.descartadas } as unknown as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
    });
  });
}
