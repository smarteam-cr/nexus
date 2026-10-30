/**
 * lib/cs/proyecto-en-marcha-server.ts — leer de la base lo que necesita la regla de «en marcha» (lib/cs/proyecto-en-
 * marcha.ts) para varios proyectos en una consulta. Lo usan la cartera (`cargarCuentas`), el vigía y el script que
 * cierra las alertas de los proyectos que no están en marcha.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { proyectoDeCarteraWhere } from "@/lib/projects/scope";
import { CIERRE_DEL_SISTEMA } from "./alertas-reglas";
import { alertasQueSeApagan, marchaDelProyecto, notaDeCierrePorMarcha, type LecturaDeMarcha, type ProyectoParaMarcha } from "./proyecto-en-marcha";

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Lo que mira la regla, por proyecto. Un id que no existe no viene. */
export async function datosDeMarcha(projectIds: readonly string[]): Promise<Map<string, ProyectoParaMarcha & { nombre: string }>> {
  const out = new Map<string, ProyectoParaMarcha & { nombre: string }>();
  if (projectIds.length === 0) return out;
  const filas = await prisma.project.findMany({
    where: { id: { in: [...new Set(projectIds)] } },
    select: {
      id: true,
      name: true,
      hubspotPipelineStageLabel: true,
      hubspotStatus: true,
      hubspotBlockReason: true,
      kickoffPublishedAt: true,
      timeline: { select: { anchorStartDate: true } },
    },
  });
  for (const f of filas) {
    out.set(f.id, {
      nombre: f.name,
      etapaHubspot: f.hubspotPipelineStageLabel,
      estadoHubspot: f.hubspotStatus,
      motivoBloqueo: f.hubspotBlockReason,
      kickoffPublicado: !!f.kickoffPublishedAt,
      arranqueConfirmado: f.timeline?.anchorStartDate ? ymd(f.timeline.anchorStartDate) : null,
    });
  }
  return out;
}

/** La lectura de cada proyecto (en marcha, sin arrancar o detenido), con su nombre. */
export async function marchaDeLosProyectos(
  projectIds: readonly string[],
  hoy: string,
): Promise<Map<string, LecturaDeMarcha & { nombre: string }>> {
  const datos = await datosDeMarcha(projectIds);
  return new Map([...datos].map(([id, d]) => [id, { ...marchaDelProyecto(d, hoy), nombre: d.nombre }]));
}

export interface AlertaApagada {
  id: string;
  category: string;
  title: string;
  cliente: string;
  projectId: string;
  proyecto: string;
  marcha: LecturaDeMarcha;
}

/** Las alertas abiertas que la regla apaga (`alertasQueSeApagan`). Solo lee. */
export async function alertasApagadasPorMarcha(hoy: string): Promise<AlertaApagada[]> {
  const abiertas = await prisma.csAlert.findMany({
    where: { status: { in: ["OPEN", "SEEN"] }, projectId: { not: null } },
    select: { id: true, clientId: true, projectId: true, category: true, title: true, client: { select: { name: true } } },
    orderBy: { lastDetectedAt: "desc" },
  });
  if (abiertas.length === 0) return [];
  const deCartera = await prisma.project.findMany({
    where: proyectoDeCarteraWhere({ clientId: { in: [...new Set(abiertas.map((a) => a.clientId))] } }),
    select: { id: true, clientId: true },
  });
  const marcha = await marchaDeLosProyectos([...abiertas.map((a) => a.projectId as string), ...deCartera.map((p) => p.id)], hoy);
  const conProyecto = abiertas.map((a) => ({ ...a, projectId: a.projectId as string }));
  return alertasQueSeApagan(conProyecto, deCartera, (id) => marcha.get(id)?.estado).map((a) => {
    const m = marcha.get(a.projectId)!;
    return { id: a.id, category: a.category, title: a.title, cliente: a.client.name, projectId: a.projectId, proyecto: m.nombre, marcha: m };
  });
}

/** Las cierra firmadas por el sistema, con su nota. Un cierre del sistema no suprime la reaparición. */
export async function cerrarAlertasApagadas(alertas: readonly AlertaApagada[]): Promise<number> {
  let cerradas = 0;
  for (const a of alertas) {
    const r = await prisma.csAlert.updateMany({
      where: { id: a.id, status: { in: ["OPEN", "SEEN"] } },
      data: { status: "RESOLVED", resolvedAt: new Date(), resolvedByEmail: CIERRE_DEL_SISTEMA, resolutionNote: notaDeCierrePorMarcha(a.proyecto, a.marcha) },
    });
    cerradas += r.count;
  }
  return cerradas;
}
