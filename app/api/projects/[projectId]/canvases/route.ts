import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { canvasNotOf, onlyEnabled } from "@/lib/pieces/canvas-query";

// GET: list canvases for a project (default first, then by createdAt)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  // Handoff queda FUERA del dropdown del proyecto: es una entidad cliente-level
  // (model Handoff) que se ve/edita desde la vista de cliente, no como canvas del
  // proyecto. El canvas sigue existiendo (1:1 con el Project) y loadCanvasContext
  // lo lee igual para el Kickoff — solo se oculta de este listado.
  const canvases = await prisma.projectCanvas.findMany({
    // `onlyEnabled` va acá y en el seed server-side de app/(shell)/clients/[id]/page.tsx,
    // en el mismo commit: el panel mezcla las dos en un solo estado, así que filtrar en
    // una sola haría que la pantalla arranque con N pestañas y salte a N−1 — y si la que
    // desaparece era la activa, el CSE termina en otro canvas sin haber tocado nada.
    where: { projectId, ...canvasNotOf("handoff"), ...onlyEnabled },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      // El front ramifica su renderer por SLUG (identidad de pieza), no por `name`.
      slug: true,
      name: true,
      isDefault: true,
      order: true,
      sections: true,
      createdAt: true,
    },
  });

  // ¿Cuáles tienen algo escrito? Lo usa el desplegable para distinguir "generada" de
  // "vacía" — que es la diferencia entre "ya está hecho" y "entrá y generalo". Una sola
  // consulta agrupada, no N+1: interesa la EXISTENCIA de bloques, no cuántos.
  const conContenido = new Set(
    (
      await prisma.canvasSection.findMany({
        where: { canvasId: { in: canvases.map((c) => c.id) }, blocks: { some: {} } },
        select: { canvasId: true },
        distinct: ["canvasId"],
      })
    ).map((s) => s.canvasId),
  );

  return NextResponse.json({
    canvases: canvases.map((c) => ({ ...c, hasContent: conContenido.has(c.id) })),
  });
}

// POST: create a new custom canvas
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const { name } = await req.json();

  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const canvas = await prisma.projectCanvas.create({
    data: {
      projectId,
      name: name.trim(),
      isDefault: false,
      sections: [],
    },
    select: { id: true, name: true, isDefault: true, sections: true },
  });

  return NextResponse.json(canvas, { status: 201 });
}
