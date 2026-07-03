/**
 * /api/business-cases/[id]/canvas-sections
 *   GET ?canvasId=       → secciones + bloques del canvas (contrato del hook
 *                          useCanvasSections; espejo de projects/canvas-sections)
 *   PATCH { canvasId, orderedIds } → reordena las SECCIONES (drag & drop):
 *                          order = índice en orderedIds
 *
 * Gateado con guardSalesAccess + verificación de pertenencia al caso.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { parseSectionEntries } from "@/lib/business-cases/section-briefs";

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
