import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { canvasNotOf, onlyEnabled } from "@/lib/pieces/canvas-query";
import { loadCanvasesConContenido } from "@/lib/pieces/piece-content";
import { piezaDesactualizadaPorHandoff } from "@/lib/pieces/piece-staleness";

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
      // Para el aviso de "el handoff cambió después" (lib/pieces/piece-staleness.ts).
      contentUpdatedAt: true,
    },
  });

  // ¿Cuáles tienen algo escrito? Lo usa el desplegable para distinguir "generada" de
  // "vacía" — que es la diferencia entre "ya está hecho" y "entrá y generalo". El
  // criterio vive en lib/pieces/piece-content.ts (bloque semilla ≠ contenido; el
  // Cronograma se mide por sus fases) y lo comparte con el seed server-side de
  // app/(shell)/clients/[id]/page.tsx: si cada uno tuviera el suyo, la pantalla
  // arrancaría con un estado y saltaría a otro al llegar el refetch.
  const conContenido = await loadCanvasesConContenido(projectId, canvases);

  /* Cuándo corrió el handoff por última vez: con eso se marca el requerimiento técnico
     que quedó viejo. El encadenado ya NO lo reescribe solo (borraba ediciones a mano), y
     sin este aviso el único rastro del salteo era un log del servidor. */
  const proyecto = await prisma.project.findUnique({
    where: { id: projectId },
    select: { handoffGeneratedAt: true },
  });

  return NextResponse.json({
    canvases: canvases.map((c) => ({
      ...c,
      hasContent: conContenido.has(c.id),
      stale: piezaDesactualizadaPorHandoff(
        { slug: c.slug, contentUpdatedAt: c.contentUpdatedAt, hasContent: conContenido.has(c.id) },
        proyecto?.handoffGeneratedAt ?? null,
      ),
    })),
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
