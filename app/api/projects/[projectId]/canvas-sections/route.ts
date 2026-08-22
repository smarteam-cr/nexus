import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject, denyHandoffCanvasEditForCse } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { parseSectionEntries, patchSectionEntry } from "@/lib/business-cases/section-briefs";
import { CUSTOM_PREFIX, CUSTOM_SECTION_EMPTY, MAX_CUSTOM_SECTIONS, nuevaCustomKey } from "@/lib/landing/custom-sections";
import { touchCanvasContent } from "@/lib/canvas/touch-content";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

// GET: sections + blocks for a non-default canvas
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const canvasId = new URL(req.url).searchParams.get("canvasId");

  if (!canvasId) {
    return NextResponse.json({ error: "canvasId required" }, { status: 400 });
  }

  const canvas = await prisma.projectCanvas.findUnique({
    where: { id: canvasId },
    select: { projectId: true, isDefault: true, sections: true },
  });

  if (!canvas || canvas.projectId !== projectId) {
    return NextResponse.json({ error: "canvas not found" }, { status: 404 });
  }

  /* El flag `hidden` por sección vive en el Json del canvas, no en una columna (el porqué
     está en el PATCH de [sectionId]) → se re-adjunta por key para mantener el contrato que
     `useCanvasSections` ya espera. Sin esto el ojo del motor cambia en pantalla, se recarga,
     y la sección vuelve a estar visible: el arreglo se apagaría en el último metro. */
  const ocultaPorKey = new Map(parseSectionEntries(canvas.sections).map((e) => [e.key, e.hidden === true]));

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

  const sections = rows.map((s) => ({ ...s, hidden: ocultaPorKey.get(s.key) ?? false }));

  return NextResponse.json({ sections });
}

// PATCH: reorder SECTIONS of a canvas (drag&drop). Espejo del de business-cases;
// el kickoff (editor nuevo sobre LandingView) lo usa vía useCanvasSections.reorderSections.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  let body: { canvasId?: unknown; orderedIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const canvasId = typeof body.canvasId === "string" ? body.canvasId : "";
  // Set (dedup): un id repetido dejaría dos secciones con el mismo `order`.
  const orderedIds = Array.isArray(body.orderedIds)
    ? [...new Set(body.orderedIds.filter((x): x is string => typeof x === "string"))]
    : [];
  if (!canvasId || orderedIds.length === 0) {
    return NextResponse.json({ error: "canvasId y orderedIds requeridos" }, { status: 400 });
  }

  const canvas = await prisma.projectCanvas.findUnique({
    where: { id: canvasId },
    select: { projectId: true, name: true },
  });
  if (!canvas || canvas.projectId !== projectId) {
    return NextResponse.json({ error: "canvas not found" }, { status: 404 });
  }
  const denied = await denyHandoffCanvasEditForCse(canvas.name);
  if (denied) return denied;

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

  // Marca "cambios sin subir" (reordenar cambia lo que se publicará en el snapshot).
  try {
    await prisma.projectCanvas.update({ where: { id: canvasId }, data: { contentUpdatedAt: new Date() } });
  } catch {
    /* flag secundario */
  }

  return NextResponse.json({ ok: true });
}

