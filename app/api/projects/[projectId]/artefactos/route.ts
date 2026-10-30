/**
 * POST /api/projects/[projectId]/artefactos — crear otra copia de un tipo en el proyecto (etapa V3 de
 * docs/artefactos-plan.md): en blanco con una plantilla, o duplicando otro documento del mismo tipo.
 *
 * Crear una copia no gasta IA ni pisa nada: alcanza con el acceso al proyecto, como editar un documento. Generarla con IA
 * pide la celda del tipo (./[canvasId]/generar).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { triggeredByEmail } from "@/lib/agents/triggered-by";
import { crearCopia, ErrorDelArtefacto } from "@/lib/artefactos/copias-server";

type Params = Promise<{ projectId: string }>;

const cuerpo = z.strictObject({
  tipo: z.string().min(1).max(40),
  plantillaId: z.string().min(1).max(80).nullish(),
  nombre: z.string().max(200).nullish(),
  desdeCanvasId: z.string().min(1).max(60).nullish(),
});

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const parsed = cuerpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return cuerpoInvalido(parsed.error);

  try {
    const copia = await crearCopia({ projectId, ...parsed.data, porEmail: await triggeredByEmail() });
    return NextResponse.json(copia, { status: 201 });
  } catch (e) {
    if (e instanceof ErrorDelArtefacto) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[artefactos] crear:", e);
    return NextResponse.json({ error: "No se pudo crear. Inténtalo de nuevo." }, { status: 500 });
  }
}
