/**
 * lib/external/entrega-view.ts
 *
 * CHOKEPOINT de seguridad del documento de ENTREGA externo. Único lugar donde un token de
 * acceso se resuelve al contenido del cierre. Corre SIEMPRE server-side.
 *
 * DOS checks en CADA lectura, igual que sus tres hermanos:
 *   1. token → acceso ACTIVO no revocado (`resolveActiveAccess`, que además exige que el
 *      proyecto admita mirones de afuera).
 *   2. `entregaPublishedAt != null` — explícito acá. El token es POR PROYECTO y se comparte
 *      para las otras superficies, así que sin este flag el cliente vería un borrador de su
 *      propio cierre. Despublicar corta en el render siguiente.
 *
 * ── SIRVE EL SNAPSHOT, NO LO VIVO ────────────────────────────────────────────
 * Es la diferencia con `desarrollo-view`: la entrega es un acto con fecha. Lo que el cliente
 * abre tiene que ser lo que se le entregó, no lo último que alguien editó. Si el canvas se
 * siguió trabajando después, eso no cambia el papel — cambia la próxima publicación.
 *
 * ⚠ Pero lo OCULTO se filtra contra el estado VIVO, no contra el congelado: el snapshot se
 * guarda crudo justamente para que ocultar una sección DESPUÉS de publicar tenga efecto
 * inmediato. Si el CSE tapa algo sensible, no puede tener que re-publicar para que deje de
 * verse.
 */
import { prisma } from "@/lib/db/prisma";
import { resolveActiveAccess, touchAccess } from "./access";
import { getBrandLogos } from "./smarteam-logo";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { hiddenKeysFrom } from "@/lib/business-cases/section-briefs";
import type { EntregaSectionRow } from "@/components/canvas/entrega-landing-adapter";

export interface EntregaViewData {
  projectName: string;
  clientName: string;
  clientLogoUrl: string | null;
  clientLogoDarkUrl: string | null;
  clientLogoScale: number | null;
  smarteamLogoUrl: string | null;
  brandLogos: Record<string, string>;
  /** Cuándo se congeló lo que el cliente está leyendo. HOY no la pinta nadie (decisión de
   *  Elías, 2026-08-13: fuera de la vista del cliente; y el panel del equipo solo muestra el
   *  booleano «publicado»). Viaja igual para que volver a mostrarla sea una línea de JSX. */
  publishedAt: string | null;
  rows: EntregaSectionRow[];
}

interface SnapshotSection {
  key: string;
  titleOverride: string | null;
  eyebrowOverride: string | null;
  blocks: Array<{ blockType: string; content: string | null; data: unknown }>;
}

export async function getEntregaForToken(token: string): Promise<EntregaViewData | null> {
  const access = await resolveActiveAccess(token);
  if (!access) return null;
  if (!access.project.entregaPublishedAt) return null;

  const canvas = await prisma.projectCanvas.findFirst({
    where: { projectId: access.project.id, ...canvasOf("delivery") },
    select: { publishedSnapshot: true, publishedSnapshotAt: true, sections: true },
  });
  if (!canvas?.publishedSnapshot) return null;

  const snap = canvas.publishedSnapshot as unknown as { sections?: SnapshotSection[] } | null;
  const secciones = Array.isArray(snap?.sections) ? snap.sections : [];

  // Lo oculto se resuelve contra el Json VIVO del canvas (ver el docblock).
  const ocultas = hiddenKeysFrom(canvas.sections);

  await touchAccess(access.accessId);

  const logos = await getBrandLogos();
  const brandLogos: Record<string, string> = Object.fromEntries(
    Object.entries(logos).filter((e): e is [string, string] => typeof e[1] === "string" && !!e[1]),
  );

  return {
    projectName: access.project.name,
    clientName: access.project.client.name,
    clientLogoUrl: access.project.client.logoUrl,
    clientLogoDarkUrl: access.project.client.logoDarkUrl,
    clientLogoScale: access.project.client.logoScale,
    smarteamLogoUrl: logos.smarteam ?? null,
    brandLogos,
    publishedAt: canvas.publishedSnapshotAt?.toISOString() ?? null,
    rows: secciones
      .filter((s) => !ocultas.has(s.key) && s.blocks.length > 0)
      .map((s) => ({
        key: s.key,
        titleOverride: s.titleOverride ?? null,
        eyebrowOverride: s.eyebrowOverride ?? null,
        blocks: s.blocks as EntregaSectionRow["blocks"],
      })),
  };
}
