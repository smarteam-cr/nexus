/**
 * lib/cs/adopcion-del-cse-server.ts — ¿esta persona es CSE de la cuenta? (2026-10-07). SERVIDOR.
 *
 * El que abre la pestaña Adopción de Éxito del cliente sin ser la CSL ni dirección: el encargado en
 * HubSpot de algún proyecto de Customer Success de la cuenta, el mismo dato con el que `lib/auth/access.ts`
 * le da la cuenta. Lo que ve está en ./adopcion-del-cse.ts.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { PROYECTO_DE_PIPELINE_CS_WHERE } from "@/lib/projects/scope";

export async function esCseDeLaCuenta(clientId: string, email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const p = await prisma.project.findFirst({
    where: { clientId, hubspotOwnerEmail: { equals: email, mode: "insensitive" }, ...PROYECTO_DE_PIPELINE_CS_WHERE },
    select: { id: true },
  });
  return !!p;
}
