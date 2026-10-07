import "server-only";

/**
 * lib/guia-exploracion/servidor.ts — leer y cambiar las sesiones de la exploración (molde de
 * lib/exploraciones/servidor.ts: fila bloqueada con FOR UPDATE + versión).
 *
 * La vista arma, además de lo guardado, lo que NO se copia porque vive en otro lado:
 *   · la escala: dónde quedó cada dimensión en el diagnóstico preliminar y qué contestó cada persona
 *     en el cuestionario de escala (para las preguntas que apuntan a una dimensión). El nivel ya no se
 *     confirma acá: lo pone el Diagnóstico, que lee las sesiones;
 *   · lo que ya dice Información del cliente («Ya lo sabemos») y cuántas sugerencias esperan ahí;
 *   · la última reunión del proyecto que el agente todavía no leyó.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { CAMPOS_DE_LA_FICHA, camposPropuestos, leerFicha } from "@/lib/clients/ficha";
import { compararCuestionarios } from "@/lib/cuestionario/comparar";
import { obtenerCuestionarios } from "@/lib/cuestionario/servicio";
import { areasContratadas } from "@/lib/escala/areas-por-hub";
import { aplicarEdicion } from "@/lib/escala/documento/edicion";
import { nombreDeNivel } from "@/lib/escala/documento/parsear";
import type { Letra } from "@/lib/escala/documento/tipos";
import { leerEscalaVigente } from "@/lib/escala/documento/vigente";
import { ubicacionPreviaDelProyecto } from "@/lib/exploraciones/para-el-cuestionario";
import { getProjectMemberSessions } from "@/lib/sessions/project-sources";
import { sanitizeTags } from "@/lib/tags/catalog";
import {
  EQUIPOS,
  HUB_DEL_EQUIPO,
  aplicarOperaciones,
  contenidoVacio,
  leerContenido,
  leerPropuesta,
  pendientes,
  type Averiguado,
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
  area: string;
  /** Dónde la ubicó el preliminar (nombre del nivel) y de dónde salió. */
  previo: { letra: string; nivel: string; fuente: "exploracion" | "test" } | null;
  /** Lo que contestó cada persona en el cuestionario de escala. */
  cuestionario: Array<{ persona: string; letra: string | null; nivel: string | null; confirmada: boolean }>;
  desacuerdo: "difieren" | "se-contradicen" | null;
}

