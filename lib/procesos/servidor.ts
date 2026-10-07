import "server-only";
/**
 * lib/procesos/servidor.ts — LEER Y CAMBIAR LOS MAPAS DE PROCESOS DE UN CLIENTE.
 *
 * Los mapas son bloques de la sección «procesos» del canvas Información del cliente (proyecto
 * centinela). Acá se leen separados en: los mapas nuevos (`carriles-v1`), el índice que deja el
 * agente y los mapas del formato anterior que siguen en pie. Las escrituras son: el estado del mapa
 * (revisado / validado con el cliente), lo que se guarda desde el editor de pantalla completa, un
 * mapa del formato anterior editado en el visor viejo, y quitar un mapa.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { canvasOfNested } from "@/lib/pieces/canvas-query";
import { SENTINEL_SERVICE_TYPE } from "@/lib/projects/kind";
import { ultimaCorrida, verificarCitas } from "./agente";
import {
  esIndiceDeProcesos,
  esMapaAnterior,
  esMapaDeCarriles,
  type EstadoDelMapa,
  type IndiceDeProcesos,
  type MapaDeProceso,
} from "./mapa";
import { aplicarOperaciones, citasNuevas, completarCitas, ErrorDeOperacion, type OperacionDelMapa } from "./operaciones";

const bloquesDeProcesos = (clientId: string) =>
  prisma.canvasBlock.findMany({
    where: { section: { key: "procesos", canvas: canvasOfNested("client-info", { project: { clientId, serviceType: SENTINEL_SERVICE_TYPE } }) } },
    orderBy: { order: "asc" },
    select: { id: true, blockType: true, content: true, data: true, source: true, status: true },
  });

export interface ProcesosDelCliente {
  mapas: { blockId: string; editadoAMano: boolean; mapa: MapaDeProceso }[];
  anteriores: { blockId: string; titulo: string; editadoAMano: boolean; data: unknown }[];
  indice: IndiceDeProcesos | null;
  corrida: { id: string; estado: "RUNNING" | "DONE" | "ERROR" | "PENDING" | "ARCHIVED"; fase: string | null; resultado: unknown; cuando: string } | null;
}

export async function leerProcesosDelCliente(clientId: string): Promise<ProcesosDelCliente> {
  const [bloques, corrida] = await Promise.all([bloquesDeProcesos(clientId), ultimaCorrida(clientId)]);
  const out: ProcesosDelCliente = { mapas: [], anteriores: [], indice: null, corrida: null };
  for (const b of bloques) {
    if (esMapaDeCarriles(b.data)) out.mapas.push({ blockId: b.id, editadoAMano: b.source !== "AGENT", mapa: b.data });
    else if (esIndiceDeProcesos(b.data)) out.indice = b.data;
    else if (b.blockType === "FLOWCHART" && esMapaAnterior(b.data)) out.anteriores.push({ blockId: b.id, titulo: b.content ?? "(sin título)", editadoAMano: b.source !== "AGENT", data: b.data });
  }
  if (corrida) {
    let resultado: unknown = null;
    try {
      resultado = corrida.output ? JSON.parse(corrida.output) : null;
    } catch {
      resultado = null;
    }
    out.corrida = { id: corrida.id, estado: corrida.status, fase: corrida.currentPhase, resultado, cuando: corrida.updatedAt.toISOString() };
  }
  return out;
}

/** El bloque de un mapa nuevo de ESTE cliente, o null (404: no se confirma qué existe en otro cliente). */
async function bloqueDelMapa(clientId: string, blockId: string) {
  const b = await prisma.canvasBlock.findFirst({
    where: { id: blockId, section: { key: "procesos", canvas: canvasOfNested("client-info", { project: { clientId, serviceType: SENTINEL_SERVICE_TYPE } }) } },
    select: { id: true, data: true, blockType: true },
  });
  return b;
}

export class ErrorDeProcesos extends Error {
  /** En un 409, el mapa como está ahora en la base. */
  constructor(public readonly status: number, mensaje: string, public readonly mapaActual?: MapaDeProceso) {
    super(mensaje);
  }
}

export async function cambiarEstadoDelMapa(clientId: string, blockId: string, estado: EstadoDelMapa, quien: string): Promise<MapaDeProceso> {
  const b = await bloqueDelMapa(clientId, blockId);
  const actual: unknown = b?.data;
  if (!b || !esMapaDeCarriles(actual)) throw new ErrorDeProcesos(404, "Ese mapa no existe.");
  const ahora = new Date().toISOString();
  const mapa: MapaDeProceso = {
    ...actual,
    estado,
    revisadoPor: estado === "borrador" ? null : estado === "revisado" ? quien : (actual.revisadoPor ?? quien),
    revisadoEn: estado === "borrador" ? null : estado === "revisado" ? ahora : (actual.revisadoEn ?? ahora),
    validadoPor: estado === "validado" ? quien : null,
    validadoEn: estado === "validado" ? ahora : null,
    // El estado también es un cambio: un editor abierto sobre la versión anterior no lo pisa.
    version: (actual.version ?? 0) + 1,
  };
  // CONFIRMED = lo puede mostrar el kickoff (solo lo validado con el cliente cruza).
  await prisma.canvasBlock.update({
    where: { id: blockId },
    data: { data: mapa as unknown as Prisma.InputJsonValue, status: estado === "validado" ? "CONFIRMED" : "DRAFT" },
  });
  return mapa;
}

