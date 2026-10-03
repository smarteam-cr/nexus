/**
 * /api/projects/[projectId]/publish-planificacion — compartir la PLANIFICACIÓN con el cliente
 * (2026-10-02). Mismo token y misma contraseña que las otras superficies; `?next=planificacion`
 * decide dónde aterriza. Congela un snapshot al publicar (ver lib/projects/publicar-documento.ts).
 *
 *   GET    → { published, publishedAt, clientUrl, hasAccess }
 *   POST   → compartir (congela el snapshot + planificacionPublishedAt = now)
 *   DELETE → dejar de compartir (planificacionPublishedAt = null)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject, guardPublicacionDeProyecto } from "@/lib/auth/api-guards";
import { despublicarDocumento, estadoDePublicacion, publicarDocumento } from "@/lib/projects/publicar-documento";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  return estadoDePublicacion(new URL(req.url).origin, projectId, "planificacion");
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  // Publicar exige, además del acceso, que el proyecto ADMITA publicación externa.
  const guard = await guardPublicacionDeProyecto(projectId);
  if (guard instanceof NextResponse) return guard;
  return publicarDocumento(projectId, "planificacion");
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  /* ⚠ `guardAccessToProject`, NO `guardPublicacionDeProyecto`: despublicar no se gatea nunca.
     Si el proyecto pasa a no-publicable después de compartir, gatearlo dejaría contenido publicado
     y sin salida. */
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  return despublicarDocumento(projectId, "planificacion");
}
