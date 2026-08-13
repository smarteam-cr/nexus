/**
 * /api/business-cases/[id]/canvas-sections
 *   GET ?canvasId=       → secciones + bloques del canvas (contrato del hook
 *                          useCanvasSections; espejo de projects/canvas-sections)
 *   POST { canvasId, label } → crea una sección PERSONALIZADA (`custom:*`) al final
 *   PATCH { canvasId, orderedIds } → reordena las SECCIONES (drag & drop):
 *                          order = índice en orderedIds
 *
 * (El DELETE de una sección personalizada vive en `[sectionId]/route.ts`.)
 *
 * Gateado con guardSalesAccess + verificación de pertenencia al caso.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { parseSectionEntries, patchSectionEntry } from "@/lib/business-cases/section-briefs";
import { touchCanvasContent } from "@/lib/canvas/touch-content";
import {
  CUSTOM_PREFIX,
  CUSTOM_SECTION_EMPTY,
  MAX_CUSTOM_SECTIONS,
  nuevaCustomKey,
} from "@/lib/landing/custom-sections";
import type { Prisma } from "@prisma/client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const canvasId = new URL(req.url).searchParams.get("canvasId");
  if (!canvasId) {
    return NextResponse.json({ error: "canvasId required" }, { status: 400 });
  }

  const canvas = await prisma.projectCanvas.findUnique({
    where: { id: canvasId },
    select: { businessCaseId: true, sections: true },
  });
  if (!canvas || canvas.businessCaseId !== id) {
    return NextResponse.json({ error: "canvas not found" }, { status: 404 });
  }

  // Brief (guía del agente) + flag `hidden` por sección viven en el Json del canvas, no
  // en columnas → los re-adjuntamos por key para mantener el contrato del hook.
  const entryByKey = new Map<string, { brief: string | null; previousBrief: string | null; hidden: boolean }>();
  for (const e of parseSectionEntries(canvas.sections)) {
    entryByKey.set(e.key, { brief: e.brief ?? null, previousBrief: e.previousBrief ?? null, hidden: e.hidden === true });
  }

  const rows = await prisma.canvasSection.findMany({
    where: { canvasId },
    orderBy: { order: "asc" },
    include: {
      blocks: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          blockType: true,
          content: true,
          data: true,
          previousContent: true,
          previousData: true,
          order: true,
          colSpan: true,
          colStart: true,
          rowSpan: true,
          source: true,
          status: true,
          agentRunId: true,
          createdAt: true,
        },
      },
    },
  });

  const sections = rows.map((s) => ({
    ...s,
    agentBriefOverride: entryByKey.get(s.key)?.brief ?? null,
    previousAgentBriefOverride: entryByKey.get(s.key)?.previousBrief ?? null,
    hidden: entryByKey.get(s.key)?.hidden ?? false,
  }));

  return NextResponse.json({ sections });
}

const createSchema = z.object({
  canvasId: z.string().min(1),
  label: z.string().trim().min(1).max(60),
});

/**
 * POST — crea una sección PERSONALIZADA: el vendedor le pone nombre y después pega adentro
 * un HTML que armó aparte. Es el único camino por el que nace una fila `CanvasSection`
 * fuera de `createBusinessCaseCanvas`.
 *
 * Todo en una transacción, y las tres escrituras son obligatorias:
 *  · la FILA (con `label` Y `titleOverride` — ver abajo),
 *  · el BLOQUE CARD sembrado: sin él el editor no tiene dónde persistir (todo el motor
 *    asume 1 bloque por sección) y la sección se vería pero no guardaría nada,
 *  · la ENTRY en el Json del canvas, que es de donde salen `hidden` y el carry-forward.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "canvasId y un nombre (1-60 caracteres) requeridos" }, { status: 400 });
  }
  const { canvasId, label } = parsed.data;

  const canvas = await prisma.projectCanvas.findUnique({
    where: { id: canvasId },
    select: { businessCaseId: true, sections: true, version: true },
  });
  if (!canvas || canvas.businessCaseId !== id) {
    return NextResponse.json({ error: "canvas not found" }, { status: 404 });
  }
  // En la Plantilla (v0) se editan las GUÍAS del agente, no el contenido: una sección
  // propia ahí no tendría dónde pegarse (SectionTools ni siquiera se monta).
  if (canvas.version === 0) {
    return NextResponse.json(
      { error: "Generá una versión de la propuesta antes de agregarle secciones propias." },
      { status: 400 },
    );
  }

  const [usadas, ultima] = await Promise.all([
    prisma.canvasSection.count({ where: { canvasId, key: { startsWith: CUSTOM_PREFIX } } }),
    prisma.canvasSection.findFirst({ where: { canvasId }, orderBy: { order: "desc" }, select: { order: true } }),
  ]);
  if (usadas >= MAX_CUSTOM_SECTIONS) {
    return NextResponse.json(
      { error: `Máximo ${MAX_CUSTOM_SECTIONS} secciones personalizadas por propuesta.` },
      { status: 400 },
    );
  }

  const key = nuevaCustomKey();
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.canvasSection.create({
      data: {
        canvasId,
        key,
        label,
        /* `titleOverride` además de `label`, y no es redundante: el nombre que el vendedor
           escribió tiene que llegar a las TRES superficies, y la de impresión recibe solo
           keys (`PrintRow` no lleva `label`). `LandingView` pinta `titleOverride || def.label`,
           así que este campo es el único canal que las cruza a las tres. */
        titleOverride: label,
        order: (ultima?.order ?? -1) + 1, // al final: el vendedor la arrastra a donde va
      },
    });
    await tx.canvasBlock.create({
      data: {
        sectionId: created.id,
        blockType: "CARD",
        data: { ...CUSTOM_SECTION_EMPTY } as Prisma.InputJsonValue,
        order: 0,
        source: "HUMAN",
        status: "CONFIRMED",
      },
    });
    await tx.projectCanvas.update({
      where: { id: canvasId },
      data: {
        sections: patchSectionEntry(canvas.sections, key, { label }) as unknown as Prisma.InputJsonValue,
      },
    });
    return created;
  });

  await touchCanvasContent(row.id); // enciende "cambios sin subir" en la PublishBar

  const blocks = await prisma.canvasBlock.findMany({
    where: { sectionId: row.id },
    orderBy: { order: "asc" },
  });
  // Mismo contrato que el GET: el hook hace refetch, pero devolverlo completo evita que
  // el llamador tenga que adivinar la forma.
  return NextResponse.json(
    { section: { ...row, blocks, agentBriefOverride: null, previousAgentBriefOverride: null, hidden: false } },
    { status: 201 },
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  let body: { canvasId?: unknown; orderedIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const canvasId = typeof body.canvasId === "string" ? body.canvasId : "";
  // Set (no solo filter de tipo): un id repetido en el payload haría que dos
  // secciones terminen con el mismo `order` (gana el último update) y otro valor
  // de order quede sin usar — dedup preserva la primera ocurrencia (su posición).
  const orderedIds = Array.isArray(body.orderedIds)
    ? [...new Set(body.orderedIds.filter((x): x is string => typeof x === "string"))]
    : [];
  if (!canvasId || orderedIds.length === 0) {
    return NextResponse.json({ error: "canvasId y orderedIds requeridos" }, { status: 400 });
  }

  const canvas = await prisma.projectCanvas.findUnique({
    where: { id: canvasId },
    select: { businessCaseId: true },
  });
  if (!canvas || canvas.businessCaseId !== id) {
    return NextResponse.json({ error: "canvas not found" }, { status: 404 });
  }

  // Solo secciones del PROPIO canvas (ids ajenos se ignoran); las no incluidas
  // conservan su posición relativa al final.
  const rows = await prisma.canvasSection.findMany({
    where: { canvasId },
    orderBy: { order: "asc" },
    select: { id: true },
  });
  const valid = new Set(rows.map((r) => r.id));
  const ordered = orderedIds.filter((sid) => valid.has(sid));
  const rest = rows.map((r) => r.id).filter((sid) => !ordered.includes(sid));
  const finalOrder = [...ordered, ...rest];

  await prisma.$transaction(
    finalOrder.map((sid, i) =>
      prisma.canvasSection.update({ where: { id: sid }, data: { order: i } }),
    ),
  );

  return NextResponse.json({ ok: true });
}
