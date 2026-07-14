/**
 * lib/external/desarrollo-view.ts
 *
 * CHOKEPOINT de seguridad del canvas DESARROLLO (requerimiento técnico) externo.
 * Único lugar donde un token de acceso externo se resuelve a los datos del
 * requerimiento. Corre SIEMPRE server-side (app/external/desarrollo/page.tsx).
 *
 * Modelo de seguridad (igual que kickoff-view, DOS checks en CADA lectura):
 *   1. token → acceso ACTIVO no revocado (resolveActiveAccess).
 *   2. `desarrolloPublishedAt != null` — check EXPLÍCITO acá. El token de acceso es
 *      POR PROYECTO y SE COMPARTE con el CLIENTE (para el kickoff), así que sin este
 *      flag el cliente vería el requerimiento técnico interno. Despublicar corta al
 *      instante en el render siguiente.
 * DIFERENCIA con el kickoff: NO hay staging (publishedSnapshot). Se lee el canvas VIVO
 * (bloques CONFIRMED) — un requerimiento técnico para un dev no necesita el
 * "congelar hasta subir" del cliente; lo que ve el dev es lo último editado/generado.
 * Shape LIMPIO: solo { key, blocks{blockType,content,data} } — sin source/status.
 */
import { prisma } from "@/lib/db/prisma";
import { resolveActiveAccess, touchAccess } from "./access";
import { getBrandLogos } from "./smarteam-logo";
import type { DesarrolloSectionRow } from "@/components/canvas/desarrollo-landing-adapter";

export interface DesarrolloViewData {
  projectName: string;
  clientName: string;
  clientLogoUrl: string | null;
  smarteamLogoUrl: string | null;
  brandLogos: Record<string, string>;
  rows: DesarrolloSectionRow[];
}

export async function getDesarrolloForToken(token: string): Promise<DesarrolloViewData | null> {
  // 1-2. token → acceso activo → proyecto (forma + existencia + revokedAt).
  const access = await resolveActiveAccess(token);
  if (!access) return null;

  // Check de superficie EXPLÍCITO: requerimiento compartido, en CADA lectura.
  if (!access.project.desarrolloPublishedAt) return null;

  const projectId = access.project.id;

  const canvas = await prisma.projectCanvas.findFirst({
    where: { projectId, name: "Desarrollo" },
    select: { id: true },
  });
  if (!canvas) return null;

  const sections = await prisma.canvasSection.findMany({
    where: { canvasId: canvas.id },
    orderBy: { order: "asc" },
    select: {
      key: true,
      titleOverride: true,
      eyebrowOverride: true,
      blocks: {
        where: { status: "CONFIRMED" },
        orderBy: { order: "asc" },
        select: { blockType: true, content: true, data: true },
      },
    },
  });

  await touchAccess(access.accessId);

  const logos = await getBrandLogos();
  const brandLogos: Record<string, string> = Object.fromEntries(
    Object.entries(logos).filter((e): e is [string, string] => typeof e[1] === "string" && !!e[1]),
  );

  return {
    projectName: access.project.name,
    clientName: access.project.client.name,
    clientLogoUrl: access.project.client.logoUrl,
    smarteamLogoUrl: logos.smarteam ?? null,
    brandLogos,
    rows: sections.map((s) => ({
      key: s.key,
      titleOverride: s.titleOverride,
      eyebrowOverride: s.eyebrowOverride,
      blocks: s.blocks,
    })),
  };
}
