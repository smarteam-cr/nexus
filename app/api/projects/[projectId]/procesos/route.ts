import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { readClientProcesos } from "@/lib/canvas/read-procesos";

/**
 * GET /api/projects/[projectId]/procesos
 *
 * Diagramas de proceso (FLOWCHART) del CLIENTE del proyecto — viven a nivel cliente
 * (canvas "Información del cliente"). Los consume el preview interno del Kickoff para
 * renderizar la sección "Procesos". Modo interno → devuelve TODOS (draft + confirmados);
 * el cliente externo ve solo los CONFIRMED vía kickoff-view.ts. Guarded.
 *
 * PATCH { blockId, status: "CONFIRMED" | "DRAFT" } → confirma (o vuelve a borrador) un
 * proceso del cliente desde el editor del kickoff. Solo CONFIRMED cruza al cliente.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { clientId: true },
  });
  if (!project) return NextResponse.json({ procesos: [] });

  const procesos = await readClientProcesos(project.clientId);
  return NextResponse.json({ procesos });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  let body: { blockId?: unknown; status?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const blockId = typeof body.blockId === "string" ? body.blockId : "";
  const wantStatus = body.status === "CONFIRMED" ? "CONFIRMED" : body.status === "DRAFT" ? "DRAFT" : null;
  if (!blockId || !wantStatus) {
    return NextResponse.json({ error: "Falta blockId o status (CONFIRMED | DRAFT)" }, { status: 400 });
  }

  // Verificar que el bloque sea un proceso (FLOWCHART) de la sección "procesos" del
  // canvas del cliente (proyecto __strategy__) — evita confirmar bloques ajenos.
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { clientId: true },
  });
  if (!project) return NextResponse.json({ error: "Proyecto no existe" }, { status: 404 });
  const strategy = await prisma.project.findFirst({
    where: { clientId: project.clientId, serviceType: "__strategy__" },
    select: { id: true },
  });
  const block = strategy
    ? await prisma.canvasBlock.findFirst({
        where: {
          id: blockId,
          blockType: "FLOWCHART",
          section: { key: "procesos", canvas: { projectId: strategy.id, name: "Información del cliente" } },
        },
        select: { id: true },
      })
    : null;
  if (!block) {
    return NextResponse.json({ error: "Proceso no encontrado para este cliente" }, { status: 404 });
  }

  await prisma.canvasBlock.update({ where: { id: blockId }, data: { status: wantStatus } });
  return NextResponse.json({ ok: true, blockId, status: wantStatus });
}
