/**
 * /api/projects/[projectId]/publish-ciclos
 *
 * Compartir la RUTA DEL SERVICIO —los ciclos de un servicio recurrente y sus casos de uso como Gantt— con el cliente
 * (SmartLoop, docs/smartloop-plan.md, etapa 7). Mismo acceso y misma contraseña que las otras superficies; el
 * `?next=ciclos` decide dónde aterriza.
 *
 *   GET    → { published, publishedAt, clientUrl, hasAccess }
 *   POST   → compartir       (congela la foto + ciclosPublishedAt = now)
 *   DELETE → dejar de compartir (ciclosPublishedAt = null)
 *
 * Congela, como la Entrega: lo que el cliente abre es lo que se le subió. Volver a subirla rehace la foto con lo de hoy.
 * La foto se arma en lib/servicios/ruta-del-servicio(-server).ts y lleva solo lo que el cliente puede ver (sin el porqué
 * de los casos, sin notas internas, sin citas, sin montos).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject, guardPublicacionDeProyecto } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { publishSurface } from "@/lib/projects/publish-surfaces";
import { resolvePipeline } from "@/lib/projects/kind";
import { armarRutaDelServicio } from "@/lib/servicios/ruta-del-servicio-server";
import { rutaConContenido } from "@/lib/servicios/ruta-del-servicio";

const SURFACE = publishSurface("ciclos");

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ciclosPublishedAt: true, externalAccess: { select: { accessToken: true, revokedAt: true } } },
  });
  if (!project) return NextResponse.json({ error: "Proyecto no existe" }, { status: 404 });

  const access = project.externalAccess;
  let clientUrl: string | null = null;
  if (access && !access.revokedAt) {
    const base = process.env.APP_URL || new URL(req.url).origin;
    clientUrl = `${base}/external/verify/${access.accessToken}?next=${SURFACE.next}`;
  }
  return NextResponse.json({
    published: !!project.ciclosPublishedAt,
    publishedAt: project.ciclosPublishedAt?.toISOString() ?? null,
    clientUrl,
    hasAccess: !!access && !access.revokedAt,
  });
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  // Publicar exige, además del acceso, que el proyecto ADMITA publicación externa.
  const guard = await guardPublicacionDeProyecto(projectId);
  if (guard instanceof NextResponse) return guard;

  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { hubspotPipelineId: true } });
  if (!resolvePipeline(p?.hubspotPipelineId)?.servicioRecurrente) {
    return NextResponse.json(
      { error: "NO_ES_RECURRENTE", message: "La ruta del servicio es de un servicio recurrente (SmartLoop)." },
      { status: 409 },
    );
  }

  const now = new Date();
  const ruta = await armarRutaDelServicio(projectId, now);
  /* Nada que mostrar ⇒ 409 con motivo, no una publicación vacía: el cliente abriría el enlace y no vería nada. */
  if (!ruta || !rutaConContenido(ruta)) {
    return NextResponse.json(
      { error: "SIN_CICLOS", message: "Todavía no hay ciclos: abre el primero antes de subir la ruta del servicio." },
      { status: 409 },
    );
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { ciclosPublicados: JSON.parse(JSON.stringify(ruta)), ciclosPublishedAt: now },
    select: { id: true },
  });
  return NextResponse.json({ published: true, publishedAt: now.toISOString() });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  /* ⚠ `guardAccessToProject`, NO `guardPublicacionDeProyecto`: despublicar no se gatea nunca. Si un proyecto deja de
     admitir publicación DESPUÉS de haber compartido algo, gatear el DELETE dejaría la ruta publicada y sin salida. */
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  await prisma.project.update({ where: { id: projectId }, data: { ciclosPublishedAt: null }, select: { id: true } });
  return NextResponse.json({ published: false, publishedAt: null });
}
