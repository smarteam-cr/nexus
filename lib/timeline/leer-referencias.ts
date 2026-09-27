/**
 * lib/timeline/leer-referencias.ts — CONTRA QUÉ SE COMPARA LA PROPUESTA, leído de la base (L4, 2026-09-26). SERVER-ONLY.
 *
 * Lo llama el GET del cronograma (app/api/projects/[projectId]/timeline/route.ts) SOLO con un `borrador-v1` guardado.
 * Lo puro (los tipos, la validación del snapshot y de la salida del handoff, la caché) vive en
 * referencias-de-la-propuesta.ts. Acá:
 *   · lo prometido: sale del snapshot que el GET ya leyó (ninguna consulta nueva);
 *   · el handoff: la última corrida DONE del grupo `handoff` (`whereCorridasDeDocumento`, el ÚNICO `where` de las
 *     corridas de un documento), con una caché de 50 propuestas por token: `AgentRun` no tiene índice por proyecto y
 *     su salida pesa. No con una propuesta que ES del handoff (compararla consigo misma no dice nada);
 *   · las fuentes: las reuniones de las corridas de la propuesta (la del paso 1, si la hubo, y la del paso 2), las notas
 *     que había cuando corrió la más nueva y si hay instrucciones adicionales.
 * Es contexto de apoyo: quien llama lo envuelve en `.catch(() => null)`, y una tabla que falta no tumba el GET.
 */
import { prisma } from "@/lib/db/prisma";
import { whereCorridasDeDocumento } from "@/lib/agents/historial-corridas";
import { ID_ESTRUCTURA_CRONOGRAMA } from "@/lib/agents/estructura-cronograma";
import { docBriefFrom } from "@/lib/business-cases/section-briefs";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { esBorradorV1, leerBorrador } from "./borrador";
import {
  cacheAcotada,
  handoffDeLaSalida,
  prometidoDelSnapshot,
  type FuentesDeLaPropuesta,
  type HandoffDeLaPropuesta,
  type ReferenciasDeLaPropuesta,
} from "./referencias-de-la-propuesta";

/** El handoff de cada propuesta abierta, por su token (null también se recuerda: no hay handoff que leer). */
const HANDOFF_POR_TOKEN = cacheAcotada<HandoffDeLaPropuesta | null>();

async function leerElHandoff(projectId: string, token: string | null): Promise<HandoffDeLaPropuesta | null> {
  const clave = token ? `${projectId}:${token}` : null;
  if (clave && HANDOFF_POR_TOKEN.has(clave)) return HANDOFF_POR_TOKEN.get(clave) ?? null;
  const corrida = await prisma.agentRun.findFirst({
    where: { ...whereCorridasDeDocumento(projectId, "handoff"), status: "DONE" },
    orderBy: { createdAt: "desc" },
    select: { id: true, output: true, createdAt: true },
  });
  const handoff = corrida ? handoffDeLaSalida(corrida.output, corrida.createdAt) : null;
  if (clave) HANDOFF_POR_TOKEN.set(clave, handoff);
  return handoff;
}

/** Los títulos de las notas vivas del cronograma cargadas hasta `hasta` (tolera que la tabla falte, como cargar.ts). */
async function notasHasta(projectId: string, hasta: Date): Promise<string[]> {
  if (!modeloDisponible(prisma.timelineSource)) return [];
  try {
    const notas = await prisma.timelineSource.findMany({
      where: { projectId, deletedAt: null, createdAt: { lte: hasta } },
      orderBy: { createdAt: "asc" },
      select: { title: true },
    });
    return notas.map((n) => n.title?.trim() || "Nota sin título");
  } catch (e) {
    if (esquemaDesactualizado(e)) return [];
    throw e;
  }
}

async function leerLasFuentes(
  projectId: string,
  token: string | null,
  corridaDeLasTareas: string | null,
): Promise<FuentesDeLaPropuesta | null> {
  const ids = [...new Set([token, corridaDeLasTareas].filter((x): x is string => !!x))];
  if (ids.length === 0) return null;
  const corridas = (
    await prisma.agentRun.findMany({
      where: { id: { in: ids } },
      select: { id: true, agentSlug: true, sourceSessionIds: true, createdAt: true },
    })
  ).filter((c) => c.id === corridaDeLasTareas || c.agentSlug === ID_ESTRUCTURA_CRONOGRAMA);
  if (corridas.length === 0) return null;
  const sesiones = [...new Set(corridas.flatMap((c) => c.sourceSessionIds))];
  const masNueva = new Date(Math.max(...corridas.map((c) => c.createdAt.getTime())));
  const [reuniones, notas, canvas] = await Promise.all([
    sesiones.length
      ? prisma.firefliesSession.findMany({ where: { id: { in: sesiones } }, orderBy: { date: "asc" }, select: { title: true, date: true } })
      : Promise.resolve([]),
    notasHasta(projectId, masNueva),
    prisma.projectCanvas.findFirst({ where: { projectId, ...canvasOf("timeline") }, select: { sections: true } }),
  ]);
  return {
    // Aproximado: dice si hay instrucciones HOY (no si las había cuando corrió).
    instrucciones: !!(canvas && docBriefFrom(canvas.sections)),
    reuniones: reuniones.map((r) => ({ titulo: r.title, fecha: r.date.toISOString() })),
    notas,
  };
}

/**
 * Las referencias de la propuesta guardada, o null si no es un `borrador-v1` que se deje leer. `publishedSnapshot` y
 * `publicadoEn` (`Project.timelinePublishedAt`) los pasa el GET, que ya los leyó.
 */
export async function leerReferenciasDeLaPropuesta(i: {
  projectId: string;
  guardado: unknown;
  token: string | null;
  publishedSnapshot: unknown;
  publicadoEn: Date | null;
}): Promise<ReferenciasDeLaPropuesta | null> {
  if (!esBorradorV1(i.guardado)) return null;
  const borrador = leerBorrador(i.guardado);
  if (!borrador) return null;
  const [handoff, fuentes] = await Promise.all([
    borrador.origen === "handoff" ? Promise.resolve(null) : leerElHandoff(i.projectId, i.token),
    leerLasFuentes(i.projectId, i.token, borrador.tareas?.corrida ?? null),
  ]);
  return { prometido: prometidoDelSnapshot(i.publishedSnapshot, i.publicadoEn), handoff, fuentes };
}