// PUT: reorder blocks within/between sections
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const { blockId, toSectionId, toIndex } = await req.json();

  if (!blockId || !toSectionId || typeof toIndex !== "number") {
    return NextResponse.json({ error: "blockId, toSectionId, toIndex required" }, { status: 400 });
  }

  const block = await prisma.canvasBlock.findUnique({
    where: { id: blockId },
    include: { section: { select: { canvasId: true, canvas: { select: { projectId: true, name: true } } } } },
  });

  if (!block || block.section.canvas.projectId !== projectId) {
    return NextResponse.json({ error: "block not found" }, { status: 404 });
  }
  const denied = await denyHandoffCanvasEditForCse(block.section.canvas.name);
  if (denied) return denied;

  const fromSectionId = block.sectionId;

  if (fromSectionId === toSectionId) {
    // Reorder within same section
    const sectionBlocks = await prisma.canvasBlock.findMany({
      where: { sectionId: toSectionId },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    const ids = sectionBlocks.map((b) => b.id).filter((id) => id !== blockId);
    ids.splice(toIndex, 0, blockId);
    await Promise.all(ids.map((id, i) => prisma.canvasBlock.update({ where: { id }, data: { order: i } })));
  } else {
    // Move to different section
    const fromBlocks = await prisma.canvasBlock.findMany({
      where: { sectionId: fromSectionId },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    const fromIds = fromBlocks.map((b) => b.id).filter((id) => id !== blockId);
    await Promise.all(fromIds.map((id, i) => prisma.canvasBlock.update({ where: { id }, data: { order: i } })));

    const toBlocks = await prisma.canvasBlock.findMany({
      where: { sectionId: toSectionId },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    const toIds = toBlocks.map((b) => b.id);
    toIds.splice(toIndex, 0, blockId);
    await Promise.all(toIds.map((id, i) =>
      prisma.canvasBlock.update({ where: { id }, data: { sectionId: toSectionId, order: i } })
    ));
  }

  return NextResponse.json({ ok: true });
}


const crearSchema = z.object({
  canvasId: z.string().min(1),
  label: z.string().trim().min(1).max(60),
});

/**
 * POST — crea una sección PROPIA en un documento del proyecto.
 *
 * ── POR QUÉ EXISTE, SI YA ESTABA EN EL BUSINESS CASE ─────────────────────────
 * Estaba en UNO de los ocho documentos del motor. Elías pidió que modificar el motor de páginas
 * web «sea igual en todas las áreas»: mientras crear una sección exista solo en la propuesta
 * comercial, cualquier cosa que se construya encima —el chat, el botón de la sección— significa
 * algo distinto según dónde estés parado.
 *
 * Espejo del de `business-cases`, con dos diferencias de dominio:
 *  · el guard es el del PROYECTO (`guardAccessToProject`), más el veto del handoff — que es el
 *    único documento de proyecto donde editar exige una capacidad propia;
 *  · no hay chequeo de `version`: los canvases de proyecto no se versionan.
 *
 * Las TRES escrituras van en una transacción y son obligatorias:
 *  · la FILA, con `label` Y `titleOverride` — el segundo es el único canal que llega al PDF,
 *    porque `PrintRow` no lleva `label`;
 *  · el BLOQUE CARD sembrado: todo el motor asume UN bloque por sección, y sin él la sección se
 *    ve y no guarda nada;
 *  · la ENTRY en el Json del canvas, de donde salen `hidden` y el orden.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const parsed = crearSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "canvasId y un nombre (1-60 caracteres) requeridos" },
      { status: 400 },
    );
  }
  const { canvasId, label } = parsed.data;

  const canvas = await prisma.projectCanvas.findUnique({
    where: { id: canvasId },
    select: { projectId: true, name: true, sections: true },
  });
  if (!canvas || canvas.projectId !== projectId) {
    return NextResponse.json({ error: "canvas not found" }, { status: 404 });
  }
  const denied = await denyHandoffCanvasEditForCse(canvas.name);
  if (denied) return denied;

  const [usadas, ultima] = await Promise.all([
    prisma.canvasSection.count({ where: { canvasId, key: { startsWith: CUSTOM_PREFIX } } }),
    prisma.canvasSection.findFirst({
      where: { canvasId },
      orderBy: { order: "desc" },
      select: { order: true },
    }),
  ]);
  /* El tope no es estética: el GET devuelve TODOS los bloques con su `data` y el hook los
     serializa enteros en cada refetch. Sin techo, unas pocas secciones grandes arrastran el
     editor y engordan el snapshot que lee el cliente. */
  if (usadas >= MAX_CUSTOM_SECTIONS) {
    return NextResponse.json(
      { error: `Máximo ${MAX_CUSTOM_SECTIONS} secciones propias por documento.` },
      { status: 400 },
    );
  }

  const key = nuevaCustomKey();
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.canvasSection.create({
      data: { canvasId, key, label, titleOverride: label, order: (ultima?.order ?? -1) + 1 },
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

  await touchCanvasContent(row.id);

  const blocks = await prisma.canvasBlock.findMany({
    where: { sectionId: row.id },
    orderBy: { order: "asc" },
  });
  return NextResponse.json({ section: { ...row, blocks, hidden: false } }, { status: 201 });
}
