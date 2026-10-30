/**
 * lib/artefactos/lectores-server.ts — LOS DOCUMENTOS DE UN TIPO EN UN PROYECTO, como los leen los lectores (etapa V3 de
 * docs/artefactos-plan.md). Va a la base.
 *
 * Los documentos de un tipo son el de siempre (por `canvasOf`, con su lectura doble por nombre histórico) más las copias
 * (`tipoArtefacto = tipo`, `slug` en null). Las copias archivadas (`disabledAt`) no se leen. El de siempre se lee aunque
 * esté apagado, igual que hoy: las consultas de EXISTENCIA no miran `disabledAt` (lib/pieces/canvas-query.ts lo explica:
 * el contexto de los agentes es una de ellas).
 *
 * ⚠ Sin `import "server-only"` a propósito: lo carga `loadCanvasContext` (lib/canvas/load-canvas-context.ts), que también
 * cargan las pruebas unitarias y varios scripts de consola, y `server-only` los haría morir al cargar (KNOWN-ERRORS). Igual
 * que ese archivo, solo corre en el servidor porque habla con Prisma.
 *
 * Si la base todavía no tiene las columnas de las copias (el SQL 2026-10-29-artefactos-copias.sql sin aplicar), las copias
 * se leen como ninguna: el lector sigue con el documento de siempre, como antes.
 */
import { prisma } from "@/lib/db/prisma";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { esCopia, estadoDelArtefacto, nombreDelArtefacto, ordenarArtefactos, rotuloParaLosAgentes, type EstadoDelArtefacto } from "./copias";

export interface ArtefactoLeido {
  id: string;
  projectId: string;
  nombre: string;
  estado: EstadoDelArtefacto;
  esCopia: boolean;
  terminadoEn: Date | null;
  /** «Planificación — Marketing (terminado)»: con lo que un agente lo lee. */
  rotulo: string;
  order: number;
  createdAt: Date;
}

const SELECT = {
  id: true,
  projectId: true,
  slug: true,
  tipoArtefacto: true,
  name: true,
  titulo: true,
  order: true,
  createdAt: true,
  terminadoEn: true,
} as const;

interface Fila {
  id: string;
  projectId: string | null;
  slug: string | null;
  tipoArtefacto: string | null;
  name: string;
  titulo: string | null;
  order: number;
  createdAt: Date;
  terminadoEn: Date | null;
}

function leido(f: Fila): ArtefactoLeido {
  return {
    id: f.id,
    projectId: f.projectId ?? "",
    nombre: nombreDelArtefacto(f),
    estado: estadoDelArtefacto(f),
    esCopia: esCopia(f),
    terminadoEn: f.terminadoEn,
    rotulo: rotuloParaLosAgentes(f),
    order: f.order,
    createdAt: f.createdAt,
  };
}

/** Las COPIAS vivas de un tipo en esos proyectos (sin el de siempre). [] si la base no tiene las columnas todavía. */
async function copiasEn(projectIds: readonly string[], tipo: string): Promise<Fila[]> {
  if (projectIds.length === 0) return [];
  try {
    return await prisma.projectCanvas.findMany({
      where: { projectId: { in: [...projectIds] }, tipoArtefacto: tipo, slug: null, disabledAt: null },
      select: SELECT,
    });
  } catch (e) {
    if (esquemaDesactualizado(e)) return [];
    throw e;
  }
}

/** Solo las copias de un tipo en un proyecto (lo usa `loadCanvasContext` para saber si hay más de uno). */
export async function copiasDelTipo(projectId: string, tipo: string): Promise<ArtefactoLeido[]> {
  return ordenarArtefactos((await copiasEn([projectId], tipo)).map(leido));
}

/**
 * TODOS los documentos de un tipo en un proyecto: el de siempre y sus copias vivas, en el orden de la persona. [] si no
 * hay ninguno.
 */
export async function artefactosDelTipo(projectId: string, tipo: string): Promise<ArtefactoLeido[]> {
  const mapa = await artefactosDelTipoEnProyectos([projectId], tipo);
  return mapa.get(projectId) ?? [];
}

/** Lo mismo para varios proyectos a la vez (un lector de la cuenta, como el agente de procesos). */
export async function artefactosDelTipoEnProyectos(projectIds: readonly string[], tipo: string): Promise<Map<string, ArtefactoLeido[]>> {
  const ids = [...new Set(projectIds)];
  const porProyecto = new Map<string, ArtefactoLeido[]>(ids.map((id) => [id, []]));
  if (ids.length === 0) return porProyecto;
  const [deSiempre, copias] = await Promise.all([
    // Sin las columnas nuevas en el select: el de siempre se lee aunque el SQL no esté aplicado.
    prisma.projectCanvas.findMany({
      where: { projectId: { in: ids }, ...canvasOf(tipo) },
      select: { id: true, projectId: true, slug: true, name: true, order: true, createdAt: true },
    }),
    copiasEn(ids, tipo),
  ]);
  // El estado y el nombre propio del de siempre (`terminadoEn`, `titulo`) van aparte: con el SQL sin aplicar, queda «en
  // construcción» y con el nombre de su pieza.
  const extra = new Map<string, { terminadoEn: Date | null; titulo: string | null }>();
  if (deSiempre.length) {
    try {
      const filas = await prisma.projectCanvas.findMany({
        where: { id: { in: deSiempre.map((c) => c.id) } },
        select: { id: true, terminadoEn: true, titulo: true },
      });
      for (const f of filas) extra.set(f.id, { terminadoEn: f.terminadoEn, titulo: f.titulo });
    } catch (e) {
      if (!esquemaDesactualizado(e)) throw e;
    }
  }
  // Uno de siempre por proyecto, como `findFirst(canvasOf)`: el primero que da la base.
  const vistos = new Set<string>();
  for (const c of deSiempre) {
    if (!c.projectId || vistos.has(c.projectId)) continue;
    vistos.add(c.projectId);
    porProyecto.get(c.projectId)?.push(
      leido({ ...c, tipoArtefacto: null, terminadoEn: extra.get(c.id)?.terminadoEn ?? null, titulo: extra.get(c.id)?.titulo ?? null }),
    );
  }
  for (const c of copias) if (c.projectId) porProyecto.get(c.projectId)?.push(leido(c));
  for (const [id, lista] of porProyecto) porProyecto.set(id, ordenarArtefactos(lista));
  return porProyecto;
}
