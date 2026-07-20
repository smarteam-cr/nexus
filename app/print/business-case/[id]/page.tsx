/**
 * /print/business-case/[id]
 *
 * Página de IMPRESIÓN interna del Business Case — vive fuera de AppShell (mismo
 * principio que app/print/canvas/[clientId]/[canvasId]), pensada para que Puppeteer
 * (export-pdf/route.ts) la capture y la convierta en PDF. Renderiza el motor de
 * landing (LandingView mode="read") sobre el contenido VIVO del canvas activo — no
 * el publishedSnapshot — así el vendedor puede descargar el PDF sin publicar antes.
 *
 * Auth: token de un solo uso (?pdfToken=, PrintJobToken) para la navegación interna
 * de Puppeteer; sin token cae al gate normal (requireInternalUser + rol de ventas),
 * lo que permite abrir la URL a mano para revisar el layout antes de exportar.
 */
import { notFound, redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { prisma } from "@/lib/db/prisma";
import { consumePdfJobToken } from "@/lib/business-cases/pdf-job-token";
import { resolveCaseTypeFor } from "@/lib/business-cases/resolve-template";
import { parseSectionEntries } from "@/lib/business-cases/section-briefs";
import { landingConfigFor } from "@/components/landing/configs/templates";
import { getBrandLogos, brandLogoMap } from "@/lib/external/smarteam-logo";
import LandingView from "@/components/landing/LandingView";
import PdfReadySignal from "./PdfReadySignal";

export const dynamic = "force-dynamic";

export default async function BusinessCasePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pdfToken?: string; canvasId?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  let canvasIdFromToken: string | null = null;
  if (sp.pdfToken) {
    const result = await consumePdfJobToken(sp.pdfToken, id);
    if (!result.ok) notFound();
    canvasIdFromToken = result.canvasId;
  } else {
    const ctx = await requireInternalUser().catch(() => null);
    if (!ctx || !(await can(ctx.teamMember, "ventas", "read"))) redirect("/");
  }

  const bc = await prisma.businessCase.findUnique({
    where: { id },
    select: {
      id: true,
      caseType: true,
      caseSubtype: true,
      language: true,
      client: { select: { name: true, logoUrl: true } },
    },
  });
  if (!bc) notFound();

  // __meta del v0 (mismo patrón que app/business-cases/[id]/page.tsx).
  const v0 = await prisma.projectCanvas.findFirst({
    where: { businessCaseId: id, version: 0 },
    select: { sections: true },
  });
  const resolved = resolveCaseTypeFor(bc, v0?.sections);

  // canvasId: query param explícito (debug manual) > el que trae el token > el activo.
  const requestedCanvasId = sp.canvasId || canvasIdFromToken || null;
  const canvas = requestedCanvasId
    ? await prisma.projectCanvas.findUnique({
        where: { id: requestedCanvasId },
        select: { id: true, businessCaseId: true, sections: true },
      })
    : await prisma.projectCanvas.findFirst({
        where: { businessCaseId: id, isActive: true },
        select: { id: true, businessCaseId: true, sections: true },
      });
  // Anti-IDOR: un canvasId de OTRO business case no debe filtrar contenido ajeno.
  if (!canvas || canvas.businessCaseId !== id) notFound();

  const hiddenByKey = new Map<string, boolean>();
  for (const e of parseSectionEntries(canvas.sections)) {
    hiddenByKey.set(e.key, e.hidden === true);
  }

  const sections = await prisma.canvasSection.findMany({
    where: { canvasId: canvas.id },
    orderBy: { order: "asc" },
    select: {
      key: true,
      titleOverride: true,
      eyebrowOverride: true,
      blocks: { orderBy: { order: "asc" }, take: 1, select: { data: true } },
    },
  });

  // Idioma: `language` persistente primero; fallback al `__lang` no-schema del hero
  // (mismo patrón dual-read que BusinessCaseWorkspace.tsx's proposalLang).
  const heroData = sections.find((s) => s.key === "hero")?.blocks[0]?.data as
    | { __lang?: string }
    | null
    | undefined;
  const lang = bc.language ?? heroData?.__lang ?? null;

  const brandLogos = await getBrandLogos();

  return (
    <div className="stl-pdf-mode" style={{ background: "#fff" }}>
      <PdfReadySignal />
      <LandingView
        config={landingConfigFor(resolved.templateId)}
        ctx={{
          clientName: bc.client.name,
          lang,
          pdfMode: true, // secciones con piezas async (diagramas) → variante estática
          clientLogoUrl: bc.client.logoUrl,
          smarteamLogoUrl: brandLogos.smarteam,
          brandLogos: brandLogoMap(brandLogos),
        }}
        sections={sections.map((s) => ({
          key: s.key,
          data: s.blocks[0]?.data ?? null,
          titleOverride: s.titleOverride,
          eyebrowOverride: s.eyebrowOverride,
          hidden: hiddenByKey.get(s.key) ?? false,
        }))}
        mode="read"
      />
    </div>
  );
}
