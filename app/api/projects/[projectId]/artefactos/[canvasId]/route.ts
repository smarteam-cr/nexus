/**
 * PATCH  /api/projects/[projectId]/artefactos/[canvasId] — cambiar el nombre o el estado (en construcción / terminado) de
 *        un documento de un tipo, también el de siempre.
 * DELETE /api/projects/[projectId]/artefactos/[canvasId] — archivar una COPIA: sale del riel y de lo que leen los agentes,
 *        sin borrar nada, y su enlace deja de abrir. El documento de siempre no se archiva desde acá.
 *
 * Etapa V3 de docs/artefactos-plan.md. Con el acceso al proyecto, como editar un documento.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { triggeredByEmail } from "@/lib/agents/triggered-by";
import { archivarCopia, ErrorDelArtefacto, marcarTerminado, renombrarArtefacto } from "@/lib/artefactos/copias-server";

type Params = Promise<{ projectId: string; canvasId: string }>;

const cuerpo = z.union([z.strictObject({ nombre: z.string().min(1).max(200) }), z.strictObject({ terminado: z.boolean() })]);

function respuestaDeError(e: unknown, que: string) {
  if (e instanceof ErrorDelArtefacto) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(`[artefactos] ${que}:`, e);
  return NextResponse.json({ error: "No se pudo guardar. Inténtalo de nuevo." }, { status: 500 });
}

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const { projectId, canvasId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const parsed = cuerpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return cuerpoInvalido(parsed.error);
  try {
    if ("nombre" in parsed.data) return NextResponse.json(await renombrarArtefacto(projectId, canvasId, parsed.data.nombre));
    return NextResponse.json(await marcarTerminado(projectId, canvasId, parsed.data.terminado, await triggeredByEmail()));
  } catch (e) {
    return respuestaDeError(e, "editar");
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Params }) {
  const { projectId, canvasId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  try {
    await archivarCopia(projectId, canvasId, await triggeredByEmail());
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respuestaDeError(e, "archivar");
  }
}
