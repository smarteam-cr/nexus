/**
 * lib/external/documento-de-la-empresa-view.ts — CHOKEPOINT de la vista de un documento de la EMPRESA (R3 etapa 3,
 * 2026-10-27). Único lugar donde el token de `/external/documento/[token]` se resuelve a contenido. SERVIDOR.
 *
 * Fail-closed, en CADA render (la página es `force-dynamic`):
 *   1. el token tiene la forma de uno (64 hex) y existe un `AccesoAlDocumento` con él, sin revocar;
 *   2. el documento es de la MISMA empresa que el enlace, sin proyecto ni propuesta (lo vigila también INV64);
 *   3. el documento tiene una foto publicada.
 * Sirve la FOTO, con lo oculto filtrado contra el documento vivo (ocultar después de compartir tiene efecto inmediato), y
 * nada de lo interno: ni quién lo escribió, ni las fuentes, ni el estado de los bloques.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { hiddenKeysFrom } from "@/lib/business-cases/section-briefs";
import type { LandingSectionRow } from "@/components/landing/build-landing";
import { getBrandLogos } from "./smarteam-logo";

export interface DocumentoDeLaEmpresaViewData {
  pieza: string;
  clientName: string;
  clientLogoUrl: string | null;
  clientLogoDarkUrl: string | null;
  clientLogoScale: number | null;
  smarteamLogoUrl: string | null;
  brandLogos: Record<string, string>;
  publishedAt: string | null;
  rows: LandingSectionRow[];
}

const TOKEN = /^[0-9a-f]{64}$/;

interface SeccionDeLaFoto {
  key: string;
  titleOverride: string | null;
  eyebrowOverride: string | null;
  blocks: Array<{ blockType: string; content: string | null; data: unknown }>;
}

export async function documentoDeLaEmpresaParaElToken(token: string): Promise<DocumentoDeLaEmpresaViewData | null> {
  if (!TOKEN.test(token)) return null;
  const acceso = await prisma.accesoAlDocumento.findUnique({
    where: { accessToken: token },
    select: {
      id: true,
      clientId: true,
      revokedAt: true,
      canvas: { select: { clientId: true, projectId: true, businessCaseId: true, slug: true, sections: true, publishedSnapshot: true, publishedSnapshotAt: true } },
      client: { select: { name: true, logoUrl: true, logoDarkUrl: true, logoScale: true } },
    },
  });
  if (!acceso || acceso.revokedAt) return null;
  const c = acceso.canvas;
  if (!c || c.clientId !== acceso.clientId || c.projectId !== null || c.businessCaseId !== null) return null;
  const foto = c.publishedSnapshot as unknown as { sections?: SeccionDeLaFoto[] } | null;
  if (!foto || !Array.isArray(foto.sections)) return null;
  const ocultas = hiddenKeysFrom(c.sections);

  await prisma.accesoAlDocumento.update({ where: { id: acceso.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  const logos = await getBrandLogos();
  const brandLogos = Object.fromEntries(Object.entries(logos).filter((e): e is [string, string] => typeof e[1] === "string" && !!e[1]));
  return {
    pieza: c.slug ?? "",
    clientName: acceso.client.name,
    clientLogoUrl: acceso.client.logoUrl,
    clientLogoDarkUrl: acceso.client.logoDarkUrl,
    clientLogoScale: acceso.client.logoScale,
    smarteamLogoUrl: logos.smarteam ?? null,
    brandLogos,
    publishedAt: c.publishedSnapshotAt?.toISOString() ?? null,
    rows: foto.sections
      .filter((s) => s && !ocultas.has(s.key) && Array.isArray(s.blocks) && s.blocks.length > 0)
      .map((s) => ({
        key: s.key,
        titleOverride: s.titleOverride ?? null,
        eyebrowOverride: s.eyebrowOverride ?? null,
        blocks: s.blocks.map((b) => ({ blockType: b.blockType, content: b.content, data: b.data })) as LandingSectionRow["blocks"],
      })),
  };
}
