/**
 * lib/artefactos/contexto-server.ts — el contexto adicional de una COPIA, del lado del servidor (etapa V3b de
 * docs/artefactos-plan.md): qué reuniones se pueden elegir y a quién le toca curarlo. Las reuniones salen SIEMPRE del
 * chokepoint (`getProjectMemberSessions`, invariante 1): una id de otra empresa no entra aunque alguien la mande.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { documentoConContexto, type SeccionConContexto } from "@/lib/contexto/documento";
import { getProjectMemberSessions } from "@/lib/sessions/project-sources";
import { canvasDeLaPieza, piezaDeLasNotas, reunionesDeLaCopia } from "./contexto-de-la-copia";
import { esCopia } from "./copias";
import { tipoDeArtefacto } from "./tipos";

export interface ReunionParaElegir {
  id: string;
  titulo: string;
  fecha: string;
  elegida: boolean;
}

/** Una copia viva del proyecto, con su tipo. null si no lo es. */
export async function copiaDelProyecto(projectId: string, canvasId: string) {
  const c = await prisma.projectCanvas.findFirst({
    where: { id: canvasId, projectId, disabledAt: null },
    select: { id: true, slug: true, tipoArtefacto: true, sections: true },
  });
  if (!c || !esCopia(c)) return null;
  const tipo = tipoDeArtefacto(c.tipoArtefacto);
  return tipo ? { ...c, tipo } : null;
}

/** Las reuniones del proyecto para elegir en una copia: de la más nueva a la más vieja, las elegidas marcadas. */
export async function reunionesParaElegir(projectId: string, canvasId: string): Promise<ReunionParaElegir[] | null> {
  const copia = await copiaDelProyecto(projectId, canvasId);
  if (!copia) return null;
  const elegidas = new Set(reunionesDeLaCopia(copia.sections));
  const { sessions } = await getProjectMemberSessions(projectId);
  return [...sessions]
    .sort((a, b) => b.date - a.date)
    .map((s) => ({ id: s.id, titulo: s.title, fecha: new Date(s.date).toISOString(), elegida: elegidas.has(s.id) }));
}

/** De las ids pedidas, las que de verdad son del proyecto. */
export async function reunionesDelProyecto(projectId: string, ids: readonly string[]): Promise<string[]> {
  const { sessions } = await getProjectMemberSessions(projectId);
  const delProyecto = new Set(sessions.map((s) => s.id));
  return ids.filter((id) => delProyecto.has(id));
}

/**
 * El documento de una ruta de notas: uno de siempre (`diagnosis`, `kickoff`…) o una copia (`copia-<canvasId>`). null = no
 * tiene contexto propio. `seccion` es la celda que habilita curarlo.
 */
export async function documentoDeLasNotas(projectId: string, pieza: string): Promise<{ pieza: string; seccion: SeccionConContexto } | null> {
  const canvasId = canvasDeLaPieza(pieza);
  if (!canvasId) return documentoConContexto(pieza);
  const copia = await copiaDelProyecto(projectId, canvasId);
  if (!copia) return null;
  return { pieza: piezaDeLasNotas(canvasId), seccion: copia.tipo.permiso as SeccionConContexto };
}
