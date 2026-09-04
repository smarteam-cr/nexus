/**
 * GET/PUT /api/projects/[projectId]/tags
 *
 * Tags de PRODUCTO/ALCANCE del proyecto (slugs del catálogo `lib/tags/catalog.ts`).
 * Desde el 2026-08-12 incluye TAMBIÉN el tipo de implementación, que hasta entonces tenía su
 * propia columna y su propio PATCH: es un tag del catálogo como cualquier otro y `sanitizeTags`
 * hace cumplir que sea uno solo. GET auto-deriva un producto desde `serviceType` si está vacío.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject, guardProjectHandoffAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { sanitizeTags, SERVICE_TO_PRODUCT } from "@/lib/tags/catalog";
import { ensurePieceCanvas } from "@/lib/pieces/ensure-canvas";
import { proposedPieces, resolvePieceStates } from "@/lib/pieces/piece-state";

// GET: tags del proyecto (auto-deriva un producto desde serviceType si está vacío). Lectura abierta.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { tags: true, serviceType: true },
  });
  if (!project) return NextResponse.json({ tags: [] });

  // Normaliza lo guardado (puede tener labels legacy) a slugs canónicos.
  let tags = sanitizeTags(project.tags);

  // Vacío + hay serviceType → SUGERIR el producto por defecto (slug), SIN persistir:
  // un GET no debe mutar estado (semántica HTTP + RBAC: el lector puede no ser editor).
  // La materialización la hace el agente (persistTimelineFromAgentOutput) o el PUT del editor.
  if (tags.length === 0 && project.serviceType) {
    const product = SERVICE_TO_PRODUCT[project.serviceType];
    if (product) tags = [product];
  }

  return NextResponse.json({ tags });
}

// PUT: reemplaza los tags. EDICIÓN = owner del cliente o handoffAnywhere (el CSE clasifica
// SUS proyectos a mano). Scope de owner enforced por requireHandoffAccess.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardProjectHandoffAccess(projectId);
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const tags = sanitizeTags((raw as { tags?: unknown })?.tags);

  await prisma.project.update({ where: { id: projectId }, data: { tags } });

  // D-03 (2026-09-04): los tags ENCIENDEN piezas (`enabledByTags`, lib/pieces/registry.ts).
  // Hasta hoy solo el handoff las encendía al detectar el tag; un tag puesto a mano después no
  // hacía nada. Se enciende exactamente lo que `resolvePieceStates` PROPONE —sin canvas y con
  // el tag— y nunca una pieza que el CSE apagó a propósito: esa queda «off», no «proposed».
  // Best-effort: los tags ya están guardados; una pieza que no se pudo encender no los deshace.
  const canvases = await prisma.projectCanvas.findMany({
    where: { projectId },
    select: { id: true, slug: true, name: true, disabledAt: true },
  });
  const piezasEncendidas: string[] = [];
  for (const pieza of proposedPieces(resolvePieceStates({ tags, canvases }))) {
    try {
      const r = await ensurePieceCanvas(projectId, pieza.slug);
      if (r.outcome !== "sin-cambios") piezasEncendidas.push(pieza.slug);
    } catch (e) {
      console.warn(`[tags] no se pudo encender «${pieza.slug}»:`, e instanceof Error ? e.message : e);
    }
  }
  return NextResponse.json({ tags, piezasEncendidas });
}
