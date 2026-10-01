/**
 * lib/exploraciones/handoff.ts — a qué handoff le llega una exploración de venta. SERVIDOR.
 *
 * La regla, en orden:
 *   1. Solo a proyectos de Customer Success: nunca a uno de desarrollo ni de sitio web (sus agentes
 *      de handoff hablan de otra cosa y la escala no es su vara).
 *   2. La exploración enlazada a la PROPUESTA del mismo negocio que el proyecto (el kickoff une
 *      propuesta y proyecto por el negocio; siempre dentro del mismo cliente).
 *   3. Si no hay ese enlace: la exploración más reciente de la empresa, solo si el proyecto nació
 *      después de que empezó y a lo sumo seis meses después de su última actividad, y solo si es el
 *      PRIMER proyecto de Customer Success de la empresa en esa ventana: un ciclo posterior no la
 *      recibe (lo que se habló para la primera venta no es el contexto de la segunda).
 */
import "server-only";
import { pipelineKeyDeProyecto } from "@/lib/agents/resolver";
import { modeloDisponible } from "@/lib/db/esquema";
import { prisma } from "@/lib/db/prisma";
import { SENTINEL_SERVICE_TYPE } from "@/lib/projects/kind";
import { proyectoClasificableWhere } from "@/lib/projects/scope";
import { bloqueParaElHandoff } from "./para-el-handoff";
import { exploracionParaLaPropuesta } from "./servidor";

const VENTANA_DIAS = 180;
const DIA = 24 * 60 * 60 * 1000;

const esDeCustomerSuccess = (hubspotPipelineId: string | null) => {
  const tipo = pipelineKeyDeProyecto(hubspotPipelineId);
  return tipo !== "development" && tipo !== "web";
};

/** El id de la exploración que le corresponde a un proyecto, o null. */
export async function exploracionDelProyecto(projectId: string): Promise<string | null> {
  if (!modeloDisponible(prisma.exploracionDeVenta)) return null;
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: { clientId: true, hubspotDealId: true, hubspotPipelineId: true, createdAt: true },
  });
  if (!p || !esDeCustomerSuccess(p.hubspotPipelineId)) return null;

  if (p.hubspotDealId) {
    const bc = await prisma.businessCase.findFirst({
      where: { clientId: p.clientId, hubspotDealId: p.hubspotDealId, exploracionId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { exploracionId: true },
    });
    if (bc?.exploracionId) return bc.exploracionId;
  }

  // Sin enlace por el negocio: la viva. Una archivada se abandonó (o ya tuvo su propuesta, que va arriba).
  const exp = await prisma.exploracionDeVenta.findFirst({
    where: { clientId: p.clientId, archivadaEn: null },
    orderBy: { updatedAt: "desc" },
    select: { id: true, createdAt: true, updatedAt: true },
  });
  if (!exp) return null;
  const nacio = p.createdAt.getTime();
  if (nacio < exp.createdAt.getTime() || nacio > exp.updatedAt.getTime() + VENTANA_DIAS * DIA) return null;
  /* ¿Hubo otro proyecto de Customer Success ANTES de éste en la ventana? Cualquiera que haya
     existido, activo o cerrado: un ciclo cerrado igual fue el primero. Solo queda afuera el
     contenedor de «Información del cliente» (no es un proyecto; su tipo sale nulo y contaría). */
  const antes = await prisma.project.findMany({
    where: {
      clientId: p.clientId,
      id: { not: projectId },
      createdAt: { gte: exp.createdAt, lt: p.createdAt },
      OR: [{ serviceType: null }, { serviceType: { not: SENTINEL_SERVICE_TYPE } }],
    },
    select: { hubspotPipelineId: true },
  });
  return antes.some((o) => esDeCustomerSuccess(o.hubspotPipelineId)) ? null : exp.id;
}

/** El bloque para el contexto del handoff del proyecto, o null si no le corresponde ninguna. */
export async function exploracionParaElHandoff(projectId: string): Promise<{ exploracionId: string; bloque: string } | null> {
  const exploracionId = await exploracionDelProyecto(projectId);
  if (!exploracionId) return null;
  const datos = await exploracionParaLaPropuesta(exploracionId);
  if (!datos) return null;
  return { exploracionId, bloque: bloqueParaElHandoff(datos) };
}

/**
 * Los proyectos de la empresa cuyo handoff recibe esta exploración (para el paso «Traspaso» del
 * lienzo). Solo los que nacieron después de que empezó: los de antes nunca la reciben.
 */
export async function proyectosQueLaReciben(exploracionId: string, clientId: string, desde: Date) {
  const candidatos = await prisma.project.findMany({
    where: proyectoClasificableWhere({ clientId, createdAt: { gte: desde } }),
    orderBy: { createdAt: "asc" },
    take: 10,
    select: { id: true, name: true, clientId: true },
  });
  const reciben: { id: string; nombre: string; clientId: string }[] = [];
  for (const p of candidatos) {
    if ((await exploracionDelProyecto(p.id)) === exploracionId) reciben.push({ id: p.id, nombre: p.name, clientId: p.clientId });
  }
  return reciben;
}
