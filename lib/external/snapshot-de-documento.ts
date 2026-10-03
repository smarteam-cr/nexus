/**
 * lib/external/snapshot-de-documento.ts — la vista de un documento compartido por SNAPSHOT (2026-10-02):
 * hoy la PLANIFICACIÓN, mismo molde que `entrega-view.ts`. (El diagnóstico NO: muestra su versión
 * presentada, ver diagnostico-view.ts; de acá solo reusa la forma de los datos.)
 *
 * ⚠ NO resuelve el acceso ni mira el flag de publicación: eso lo hace CADA chokepoint, a la vista,
 * antes de llamar acá (`resolveActiveAccess(credencial, accesoId)` + su `…PublishedAt`). Este
 * módulo solo arma la vista desde un acceso que ya pasó los dos checks.
 *
 * Sirve el SNAPSHOT congelado al publicar (lo que se entregó, no lo último que se editó), y filtra
 * lo OCULTO contra el Json VIVO del canvas: ocultar después de publicar tiene efecto inmediato.
 */
import { prisma } from "@/lib/db/prisma";
import { touchAccess, type ActiveAccess } from "./access";
import { getBrandLogos } from "./smarteam-logo";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { hiddenKeysFrom } from "@/lib/business-cases/section-briefs";
import type { LandingSectionRow } from "@/components/landing/build-landing";

export interface DocumentoPublicadoViewData {
  projectName: string;
  clientName: string;
  clientLogoUrl: string | null;
  clientLogoDarkUrl: string | null;
  clientLogoScale: number | null;
  smarteamLogoUrl: string | null;
  brandLogos: Record<string, string>;
  publishedAt: string | null;
  rows: LandingSectionRow[];
}

interface SnapshotSection {
  key: string;
  titleOverride: string | null;
  eyebrowOverride: string | null;
  blocks: Array<{ blockType: string; content: string | null; data: unknown }>;
}

export async function vistaDelSnapshot(access: ActiveAccess, slug: string): Promise<DocumentoPublicadoViewData | null> {
  const canvas = await prisma.projectCanvas.findFirst({
    where: { projectId: access.project.id, ...canvasOf(slug) },
    select: { publishedSnapshot: true, publishedSnapshotAt: true, sections: true },
  });
  if (!canvas?.publishedSnapshot) return null;

  const snap = canvas.publishedSnapshot as unknown as { sections?: SnapshotSection[] } | null;
  const secciones = Array.isArray(snap?.sections) ? snap.sections : [];
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
        blocks: s.blocks as LandingSectionRow["blocks"],
      })),
  };
}
