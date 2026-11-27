/**
 * lib/comunicaciones/de-la-empresa-server.ts — las comunicaciones de HubSpot que esperan unidad (2026-11-26). Solo lectura.
 *
 * Con la empresa arriba de sus unidades (DECISIONS «La empresa arriba de sus unidades»), lo que la copia no pudo repartir
 * queda con `clientId` = la empresa: «Unidades de negocio» cuenta cuántas, y el simulacro de scripts/crear-empresa-de-unidades.ts
 * lee su asunto y su remitente para decir adónde iría cada una. Nada de esto alimenta a un agente.
 */
import { prisma } from "@/lib/db/prisma";

/** Cuántas comunicaciones vigentes tiene esta ficha. */
export async function cuantasComunicacionesVigentes(clientId: string): Promise<number> {
  return prisma.comunicacionDeHubspot.count({ where: { clientId, vigente: true } });
}

/** El asunto y el remitente de las vigentes de esta ficha: lo que se usa para repartirlas entre unidades. */
export async function comunicacionesParaRepartir(clientId: string): Promise<{ asunto: string | null; deEmail: string | null }[]> {
  return prisma.comunicacionDeHubspot.findMany({ where: { clientId, vigente: true }, select: { asunto: true, deEmail: true } });
}

/**
 * Deshacer una empresa (scripts/crear-empresa-de-unidades.ts --deshacer): las comunicaciones de estas fichas vuelven a la
 * vieja principal. El único escritor de afuera de la copia, y solo para eso.
 */
export async function devolverComunicaciones(db: Pick<typeof prisma, "comunicacionDeHubspot">, de: readonly string[], a: string): Promise<number> {
  const r = await db.comunicacionDeHubspot.updateMany({ where: { clientId: { in: [...de] } }, data: { clientId: a } });
  return r.count;
}
