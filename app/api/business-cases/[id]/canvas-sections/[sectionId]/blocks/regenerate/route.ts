/**
 * POST /api/business-cases/[id]/canvas-sections/[sectionId]/blocks/regenerate
 *
 * Edición por IA de UNA sección estructurada: toma { blockId, instruction, base? }
 * y DEVUELVE el `data` regenerado de esa sección — NO escribe (el guardado lo hace
 * el front por el PUT). Wrapper de guard sobre el núcleo compartido
 * `lib/canvas/regenerate-section` (mismo que el regenerate del Kickoff); lo único
 * propio de BC es la resolución de brief/template/idioma. NO exige canvas "Kickoff".
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { parseRegenBody, regenerateTypedSection } from "@/lib/canvas/regenerate-section";
import { specToDiagram, relacionToDiagram } from "@/lib/flowchart/spec-to-diagram";
import { briefsByKeyFrom } from "@/lib/business-cases/section-briefs";
import { resolveCaseTypeFor } from "@/lib/business-cases/resolve-template";
import { templateDefsByKey, findDefAcrossTemplates } from "@/components/landing/configs/templates.defs";

type Params = Promise<{ id: string; sectionId: string }>;

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { id, sectionId } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const parsed = parseRegenBody(await req.json().catch(() => ({})));
  if (!parsed) {
    return NextResponse.json({ error: "blockId e instruction requeridos" }, { status: 400 });
  }
  const { blockId, instruction, base } = parsed;

  // Bloque + key de su sección + pertenencia al business case (+ briefs del canvas).
  const block = await prisma.canvasBlock.findFirst({
    where: { id: blockId, sectionId },
    select: {
      data: true,
      section: {
        select: {
          key: true,
          canvas: {
            select: {
              id: true,
              businessCaseId: true,
              sections: true,
              businessCase: { select: { id: true, caseType: true, caseSubtype: true, language: true } },
            },
          },
        },
      },
    },
  });
  if (!block || block.section.canvas.businessCaseId !== id) {
    return NextResponse.json({ error: "Bloque no encontrado" }, { status: 404 });
  }

  const current = base ? base.data : block.data;
  // Guía efectiva: desde la Plantilla (v0) del BC; fallback al canvas propio (legacy).
  const template = await prisma.projectCanvas.findFirst({
    where: { businessCaseId: id, version: 0 },
    select: { sections: true },
  });
  const briefSource = template?.sections ?? block.section.canvas.sections;
  const brief = briefsByKeyFrom(briefSource)[block.section.key];
  const resolved = block.section.canvas.businessCase
    ? resolveCaseTypeFor(block.section.canvas.businessCase, template?.sections)
    : null;
  // La def resuelta acá es la MISMA que regenerateSectionData resolvía adentro
  // (templateDefsByKey ?? fallback cross-template, load-bearing para keys de
  // canvases viejos). El gate de secciones determinísticas (agentGenerated:false,
  // p.ej. casos_de_uso — reescribirlas alteraría precios del catálogo que se
  // publican congelados) vive en el núcleo compartido, con el copy propio de BC.
  const def =
    templateDefsByKey(resolved?.templateId)[block.section.key] ??
    findDefAcrossTemplates(block.section.key);
  // Idioma de la propuesta: PRIMERO `businessCase.language` (fuente de verdad
  // persistente); si es null (casos viejos pre-migración a este campo), cae al
  // `__lang` (key no-schema) del hero de ESTE canvas, como se leía antes.
  const bcLang = block.section.canvas.businessCase?.language ?? null;
  let lang = typeof bcLang === "string" && bcLang.trim() ? bcLang.trim().toLowerCase() : null;
  if (!lang) {
    const hero = await prisma.canvasSection.findFirst({
      where: { canvasId: block.section.canvas.id, key: "hero" },
      select: { blocks: { orderBy: { order: "asc" }, take: 1, select: { data: true } } },
    });
    const heroData = hero?.blocks[0]?.data;
    const rawLang =
      heroData && typeof heroData === "object" && !Array.isArray(heroData)
        ? (heroData as Record<string, unknown>).__lang
        : null;
    lang = typeof rawLang === "string" && rawLang.trim() ? rawLang.trim().toLowerCase() : null;
  }

  const result = await regenerateTypedSection(def, current, instruction, {
    brief,
    lang,
    curatedMessage: "Esta sección se llena desde el catálogo y se edita a mano (sin IA).",
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  // Sección de DIAGRAMA: la spec cambió → recalcular el grafo. Las posiciones
  // manuales de ESTA sección se descartan a propósito (un layout viejo sobre
  // nodos nuevos mentiría); preserveNonSchemaKeys habría arrastrado el stale.
  const data = result.data;
  if (def?.sectionType === "diagram" && data && typeof data === "object" && !Array.isArray(data)) {
    const d = data as Record<string, unknown>;
    const conv =
      Array.isArray(d.objetos) || Array.isArray(d.asociaciones)
        ? relacionToDiagram(d)
        : specToDiagram(d);
    d.diagram = conv.diagram;
  }
  return NextResponse.json({ data });
}
