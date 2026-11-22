/**
 * lib/versiones/guardar-server.ts — guarda una versión de un documento (DECISIONS «Historial de versiones», 21 nov).
 * SERVIDOR. Lo usan los canvases (lib/canvas/versiones.ts) y el Resumen de La escala. El cronograma arma su historial
 * con lo que ya guardaba (lib/timeline/historial-del-cronograma-server.ts).
 *
 * Reglas, las mismas para todos:
 *   · dos iguales seguidas no se guardan dos veces (la huella). Si la que llega es para publicar, proteger o congelar y es
 *     igual a la última, se marca la última: lo que importa es que quede;
 *   · 30 por documento: se van las más viejas. Las protegidas (lo que vio, aprobó o congeló el cliente) no se borran ni
 *     ocupan lugar;
 *   · NUNCA lanza: perder una versión es malo; tumbar la corrida o la publicación que la pidió es peor.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { modeloDisponible } from "@/lib/db/esquema";
import { tipoDeLoQueHabia, type TipoDeVersion } from "./historial";

/** Cuántas versiones se guardan por documento: las más viejas se van. */
export const VERSIONES_POR_DOCUMENTO = 30;

/** De quién es la versión: exactamente uno (CHECK VersionDeDocumento_un_solo_dueno). El cronograma no guarda aquí. */
export type DuenoDeVersion = { canvasId: string } | { exploracionId: string };

export interface VersionNueva {
  /** Cómo nació. «antes»: lo que había antes de reemplazarlo; el tipo lo decide `tipoDeLoQueHabia`. */
  tipo: TipoDeVersion | "antes";
  /** La explicación que se ve en la lista («Por la nota de Paula», «Volvió la del 20 nov»). Obligatoria en la base. */
  nota: string;
  creadaPor: string | null;
  huella: string;
  /** La foto de un canvas. */
  secciones?: unknown;
  /** La foto de lo que no es un canvas. */
  contenido?: unknown;
  pieza?: string | null;
  publicada?: boolean;
  protegida?: boolean;
  /** Solo para pasar una versión de antes con su fecha (la anterior del Resumen). */
  createdAt?: Date;
}

export type VersionGuardada = { guardada: boolean; id?: string; motivo?: string };


export async function guardarVersion(dueno: DuenoDeVersion, v: VersionNueva): Promise<VersionGuardada> {
  try {
    if (!modeloDisponible(prisma.versionDeDocumento)) return { guardada: false, motivo: "falta la tabla" };
    const where = dueno as Prisma.VersionDeDocumentoWhereInput;
    const ultima = await prisma.versionDeDocumento.findFirst({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, huella: true },
    });
    if (ultima?.huella === v.huella) {
      if (!v.publicada && !v.protegida) return { guardada: false, id: ultima.id, motivo: "igual a la última" };
      /* Presentar o congelar lo mismo que ya estaba: esa versión pasa a ser la presentada o la congelada (como antes del
         21 nov, que le reescribía el origen). Publicar solo la marca: conserva cómo nació. */
      const renombrar = v.tipo === "presentado" || v.tipo === "congelado";
      await prisma.versionDeDocumento.update({
        where: { id: ultima.id },
        data: {
          ...(v.publicada ? { publicada: true } : {}),
          ...(v.protegida ? { protegida: true } : {}),
          ...(renombrar ? { tipo: v.tipo, origen: v.nota } : {}),
        },
      });
      return { guardada: true, id: ultima.id, motivo: "marcada la última, que era igual" };
    }
    const tipo = v.tipo === "antes" ? tipoDeLoQueHabia(ultima?.huella, v.huella) : v.tipo;
    const creada = await prisma.versionDeDocumento.create({
      data: {
        ...dueno,
        pieza: v.pieza ?? null,
        origen: v.nota,
        tipo,
        creadaPor: v.creadaPor,
        huella: v.huella,
        // `secciones` es NOT NULL desde 2026-09-28: lo que no es un canvas guarda [] y su foto en `contenido`.
        secciones: (v.secciones ?? []) as Prisma.InputJsonValue,
        ...(v.contenido !== undefined ? { contenido: v.contenido as Prisma.InputJsonValue } : {}),
        ...(v.publicada ? { publicada: true } : {}),
        ...(v.protegida ? { protegida: true } : {}),
        ...(v.createdAt ? { createdAt: v.createdAt } : {}),
      },
      select: { id: true },
    });
    const sobrantes = await prisma.versionDeDocumento.findMany({
      where: { ...where, protegida: false },
      orderBy: { createdAt: "desc" },
      skip: VERSIONES_POR_DOCUMENTO,
      select: { id: true },
    });
    if (sobrantes.length) await prisma.versionDeDocumento.deleteMany({ where: { id: { in: sobrantes.map((s) => s.id) } } });
    return { guardada: true, id: creada.id };
  } catch (e) {
    console.error(`[versiones] no se pudo guardar la versión (${v.nota}):`, e instanceof Error ? e.message : e);
    return { guardada: false, motivo: "error" };
  }
}

/** Las filas de un documento para armar el historial (sin la foto: eso lo trae el detalle). */
export async function filasDelHistorial(dueno: DuenoDeVersion) {
  if (!modeloDisponible(prisma.versionDeDocumento)) return [];
  const filas = await prisma.versionDeDocumento.findMany({
    where: dueno as Prisma.VersionDeDocumentoWhereInput,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, tipo: true, origen: true, creadaPor: true, createdAt: true, huella: true, publicada: true },
  });
  return filas.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() }));
}
