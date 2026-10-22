/**
 * lib/business-cases/primera-propuesta-server.ts — la PRIMERA propuesta de un trato, contra la que se mide el descuento
 * (2026-10-21, DECISIONS «El modelo de comisiones cerrado con Marco»). SERVER-ONLY.
 *
 * La primera es la versión 1 (la de número más bajo después del v0) de la propuesta más vieja con el mismo
 * `hubspotDealId`; sin trato, la de la misma propuesta. Se devuelve el `data` de su sección de Inversión tal como está
 * hoy: si alguien editó esa versión en el lugar, se ve lo editado.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { INVERSION_SECTION_KEY } from "@/lib/landing/inversion";

export interface PrimeraPropuesta {
  businessCaseId: string;
  canvasId: string;
  nombre: string;
  version: number;
  /** El `data` del bloque de Inversión de esa versión (null si no tiene). */
  inversion: unknown;
}

const SELECT_VERSION = {
  id: true,
  businessCaseId: true,
  version: true,
  canvasSections: {
    where: { key: INVERSION_SECTION_KEY },
    select: { blocks: { orderBy: { order: "asc" as const }, select: { data: true }, take: 1 } },
  },
} as const;

/** Las primeras propuestas de varios tratos de HubSpot, por trato. */
export async function primerasPropuestasDeTratos(dealIds: readonly string[]): Promise<Map<string, PrimeraPropuesta>> {
  const fuera = new Map<string, PrimeraPropuesta>();
  if (!dealIds.length) return fuera;
  const propuestas = await prisma.businessCase.findMany({
    where: { hubspotDealId: { in: [...dealIds] } },
    select: { id: true, name: true, hubspotDealId: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const masVieja = new Map<string, (typeof propuestas)[number]>();
  for (const p of propuestas) if (!masVieja.has(p.hubspotDealId!)) masVieja.set(p.hubspotDealId!, p);
  if (!masVieja.size) return fuera;
  const versiones = await prisma.projectCanvas.findMany({
    where: { businessCaseId: { in: [...masVieja.values()].map((p) => p.id) }, version: { gt: 0 } },
    select: SELECT_VERSION,
    orderBy: { version: "asc" },
  });
  for (const [deal, p] of masVieja) {
    const v = versiones.find((x) => x.businessCaseId === p.id);
    if (v) fuera.set(deal, { businessCaseId: p.id, canvasId: v.id, nombre: p.name, version: v.version, inversion: v.canvasSections[0]?.blocks[0]?.data ?? null });
  }
  return fuera;
}

/** La primera propuesta del trato de una propuesta; sin trato, su propia primera versión. */
export async function primeraPropuestaDe(businessCaseId: string): Promise<PrimeraPropuesta | null> {
  const bc = await prisma.businessCase.findUnique({ where: { id: businessCaseId }, select: { id: true, name: true, hubspotDealId: true } });
  if (!bc) return null;
  if (bc.hubspotDealId) {
    const delTrato = (await primerasPropuestasDeTratos([bc.hubspotDealId])).get(bc.hubspotDealId);
    if (delTrato) return delTrato;
  }
  const v = await prisma.projectCanvas.findFirst({ where: { businessCaseId: bc.id, version: { gt: 0 } }, select: SELECT_VERSION, orderBy: { version: "asc" } });
  return v ? { businessCaseId: bc.id, canvasId: v.id, nombre: bc.name, version: v.version, inversion: v.canvasSections[0]?.blocks[0]?.data ?? null } : null;
}
