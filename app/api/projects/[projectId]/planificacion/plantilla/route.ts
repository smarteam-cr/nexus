/**
 * /api/projects/[projectId]/planificacion/plantilla — la plantilla de la planificación del proyecto (I2, 2026-10-27).
 * Gemela de …/diagnostico/plantilla: la planificación tiene dos plantillas, la completa y la esencial.
 *
 *   GET                     → { plantilla, nombre, guardada }: la anotada en el documento (o la de siempre, sin anotar).
 *   POST { plantilla }      → EMPEZAR EN BLANCO: el documento con las secciones de esa plantilla, sin la IA, y la plantilla
 *                             anotada. Es la salida «Escribirlo yo» del selector (components/canvas/ElegirPlantilla.tsx).
 *
 * Escribir pide lo mismo que editar el documento (acceso al proyecto, como el PATCH de sus secciones).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { plantillaDelDocumento } from "@/lib/entregables/registro";
import { empezarEnBlanco, ErrorDelEntregable } from "@/lib/entregables/generar-server";
import { triggeredByEmail } from "@/lib/agents/triggered-by";
import { MENSAJE_APROBADO } from "@/lib/canvas/estado-del-documento";

type Params = { params: Promise<{ projectId: string }> };

const SLUG = "planning";
const IdDelProyecto = z.string().cuid();
const Cuerpo = z.object({ plantilla: z.string().min(1).max(80) });

export async function GET(_req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  if (!IdDelProyecto.safeParse(projectId).success) return NextResponse.json({ error: "Proyecto inválido" }, { status: 400 });
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const c = await prisma.projectCanvas.findFirst({ where: { projectId, ...canvasOf(SLUG) }, select: { sections: true } });
  const g = plantillaDelDocumento(SLUG, c?.sections);
  return NextResponse.json({ plantilla: g?.plantilla.id ?? null, nombre: g?.plantilla.nombre ?? null, guardada: g?.guardada ?? false });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  if (!IdDelProyecto.safeParse(projectId).success) return NextResponse.json({ error: "Proyecto inválido" }, { status: 400 });
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const cuerpo = Cuerpo.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return NextResponse.json({ error: "Falta la plantilla." }, { status: 400 });
  try {
    const r = await empezarEnBlanco({ projectId, slug: SLUG, plantillaId: cuerpo.data.plantilla, porEmail: await triggeredByEmail() });
    return NextResponse.json({ ok: true, canvasId: r.canvasId });
  } catch (e) {
    if (e instanceof ErrorDelEntregable) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof Error && e.message === MENSAJE_APROBADO) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
