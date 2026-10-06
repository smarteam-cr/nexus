import "server-only";
/**
 * lib/procesos/servidor.ts — LEER Y CAMBIAR LOS MAPAS DE PROCESOS DE UN CLIENTE.
 *
 * Los mapas son bloques de la sección «procesos» del canvas Información del cliente (proyecto
 * centinela). Acá se leen separados en: los mapas nuevos (`carriles-v1`), el índice que deja el
 * agente y los mapas del formato anterior que siguen en pie. Las escrituras son tres: el estado del
 * mapa (revisado / validado con el cliente), editar un paso y quitar un mapa.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { canvasOfNested } from "@/lib/pieces/canvas-query";
import { SENTINEL_SERVICE_TYPE } from "@/lib/projects/kind";
import { ultimaCorrida } from "./agente";
import {
  esIndiceDeProcesos,
  esMapaAnterior,
  esMapaDeCarriles,
  type EstadoDelMapa,
  type IndiceDeProcesos,
  type MapaDeProceso,
  type OrigenDelPaso,
  type PasoDelMapa,
} from "./mapa";

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
  constructor(public readonly status: number, mensaje: string) {
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
  };
  // CONFIRMED = lo puede mostrar el kickoff (solo lo validado con el cliente cruza).
  await prisma.canvasBlock.update({
    where: { id: blockId },
    data: { data: mapa as unknown as Prisma.InputJsonValue, status: estado === "validado" ? "CONFIRMED" : "DRAFT" },
  });
  return mapa;
}

export interface CambioDePaso {
  version: "hoy" | "despues";
  pasoId: string;
  texto: string;
  carril: string;
  herramienta: string;
  dolor: string;
  origen: OrigenDelPaso;
  /** Índices de las citas que se quitan (las citas no se escriben a mano: se eligen de la reunión). */
  quitarCitas: number[];
}

/**
 * Edita un paso. Reglas que no dependen de la pantalla:
 *  - «dicho» (hoy) y «acordado» (después) piden al menos una cita: sin cita, es un supuesto;
 *  - un mapa validado con el cliente vuelve a «revisado» al cambiarlo (lo validado era otra cosa);
 *  - el bloque pasa a «editado a mano» y el agente ya no lo pisa al volver a mapear.
 */
export async function editarPaso(clientId: string, blockId: string, c: CambioDePaso, quien: string): Promise<MapaDeProceso> {
  const b = await bloqueDelMapa(clientId, blockId);
  const mapa: unknown = b?.data;
  if (!b || !esMapaDeCarriles(mapa)) throw new ErrorDeProcesos(404, "Ese mapa no existe.");
  const version = c.version === "hoy" ? mapa.hoy : mapa.despues;
  const i = version.pasos.findIndex((p) => p.id === c.pasoId);
  if (i === -1) throw new ErrorDeProcesos(404, "Ese paso no existe.");
  if (!version.carriles.some((x) => x.id === c.carril)) throw new ErrorDeProcesos(400, "Ese carril no existe en el mapa.");
  const permitidos: OrigenDelPaso[] = c.version === "hoy" ? ["dicho", "supuesto"] : ["acordado", "propuesto", "supuesto"];
  if (!permitidos.includes(c.origen)) throw new ErrorDeProcesos(400, "Ese origen no vale para esta versión del mapa.");
  const quitar = new Set(c.quitarCitas);
  const citas = version.pasos[i].citas.filter((_, k) => !quitar.has(k));
  if ((c.origen === "dicho" || c.origen === "acordado") && citas.length === 0) {
    throw new ErrorDeProcesos(400, "Para marcarlo como dicho por el cliente hace falta una cita de una reunión. Sin cita queda como supuesto.");
  }
  const paso: PasoDelMapa = {
    ...version.pasos[i],
    texto: c.texto.trim().slice(0, 120) || version.pasos[i].texto,
    carril: c.carril,
    herramienta: c.herramienta.trim().slice(0, 80),
    dolor: c.version === "hoy" ? c.dolor.trim().slice(0, 140) : "",
    origen: c.origen,
    citas,
  };
  const pasos = version.pasos.map((p, k) => (k === i ? paso : p));
  const nuevo: MapaDeProceso = {
    ...mapa,
    ...(c.version === "hoy" ? { hoy: { ...mapa.hoy, pasos } } : { despues: { ...mapa.despues, pasos } }),
    ...(mapa.estado === "validado" ? { estado: "revisado" as const, validadoPor: null, validadoEn: null } : {}),
    revisadoPor: mapa.estado === "borrador" ? mapa.revisadoPor ?? null : quien,
  };
  await prisma.canvasBlock.update({
    where: { id: blockId },
    data: { data: nuevo as unknown as Prisma.InputJsonValue, previousData: mapa as unknown as Prisma.InputJsonValue, source: "MODIFIED", status: nuevo.estado === "validado" ? "CONFIRMED" : "DRAFT" },
  });
  return nuevo;
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
