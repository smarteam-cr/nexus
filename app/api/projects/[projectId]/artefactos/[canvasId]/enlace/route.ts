/**
 * /api/projects/[projectId]/artefactos/[canvasId]/enlace — el ENLACE PROPIO de un documento del proyecto (etapa V4 de
 * docs/artefactos-plan.md, 2026-10-29): para compartir pantalla con el cliente, sin lo interno.
 *
 *   GET    → `{ enlace, desde, ultimaVista }` (enlace null = no se comparte)
 *   POST   → compartir: crea el enlace (o uno nuevo si se había dejado de compartir) y responde el estado
 *   DELETE → dejar de compartir: el enlace deja de abrir; responde el estado (todo null)
 *
 * Puertas: GET y DELETE, el acceso al proyecto; POST, además, que el proyecto ADMITA publicación externa
 * (`guardPublicacionDeProyecto`, la misma de «Subir al cliente»: un proyecto de prueba nunca se comparte). Los documentos
 * de cada tipo no tienen una celda propia de publicar en la matriz de permisos. Dejar de compartir no se gatea nunca más
 * que por el acceso (como despublicar): si el proyecto deja de ser publicable, el enlace tiene que poder cerrarse.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAccessToProject, guardPublicacionDeProyecto } from "@/lib/auth/api-guards";
import {
  compartirArtefacto,
  dejarDeCompartirArtefacto,
  ErrorDelEnlace,
  esDocumentoDelProyecto,
  estadoDelEnlace,
} from "@/lib/artefactos/compartir-server";

type Params = { params: Promise<{ projectId: string; canvasId: string }> };

const paramsSchema = z.object({ projectId: z.string().min(1).max(64), canvasId: z.string().min(1).max(64) });

const noEncontrado = () => NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });

export async function GET(_req: NextRequest, { params }: Params) {
  const p = paramsSchema.safeParse(await params);
  if (!p.success) return NextResponse.json({ error: "Parámetros inválidos." }, { status: 400 });
  const guard = await guardAccessToProject(p.data.projectId);
  if (guard instanceof NextResponse) return guard;
  if (!(await esDocumentoDelProyecto(p.data.projectId, p.data.canvasId))) return noEncontrado();
  return NextResponse.json(await estadoDelEnlace(p.data.canvasId));
}

export async function POST(_req: NextRequest, { params }: Params) {
  const p = paramsSchema.safeParse(await params);
  if (!p.success) return NextResponse.json({ error: "Parámetros inválidos." }, { status: 400 });
  const guard = await guardPublicacionDeProyecto(p.data.projectId);
  if (guard instanceof NextResponse) return guard;
  try {
    const estado = await compartirArtefacto({
      projectId: p.data.projectId,
      clientId: guard.clientId,
      canvasId: p.data.canvasId,
      porEmail: guard.user.email ?? null,
    });
    return NextResponse.json(estado);
  } catch (e) {
    if (e instanceof ErrorDelEnlace) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const p = paramsSchema.safeParse(await params);
  if (!p.success) return NextResponse.json({ error: "Parámetros inválidos." }, { status: 400 });
  const guard = await guardAccessToProject(p.data.projectId);
  if (guard instanceof NextResponse) return guard;
  if (!(await esDocumentoDelProyecto(p.data.projectId, p.data.canvasId))) return noEncontrado();
  return NextResponse.json(await dejarDeCompartirArtefacto(p.data.canvasId, p.data.projectId));
}
