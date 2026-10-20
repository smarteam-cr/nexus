/**
 * lib/lecturas/personas.ts — a quién le llega el seguimiento de lo que prometió el cliente (memoria de la cuenta, etapa 2).
 * SERVIDOR. Solo lee: los correos; la regla de a quién va cada compromiso vive en lib/tareas/seguimiento.ts (pura).
 *
 *   · el CSE del proyecto principal: el dueño del proyecto en HubSpot (`Project.hubspotOwnerEmail`);
 *   · sin proyecto principal, el CSE de la cuenta: el que más proyectos activos lleva en ella;
 *   · en un prospecto, quien lleva la preventa viva (`ExploracionDeVenta.responsableEmail`, `DE_LA_PREVENTA`).
 * Que sea del equipo ACTIVO lo decide `armarPropuestasDeSeguimiento` con la lista de miembros activos.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { DE_LA_PREVENTA } from "@/lib/exploraciones/marco";
import { encargadoDe } from "@/lib/cuentas/encargado-server";

/** El dueño en HubSpot del proyecto principal de la reunión, en minúsculas. */
export async function cseDelProyecto(projectId: string | null): Promise<string | null> {
  if (!projectId) return null;
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { hubspotOwnerEmail: true } });
  return p?.hubspotOwnerEmail?.trim().toLowerCase() || null;
}

/**
 * El CSE de la cuenta, con la regla única (lib/cuentas/encargado.ts): quien lleva más proyectos de CS activos, sin los
 * de baja. Hasta el 2026-10-19 contaba también los de Desarrollo (la cartera) y a quien ya no estaba.
 */
export async function cseDeLaCuenta(clientId: string): Promise<string | null> {
  return (await encargadoDe(clientId)).email;
}

/**
 * Quién lleva el negocio de la cuenta en HubSpot (lo de venta o negociación es suyo, no del CSE — 2026-10-20): los
 * vendedores de sus negocios abiertos, el más nuevo primero, y el dueño de la empresa. Solo los correos; a cuál le llega
 * lo decide `duenoDelNegocio` (lib/tareas/seguimiento.ts, pura).
 */
export async function negocioDeLaCuenta(clientId: string): Promise<{ vendedores: string[]; duenoDeLaEmpresa: string | null }> {
  const [negocios, cliente] = await Promise.all([
    prisma.negocioAbierto.findMany({
      where: { clientId, abierto: true, vendedorId: { not: null } },
      select: { vendedor: { select: { email: true } } },
      orderBy: [{ creadoEnHubspot: { sort: "desc", nulls: "last" } }],
      take: 20,
    }),
    prisma.client.findUnique({ where: { id: clientId }, select: { hubspotOwnerEmail: true } }),
  ]);
  return {
    vendedores: negocios.flatMap((n) => (n.vendedor?.email ? [n.vendedor.email.trim().toLowerCase()] : [])),
    duenoDeLaEmpresa: cliente?.hubspotOwnerEmail?.trim().toLowerCase() || null,
  };
}

/**
 * Quien lleva la preventa viva de la empresa: `undefined` si no hay ninguna, `null` si la hay sin responsable. Solo
 * el correo: nada del contenido de la preventa.
 */
export async function responsableDeLaPreventaViva(clientId: string): Promise<string | null | undefined> {
  const viva = await prisma.exploracionDeVenta.findFirst({
    where: { clientId, archivadaEn: null, ...DE_LA_PREVENTA },
    select: { responsableEmail: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!viva) return undefined;
  return viva.responsableEmail?.trim().toLowerCase() || null;
}
