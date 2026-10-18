/**
 * lib/external/ciclos-view.ts
 *
 * CHOKEPOINT de seguridad de la RUTA DEL SERVICIO externa (SmartLoop, docs/smartloop-plan.md, etapa 7). Único lugar
 * donde un acceso se resuelve a los ciclos de un servicio recurrente. Corre SIEMPRE server-side.
 *
 * Los mismos checks que sus hermanos, en CADA lectura:
 *   1. credencial → acceso ACTIVO no revocado, y que sea EL que nombra la dirección (`resolveActiveAccess`, que además
 *      exige que el proyecto admita mirones de afuera).
 *   2. `ciclosPublishedAt != null`: el acceso es por proyecto y se comparte con las otras superficies; sin el flag el
 *      cliente vería una ruta que nadie le subió. Dejar de compartir corta en el render siguiente.
 *
 * Sirve la FOTO congelada (`Project.ciclosPublicados`), no lo vivo: es lo que se le mostró. Y la lee con `leerRuta`,
 * que falla cerrado —una foto que no se entiende no se muestra— y vuelve a sacar los textos con montos.
 */
import { prisma } from "@/lib/db/prisma";
import { resolveActiveAccess, touchAccess } from "./access";
import { leerRuta, type RutaDelServicio } from "@/lib/servicios/ruta-del-servicio";

export interface CiclosViewData {
  projectName: string;
  clientName: string;
  clientLogoUrl: string | null;
  clientLogoScale: number | null;
  ruta: RutaDelServicio;
}

export async function getCiclosForToken(credencial: string, accesoId: string): Promise<CiclosViewData | null> {
  // Acceso activo Y que sea el que nombra la dirección: una credencial de otro proyecto → null.
  const access = await resolveActiveAccess(credencial, accesoId);
  if (!access) return null;
  if (!access.project.ciclosPublishedAt) return null;

  const fila = await prisma.project.findUnique({ where: { id: access.project.id }, select: { ciclosPublicados: true } });
  const ruta = leerRuta(fila?.ciclosPublicados ?? null);
  if (!ruta || ruta.ciclos.length === 0) return null;

  await touchAccess(access.accessId);

  return {
    projectName: access.project.name,
    clientName: access.project.client.name,
    clientLogoUrl: access.project.client.logoUrl,
    clientLogoScale: access.project.client.logoScale,
    ruta,
  };
}
