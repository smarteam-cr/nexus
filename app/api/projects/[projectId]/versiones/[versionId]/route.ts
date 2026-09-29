import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { leerSecciones, restaurarVersion, traerSeccionDeVersion } from "@/lib/canvas/versiones";
import { documentoDelProyecto, permisoParaUsarVersion } from "@/lib/canvas/versiones-acceso";

/**
 * /api/projects/[projectId]/versiones/[versionId]
 *
 *   GET  → la versión con sus secciones (para consultarla).
 *   POST { accion: "traer", key } → trae ESA sección al documento actual.
 *   POST { accion: "restaurar" }  → restaura la versión entera.
 * Las dos escrituras toman antes una foto del documento actual: ninguna pierde lo que había.
 */
type Params = { params: Promise<{ projectId: string; versionId: string }> };

async function cargar(projectId: string, versionId: string) {
  const v = await prisma.versionDeDocumento.findUnique({
    where: { id: versionId },
    select: { id: true, canvasId: true, origen: true, creadaPor: true, createdAt: true, secciones: true },
  });
  if (!v) return null;
  const canvas = await documentoDelProyecto(projectId, v.canvasId);
  return canvas ? { v, canvas } : null;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { projectId, versionId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const r = await cargar(projectId, versionId);
  if (!r) return NextResponse.json({ error: "Versión no encontrada" }, { status: 404 });
  return NextResponse.json({ version: { ...r.v, secciones: leerSecciones(r.v.secciones) } });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { projectId, versionId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const r = await cargar(projectId, versionId);
  if (!r) return NextResponse.json({ error: "Versión no encontrada" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { accion?: unknown; key?: unknown } | null;
  const accion = body?.accion === "restaurar" ? "restaurar" : body?.accion === "traer" ? "traer" : null;
  if (!accion) return NextResponse.json({ error: "accion: «traer» o «restaurar»" }, { status: 400 });
  const denegado = await permisoParaUsarVersion(r.canvas, accion);
  if (denegado) return denegado;

  const actor = guard.user?.email ?? null;
  const res =
    accion === "restaurar"
      ? await restaurarVersion({ canvasId: r.canvas.id, versionId, actor })
      : typeof body?.key === "string" && body.key
        ? await traerSeccionDeVersion({ canvasId: r.canvas.id, versionId, key: body.key, actor })
        : ({ ok: false, error: "Falta la sección (key).", status: 400 } as const);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