/** Lo que vuelve de guardar el editor. */
export interface ResultadoDelEditor {
  mapa: MapaDeProceso;
  /** Citas que no aparecieron tal cual en su reunión y no se guardaron. */
  citasDescartadas: number;
}

/**
 * Guarda lo que se hizo en el editor de pantalla completa. Reglas que no dependen de la pantalla:
 *  - se guarda solo sobre la versión que el editor tenía abierta (409 con el mapa de ahora si es otra:
 *    lo volvió a mapear el agente, lo validó alguien o lo guardó otra persona);
 *  - las operaciones se aplican con la misma función que usa el editor (lib/procesos/operaciones.ts);
 *  - cada cita nueva se busca tal cual en la transcripción de su reunión: si no aparece, no se guarda
 *    y el paso baja de origen si se queda sin citas;
 *  - un mapa validado con el cliente vuelve a «revisado» (lo validado era otra cosa), y el bloque pasa
 *    a «editado a mano»: el agente ya no lo pisa al volver a mapear.
 */
export async function guardarCambiosDelEditor(
  clientId: string,
  blockId: string,
  version: number,
  operaciones: OperacionDelMapa[],
  quien: string,
): Promise<ResultadoDelEditor> {
  const b = await bloqueDelMapa(clientId, blockId);
  const actual: unknown = b?.data;
  if (!b || !esMapaDeCarriles(actual)) throw new ErrorDeProcesos(404, "Este mapa ya no existe: se volvió a mapear o alguien lo quitó.");
  if ((actual.version ?? 0) !== version) throw new ErrorDeProcesos(409, "Este mapa cambió mientras lo editabas.", actual);

  let nuevo: MapaDeProceso;
  try {
    nuevo = aplicarOperaciones(actual, operaciones);
  } catch (e) {
    if (e instanceof ErrorDeOperacion) throw new ErrorDeProcesos(400, e.message);
    throw e;
  }
  const nuevas = citasNuevas(actual, nuevo);
  const verificadas = await verificarCitas(clientId, nuevas.map((n) => n.cita));
  const { mapa: conCitas, descartadas } = completarCitas(nuevo, verificadas);
  const ahora = new Date().toISOString();
  const final: MapaDeProceso = {
    ...conCitas,
    version: version + 1,
    ...(actual.estado === "validado" ? { estado: "revisado" as const, validadoPor: null, validadoEn: null } : {}),
    ...(actual.estado !== "borrador" ? { revisadoPor: quien, revisadoEn: ahora } : {}),
  };

  // Se vuelve a mirar la versión con la fila tomada: entre leer y escribir pudo guardar otra persona.
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "CanvasBlock" WHERE id = ${blockId} FOR UPDATE`;
    const fila = await tx.canvasBlock.findUnique({ where: { id: blockId }, select: { data: true } });
    const ahoraEnLaBase: unknown = fila?.data;
    if (!esMapaDeCarriles(ahoraEnLaBase)) throw new ErrorDeProcesos(404, "Este mapa ya no existe: se volvió a mapear o alguien lo quitó.");
    if ((ahoraEnLaBase.version ?? 0) !== version) throw new ErrorDeProcesos(409, "Este mapa cambió mientras lo editabas.", ahoraEnLaBase);
    await tx.canvasBlock.update({
      where: { id: blockId },
      data: {
        data: final as unknown as Prisma.InputJsonValue,
        previousData: actual as unknown as Prisma.InputJsonValue,
        source: "MODIFIED",
        status: final.estado === "validado" ? "CONFIRMED" : "DRAFT",
      },
    });
  });
  return { mapa: final, citasDescartadas: descartadas };
}

/** Guarda un mapa del formato anterior editado en el visor viejo. Queda como editado a mano. */
export async function guardarMapaAnterior(
  clientId: string,
  blockId: string,
  data: { nodes: unknown[]; edges: unknown[]; description?: string },
): Promise<void> {
  const b = await bloqueDelMapa(clientId, blockId);
  if (!b || b.blockType !== "FLOWCHART" || esMapaDeCarriles(b.data)) throw new ErrorDeProcesos(404, "Ese mapa no existe.");
  await prisma.canvasBlock.update({
    where: { id: blockId },
    data: {
      data: { ...((b.data as Record<string, unknown> | null) ?? {}), ...data } as Prisma.InputJsonValue,
      previousData: (b.data ?? {}) as Prisma.InputJsonValue,
      source: "MODIFIED",
    },
  });
}

/** Quita un mapa (nuevo o del formato anterior) del cliente. */
export async function quitarMapa(clientId: string, blockId: string): Promise<void> {
  const b = await bloqueDelMapa(clientId, blockId);
  if (!b || b.blockType !== "FLOWCHART") throw new ErrorDeProcesos(404, "Ese mapa no existe.");
  await prisma.canvasBlock.delete({ where: { id: blockId } });
}
