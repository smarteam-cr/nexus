/**
 * POST /api/business-cases/[id]/assist — assist de DOCUMENTO del Business Case.
 *
 * { canvasId, instruction } → runDocumentAssist con las secciones GENERABLES del
 * canvas activo (`agentGenerated !== false` — quedan fuera las determinísticas
 * casos_de_uso/equipo, que se llenan del catálogo/a mano), los briefs efectivos
 * (override del CSE en la Plantilla v0 ?? brief del spec — igual que el
 * regenerate) y el idioma del caso (misma cascada: `language` ?? `__lang` del
 * hero). Devuelve la PROPUESTA — NO escribe: el apply lo hace el workspace por
 * `upsertCardData`. Trazabilidad: AgentRun DONE/ERROR (agentSlug del BC).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { runDocumentAssist, type AssistSectionDef } from "@/lib/ai/assist";
import { DEFAULT_AGENT_INTRO } from "@/lib/business-cases/canvas-agent";
import { briefsByKeyFrom } from "@/lib/business-cases/section-briefs";
import { resolveCaseTypeFor } from "@/lib/business-cases/resolve-template";
import { templateById } from "@/components/landing/configs/templates.defs";

const bodySchema = z.object({
  canvasId: z.string().min(1),
  instruction: z.string().trim().min(4).max(2000),
});

type Params = Promise<{ id: string }>;

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "canvasId e instruction (4 a 2000 caracteres) requeridos" }, { status: 400 });
  }
  const { canvasId, instruction } = parsed.data;

  const canvas = await prisma.projectCanvas.findFirst({
    where: { id: canvasId, businessCaseId: id },
    select: {
      // `sections` (Json) = guías por sección del CSE; `canvasSections` = las
      // secciones RELACIONALES con sus bloques (dos campos distintos a propósito
      // — ver el comentario del schema en CanvasSection).
      sections: true,
      canvasSections: {
        orderBy: { order: "asc" },
        select: {
          key: true,
          blocks: { orderBy: { order: "asc" }, select: { blockType: true, data: true } },
        },
      },
      businessCase: { select: { id: true, clientId: true, caseType: true, caseSubtype: true, language: true } },
    },
  });
  if (!canvas?.businessCase) return NextResponse.json({ error: "Canvas no encontrado" }, { status: 404 });

  // Template + briefs efectivos: MISMA resolución que blocks/regenerate (Plantilla
  // v0 como fuente de briefs/meta; fallback al canvas propio para casos legacy).
  const template = await prisma.projectCanvas.findFirst({
    where: { businessCaseId: id, version: 0 },
    select: { sections: true },
  });
  const resolved = resolveCaseTypeFor(canvas.businessCase, template?.sections);
  const tpl = templateById(resolved?.templateId);
  // Cascada del brief efectivo IGUAL que blocks/regenerate: Plantilla v0 ??
  // el Json de guías del propio canvas (legacy) ?? spec del template.
  const briefs = briefsByKeyFrom(template?.sections ?? canvas.sections);
  const defsByKey = new Map(tpl.sections.map((d) => [d.key, d]));

  const sections: AssistSectionDef[] = [];
  for (const s of canvas.canvasSections) {
    const def = defsByKey.get(s.key);
    if (!def || def.agentGenerated === false || def.ctxDriven) continue;
    const card = s.blocks.find((b) => b.blockType === "CARD");
    sections.push({
      key: def.key,
      label: def.label,
      schema: def.schema,
      brief: briefs[s.key] ?? def.brief ?? def.agentHint,
      currentData: card?.data ?? def.empty,
    });
  }
  if (sections.length === 0) {
    return NextResponse.json({ error: "El caso no tiene secciones editables por IA todavía." }, { status: 400 });
  }

  // Idioma: `language` persistente ?? `__lang` del hero de ESTE canvas (legacy).
  let lang = canvas.businessCase.language?.trim().toLowerCase() || null;
  if (!lang) {
    const heroData = canvas.canvasSections.find((s) => s.key === "hero")?.blocks[0]?.data;
    const rawLang =
      heroData && typeof heroData === "object" && !Array.isArray(heroData)
        ? (heroData as Record<string, unknown>).__lang
        : null;
    lang = typeof rawLang === "string" && rawLang.trim() ? rawLang.trim().toLowerCase() : null;
  }

  const run = await prisma.agentRun.create({
    data: {
      agentSlug: "business-case",
      businessCaseId: id,
      clientId: canvas.businessCase.clientId,
      status: "RUNNING",
      stepLabel: "Assist · Business Case",
    },
    select: { id: true },
  });

  try {
    const result = await runDocumentAssist({
      docLabel: "business case (propuesta comercial)",
      systemPrompt: tpl.agentIntro ?? DEFAULT_AGENT_INTRO,
      sections,
      instruction,
      lang,
      // Mismo gate que la generación (canvas-agent): el BC es cliente-facing.
      brandVoice: tpl.brandVoice !== false,
      maxWebSearches: 3,
    });
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "DONE", output: JSON.stringify(result) },
    });
    return NextResponse.json({ ...result, runId: run.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "el assist falló — prueba de nuevo";
    await prisma.agentRun
      .update({ where: { id: run.id }, data: { status: "ERROR", output: JSON.stringify({ error: message }) } })
      .catch(() => {});
    console.error("[bc/assist] error:", e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
