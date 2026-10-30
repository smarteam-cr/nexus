/**
 * PUT /api/projects/[projectId]/artefactos/orden — el orden de los documentos de un tipo (arrastrar de arriba abajo;
 * etapa V3 de docs/artefactos-plan.md). Vienen TODOS los del tipo, cada uno una vez; si la lista cambió, 409.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { ErrorDelArtefacto, ordenarDelTipo } from "@/lib/artefactos/copias-server";

type Params = Promise<{ projectId: string }>;

const cuerpo = z.strictObject({ tipo: z.string().min(1).max(40), ids: z.array(z.string().min(1).max(60)).min(1).max(100) });

export async function PUT(req: NextRequest, { params }: { params: Params }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const parsed = cuerpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return cuerpoInvalido(parsed.error);
  try {
    await ordenarDelTipo(projectId, parsed.data.tipo, parsed.data.ids);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ErrorDelArtefacto) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[artefactos] ordenar:", e);
    return NextResponse.json({ error: "No se pudo guardar el orden. Inténtalo de nuevo." }, { status: 500 });
  }
}
