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
import { proyectoDeCarteraWhere } from "@/lib/projects/scope";

/** El dueño en HubSpot del proyecto principal de la reunión, en minúsculas. */
export async function cseDelProyecto(projectId: string | null): Promise<string | null> {
  if (!projectId) return null;
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { hubspotOwnerEmail: true } });
  return p?.hubspotOwnerEmail?.trim().toLowerCase() || null;
}

/**
 * El CSE de la cuenta: quien es dueño de más proyectos de la CARTERA del cliente (activos, sin el contenedor ni los
 * internos: `proyectoDeCarteraWhere`, el mismo criterio de Éxito del cliente). Con empate, el primero por correo.
 */
export async function cseDeLaCuenta(clientId: string): Promise<string | null> {
  const proyectos = await prisma.project.findMany({ where: proyectoDeCarteraWhere({ clientId, hubspotOwnerEmail: { not: null } }), select: { hubspotOwnerEmail: true } });
  const cuenta = new Map<string, number>();
  for (const p of proyectos) {
    const e = p.hubspotOwnerEmail?.trim().toLowerCase();
    if (e) cuenta.set(e, (cuenta.get(e) ?? 0) + 1);
  }
  const orden = [...cuenta.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return orden[0]?.[0] ?? null;
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
