/**
 * lib/tareas/siguiente-paso.ts — las tareas de las que sale el siguiente paso (2026-10-16, fase 0.2 de
 * docs/nexus-sistema-de-trabajo-plan.md). SERVIDOR. Solo lee.
 *
 * Las lee lib/siguiente-paso (la pantalla del siguiente paso, la copia que se escribe en HubSpot). Es una lectura de la
 * CUENTA, no de una persona: trae lo que vería cualquiera con acceso a la cuenta (la regla de las cuentas de
 * visibilidad.ts), así que nunca lo «Solo para mí», lo de un espacio de «solo miembros» ni el borrador de un plan.
 * La regla de cuál es el siguiente paso vive en lib/siguiente-paso/desde-tareas.ts (pura).
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { SPRINTS_CON_PASO, type TareaDelPaso } from "@/lib/siguiente-paso/desde-tareas";
import { VISIBLES_PARA_AGENTES } from "./para-agentes";
import { comoFecha, hoyEnCostaRica } from "./semana";
import { tareasDisponible } from "./servidor";

const SELECT = {
  id: true,
  numero: true,
  titulo: true,
  estado: true,
  privada: true,
  equipo: true,
  responsableEmail: true,
  venceEl: true,
  semana: true,
  reunionInicio: true,
  clientId: true,
  projectId: true,
  hubspotDealId: true,
  origen: true,
  creadaPorEmail: true,
  createdAt: true,
  version: true,
} satisfies Prisma.TareaSelect;

type Fila = Prisma.TareaGetPayload<{ select: typeof SELECT }>;

function aTarea(f: Fila): TareaDelPaso {
  return {
    id: f.id,
    numero: f.numero,
    titulo: f.titulo,
    estado: f.estado,
    privada: f.privada,
    equipo: f.equipo,
    responsableEmail: f.responsableEmail,
    venceEl: comoFecha(f.venceEl),
    semana: comoFecha(f.semana),
    reunionDia: f.reunionInicio ? hoyEnCostaRica(f.reunionInicio) : null,
    clientId: f.clientId,
    projectId: f.projectId,
    hubspotDealId: f.hubspotDealId,
    origen: f.origen,
    creadaPorEmail: f.creadaPorEmail,
    creadaAt: f.createdAt.toISOString(),
    version: f.version,
  };
}

export interface DondeBuscar {
  clientIds?: readonly string[];
  hubspotDealIds?: readonly string[];
  projectIds?: readonly string[];
}

function dondeWhere(d: DondeBuscar): Prisma.TareaWhereInput[] {
  const o: Prisma.TareaWhereInput[] = [];
  if (d.clientIds?.length) o.push({ clientId: { in: [...d.clientIds] } });
  if (d.hubspotDealIds?.length) o.push({ hubspotDealId: { in: [...d.hubspotDealIds] } });
  if (d.projectIds?.length) o.push({ projectId: { in: [...d.projectIds] } });
  return o;
}

/** Las abiertas (pendientes y en curso) de los sprints con siguiente paso, de esas cuentas, negocios y proyectos. */
export async function tareasAbiertasParaElPaso(d: DondeBuscar): Promise<TareaDelPaso[]> {
  const donde = dondeWhere(d);
  if (!donde.length || !(await tareasDisponible())) return [];
  try {
    const filas = await prisma.tarea.findMany({
      where: { AND: [VISIBLES_PARA_AGENTES, { estado: { in: ["pendiente", "en_curso"] }, equipo: { in: [...SPRINTS_CON_PASO] }, OR: donde }] },
      select: SELECT,
      take: 500,
    });
    return filas.map(aTarea);
  } catch (e) {
    if (esquemaDesactualizado(e)) return [];
    throw e;
  }
}

/** Una tarea por id, con lo mismo (para darla por hecha desde la pantalla del siguiente paso). */
export async function tareaDelPaso(id: string): Promise<TareaDelPaso | null> {
  if (!(await tareasDisponible())) return null;
  const f = await prisma.tarea.findFirst({ where: { AND: [VISIBLES_PARA_AGENTES, { id }] }, select: SELECT });
  return f ? aTarea(f) : null;
}

/** Las últimas tareas de un equipo sobre un objeto, de cualquier estado: la historia del siguiente paso. */
export async function historiaDeTareasDelPaso(d: DondeBuscar, sprint: string, limite = 10): Promise<TareaDelPaso[]> {
  const donde = dondeWhere(d);
  if (!donde.length || !(await tareasDisponible())) return [];
  const filas = await prisma.tarea.findMany({
    where: { AND: [VISIBLES_PARA_AGENTES, { equipo: sprint, estado: { in: ["pendiente", "en_curso", "hecha", "no_se_hara"] }, OR: donde }] },
    select: SELECT,
    orderBy: { updatedAt: "desc" },
    take: limite,
  });
  return filas.map(aTarea);
}

/** Las cuentas con una tarea de un sprint con paso que cambió desde `desde` (para la copia que va a HubSpot). */
export async function cuentasConTareasCambiadas(desde: Date, limite = 60): Promise<string[]> {
  if (!(await tareasDisponible())) return [];
  const filas = await prisma.tarea.findMany({
    where: { updatedAt: { gte: desde }, clientId: { not: null }, equipo: { in: [...SPRINTS_CON_PASO] } },
    select: { clientId: true },
    distinct: ["clientId"],
    take: limite,
  });
  return filas.flatMap((f) => (f.clientId ? [f.clientId] : []));
}
