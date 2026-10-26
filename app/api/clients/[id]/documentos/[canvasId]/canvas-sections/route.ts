/**
 * /api/clients/[id]/documentos/[canvasId]/canvas-sections — las secciones de un documento de la EMPRESA (R3 etapa 3,
 * 2026-10-27). El mismo contrato que `/api/projects/[projectId]/canvas-sections` (lo lee `useCanvasSections`), con la
 * puerta de la empresa: lib/clients/documento-de-la-empresa-guard.ts.
 *
 *   GET   ?canvasId=…                → { sections } con sus bloques y su `hidden` (del Json del documento).
 *   PATCH { canvasId, orderedIds }   → reordena las secciones.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { parseSectionEntries } from "@/lib/business-cases/section-briefs";
import { guardDocumentoDeLaEmpresa } from "@/lib/clients/documento-de-la-empresa-guard";

type Params = { params: Promise<{ id: string; canvasId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id, canvasId } = await params;
  const doc = await guardDocumentoDeLaEmpresa(id, canvasId);
  if (doc instanceof NextResponse) return doc;
  // El hook manda `?canvasId=`: tiene que ser el de la dirección.
  if (req.nextUrl.searchParams.get("canvasId") !== canvasId) return NextResponse.json({ error: "canvas not found" }, { status: 404 });

  const ocultaPorKey = new Map(parseSectionEntries(doc.sections).map((e) => [e.key, e.hidden === true]));
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
  return NextResponse.json({ sections: rows.map((s) => ({ ...s, hidden: ocultaPorKey.get(s.key) ?? false })) });
}

const Orden = z.strictObject({ canvasId: z.string().min(1).max(64), orderedIds: z.array(z.string().min(1).max(64)).min(1).max(200) });

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id, canvasId } = await params;
  const doc = await guardDocumentoDeLaEmpresa(id, canvasId);
  if (doc instanceof NextResponse) return doc;
  const cuerpo = Orden.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success || cuerpo.data.canvasId !== canvasId) return NextResponse.json({ error: "canvasId y orderedIds requeridos" }, { status: 400 });

  // Solo secciones del PROPIO documento; las no incluidas quedan al final en su orden.
  const rows = await prisma.canvasSection.findMany({ where: { canvasId }, orderBy: { order: "asc" }, select: { id: true } });
  const validas = new Set(rows.map((r) => r.id));
  const ordenadas = [...new Set(cuerpo.data.orderedIds)].filter((s) => validas.has(s));
  const resto = rows.map((r) => r.id).filter((s) => !ordenadas.includes(s));
  await prisma.$transaction([...ordenadas, ...resto].map((sid, i) => prisma.canvasSection.update({ where: { id: sid }, data: { order: i } })));
  await prisma.projectCanvas.update({ where: { id: canvasId }, data: { contentUpdatedAt: new Date() } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
