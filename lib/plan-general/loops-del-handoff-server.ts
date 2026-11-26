/**
 * lib/plan-general/loops-del-handoff-server.ts — lo que el handoff necesita de la base para declarar loops
 * (lib/plan-general/loops-del-handoff.ts). Server-only.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { pipelineByKey } from "@/lib/projects/kind";
import { bloqueDeLoopsParaElHandoff, fasesDeLosLoops, leerLoopsDeLaTabla, SECCION_DE_LOOPS, type LoopDeclarado } from "./loops-del-handoff";

/** Los loops que ya tiene la cuenta del proyecto (en cualquiera de sus proyectos activos), y si es un SmartLoop. */
async function loopsDeLaCuenta(projectId: string) {
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { clientId: true, hubspotPipelineId: true } });
  if (!p) return null;
  const fases = await prisma.timelinePhase.findMany({
    where: { loopNumero: { not: null }, timeline: { project: { clientId: p.clientId, status: "active", esPrueba: false } } },
    select: { name: true, loopNumero: true, timeline: { select: { projectId: true, project: { select: { name: true } } } } },
    orderBy: { loopNumero: "asc" },
  });
  return { esSmartLoop: p.hubspotPipelineId === pipelineByKey("smartloop").hubspotPipelineId, fases };
}

/**
 * ¿El proyecto trabaja por loops? Un SmartLoop, o cualquier proyecto de una cuenta que ya los tiene. Solo entonces el
 * handoff guarda su sección de loops y los vuelve fases; en el resto se descarta lo que el modelo haya escrito ahí.
 * Devuelve los números que ya usan los OTROS proyectos de la cuenta (para numerar un loop que vino sin número).
 */
export async function proyectoTrabajaPorLoops(
  projectId: string,
): Promise<{ si: boolean; numerosDeOtros: number[]; propios: Map<string, number> }> {
  const c = await loopsDeLaCuenta(projectId);
  if (!c) return { si: false, numerosDeOtros: [], propios: new Map() };
  return {
    si: c.esSmartLoop || c.fases.length > 0,
    numerosDeOtros: c.fases.filter((f) => f.timeline.projectId !== projectId).map((f) => f.loopNumero!),
    propios: new Map(c.fases.filter((f) => f.timeline.projectId === projectId).map((f) => [f.name.trim().toLowerCase(), f.loopNumero!])),
  };
}

/**
 * El bloque de loops para el mensaje del handoff, o null si el proyecto no trabaja por loops. Trabaja por loops un
 * SmartLoop, o cualquier proyecto de una cuenta que ya tiene loops (la integración de kölbi es de Desarrollo y es el
 * loop 01). Solo mira proyectos activos de la MISMA cuenta.
 */
export async function bloqueDeLoopsDelProyecto(projectId: string): Promise<string | null> {
  const c = await loopsDeLaCuenta(projectId);
  if (!c || (!c.esSmartLoop && c.fases.length === 0)) return null;
  return bloqueDeLoopsParaElHandoff(c.fases.map((f) => ({ numero: f.loopNumero!, nombre: f.name, proyecto: f.timeline.project?.name ?? "" })));
}

/**
 * Con un cronograma que YA existe, el handoff no lo pisa (queda una propuesta). Lo único que hace con los loops es
 * marcar con su número las fases que se llaman como uno de ellos y todavía no lo tienen. Devuelve cuántas marcó.
 */
export async function marcarLoopsPorNombre(projectId: string, loops: readonly (LoopDeclarado & { numero: number })[]): Promise<number> {
  let n = 0;
  for (const l of loops) {
    const r = await prisma.timelinePhase.updateMany({
      where: { timeline: { projectId }, loopNumero: null, name: { equals: l.nombre, mode: "insensitive" } },
      data: { loopNumero: l.numero },
    });
    n += r.count;
  }
  return n;
}

/**
 * Marca las fases del cronograma con el número de los loops que declara el HANDOFF del proyecto (su sección `loops`).
 * Lo llama la aplicación de una propuesta: con un cronograma que ya existía, el handoff deja una propuesta, y las fases
 * que crea al aplicarla nacen sin número. Solo si el proyecto trabaja por loops. Nunca falla hacia afuera.
 */
export async function marcarLoopsDelHandoff(projectId: string): Promise<number> {
  try {
    const trabaja = await proyectoTrabajaPorLoops(projectId);
    if (!trabaja.si) return 0;
    const bloques = await prisma.canvasBlock.findMany({
      where: { blockType: "TABLE", section: { key: SECCION_DE_LOOPS, canvas: { projectId, slug: "handoff" } } },
      select: { data: true },
      orderBy: { order: "asc" },
    });
    const loops = bloques.flatMap((b) => leerLoopsDeLaTabla(b.data));
    if (loops.length === 0) return 0;
    const fases = fasesDeLosLoops(loops, 1, trabaja.numerosDeOtros, trabaja.propios);
    return await marcarLoopsPorNombre(projectId, loops.map((l, i) => ({ ...l, numero: fases[i].loopNumero })));
  } catch (e) {
    console.warn("[loops] marcar los loops del handoff falló:", e instanceof Error ? e.message : e);
    return 0;
  }
}