export interface VistaDeLaGuia {
  existe: boolean;
  version: number;
  contenido: ContenidoDeGuia;
  pendientes: ItemPropuesto[];
  corrida: { enCurso: boolean; modo: string | null; terminoAt: string | null; error: string | null };
  equipos: ClaveDeEquipo[];
  /** Las dimensiones de las áreas contratadas, por id (las preguntas «E» apuntan a una). */
  escala: { disponible: boolean; hayPreliminar: boolean; dimensiones: DimensionDeLaGuia[] };
  /** Lo que ya dice Información del cliente. */
  ficha: { confirmada: boolean; sabido: Array<{ etiqueta: string; texto: string }>; propuestas: number };
  /** La última reunión del proyecto (ya ocurrida) que el agente todavía no leyó. */
  reunionSinLeer: { titulo: string; fecha: string } | null;
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

/** La última reunión del proyecto que ya ocurrió y el agente todavía no leyó (por el chokepoint). */
export async function ultimaReunionSinLeer(projectId: string, leidas: readonly string[]): Promise<{ id: string; titulo: string; date: number } | null> {
  const { sessions } = await getProjectMemberSessions(projectId);
  const ahora = Date.now();
  const candidata = sessions.filter((s) => s.date <= ahora && !leidas.includes(s.id)).sort((a, b) => b.date - a.date)[0];
  return candidata ? { id: candidata.id, titulo: candidata.title, date: candidata.date } : null;
}

/** Las primeras palabras de un campo de la ficha, sin el formato de viñetas: para «Ya lo sabemos». */
function resumenDelCampo(texto: string, max = 200): string {
  const plano = texto
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").replace(/\*\*(.+?)\*\*/g, "$1").trim())
    .filter(Boolean)
    .join(" · ");
  return plano.length > max ? `${plano.slice(0, max - 1).trimEnd()}…` : plano;
}

export async function vistaDeLaGuia(projectId: string): Promise<VistaDeLaGuia> {
  const [fila, project] = await Promise.all([
    filaDeLaGuia(projectId),
    prisma.project.findUnique({ where: { id: projectId }, select: { tags: true, client: { select: { ficha: true } } } }),
  ]);
  const tags = sanitizeTags(project?.tags ?? []);
  const equipos = EQUIPOS.filter((e) => tags.includes(HUB_DEL_EQUIPO[e]));
  const contenido = fila ? leerContenido(fila.contenido) : contenidoVacio();
  const propuesta = fila ? leerPropuesta(fila.propuesta) : null;
  const enCurso = fila ? corridaEnCurso(fila) : false;

  const ficha = leerFicha(project?.client?.ficha);
  const sabido = ficha.confirmadaAt
    ? CAMPOS_DE_LA_FICHA.filter((c) => c.alCliente && ficha.valores[c.clave].trim()).map((c) => ({
        etiqueta: c.etiqueta,
        texto: resumenDelCampo(ficha.valores[c.clave]),
      }))
    : [];

  // Mientras el agente corre, la pantalla consulta cada pocos segundos: la reunión sin leer no cambia.
  const reunion = enCurso ? null : await ultimaReunionSinLeer(projectId, propuesta?.leidas ?? []).catch(() => null);

  return {
    existe: !!fila,
    version: fila?.version ?? 0,
    contenido,
    pendientes: propuesta ? pendientes(propuesta, contenido) : [],
    corrida: {
      enCurso,
      modo: fila?.corridaModo ?? null,
      terminoAt: fila?.corridaTerminoAt?.toISOString() ?? null,
      error: fila && !enCurso ? fila.corridaError : null,
    },
    equipos,
    escala: await escalaDeLaGuia(projectId, tags),
    ficha: { confirmada: !!ficha.confirmadaAt, sabido, propuestas: camposPropuestos(ficha).length },
    reunionSinLeer: reunion ? { titulo: reunion.titulo, fecha: new Date(reunion.date).toISOString() } : null,
  };
}

async function escalaDeLaGuia(projectId: string, tags: string[]): Promise<VistaDeLaGuia["escala"]> {
  const vacia = { disponible: false, hayPreliminar: false, dimensiones: [] };
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

  const dimensiones = areasContratadas(tags).flatMap((areaId) => {
    const area = escala.areas.find((a) => a.id === areaId);
    if (!area) return [];
    return area.dimensiones.map((d) => {
      const p = previo?.porDimension[d.id];
      const c = porDim.get(d.id);
      return {
        id: d.id,
        nombre: d.nombre,
        area: area.nombre,
        previo: p ? { letra: p.nivel, nivel: nombre(p.nivel), fuente: p.fuente } : null,
        cuestionario: (c?.respuestas ?? []).map((r) => ({
          persona: r.persona,
          letra: r.nivel,
          nivel: r.nivel ? nombre(r.nivel) : null,
          confirmada: r.origen !== "prellenado" || r.confirmada,
        })),
        desacuerdo: c?.desacuerdo ?? null,
      };
    });
  });
  return { disponible: true, hayPreliminar: !!previo && Object.keys(previo.porDimension).length > 0, dimensiones };
}

/**
 * Aplica operaciones del CSE a lo CONFIRMADO. Todas o ninguna, con la fila bloqueada; 409 si otra
 * pestaña ya cambió lo confirmado (la versión no coincide). Devuelve lo averiguado que quedó escrito
 * o cambió: la ruta lo manda a Información del cliente después de responder.
 */
export async function aplicarCambios(projectId: string, version: number, ops: OperacionDeGuia[]): Promise<Averiguado[]> {
  await asegurarGuia(projectId);
  return prisma.$transaction(async (tx) => {
    const filas = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "GuiaDeExploracion" WHERE "projectId" = ${projectId} FOR UPDATE`;
    if (filas.length === 0) throw new ErrorDeGuia("Las sesiones no existen.", 404);
    const f = await tx.guiaDeExploracion.findUniqueOrThrow({ where: { projectId } });
    if (f.version !== version) {
      throw new ErrorDeGuia("Alguien más cambió las sesiones mientras las tenías abiertas. Recarga para ver lo último.", 409);
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
    return r.averiguado;
  });
}
