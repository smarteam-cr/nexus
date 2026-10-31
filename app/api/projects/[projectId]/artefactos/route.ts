/**
 * POST /api/projects/[projectId]/artefactos — crear un documento de un tipo en el proyecto (etapa V3 de
 * docs/artefactos-plan.md): en blanco con una plantilla, o duplicando otro documento del mismo tipo. El primero de un tipo es
 * su documento de siempre (lib/artefactos/adoptar-server.ts); los siguientes, copias.
 *
 * Crear una copia no gasta IA ni pisa nada: alcanza con el acceso al proyecto, como editar un documento. Generarla con IA
 * pide la celda del tipo (./[canvasId]/generar).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAccessToProject, guardProjectHandoffAccess } from "@/lib/auth/api-guards";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { triggeredByEmail } from "@/lib/agents/triggered-by";
import { adoptarElDeSiempre } from "@/lib/artefactos/adoptar-server";
import { crearCopia, ErrorDelArtefacto } from "@/lib/artefactos/copias-server";

type Params = Promise<{ projectId: string }>;

const cuerpo = z.strictObject({
  tipo: z.string().min(1).max(40),
  plantillaId: z.string().min(1).max(80).nullish(),
  nombre: z.string().max(200).nullish(),
  desdeCanvasId: z.string().min(1).max(60).nullish(),
  conLosSueltos: z.boolean().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const parsed = cuerpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return cuerpoInvalido(parsed.error);
  // Mover los cuestionarios del proyecto pide lo mismo que editarlos.
  if (parsed.data.conLosSueltos) {
    const permiso = await guardProjectHandoffAccess(projectId);
    if (permiso instanceof NextResponse) return permiso;
  }

  try {
    const porEmail = await triggeredByEmail();
    const copia = (parsed.data.desdeCanvasId ? null : await adoptarElDeSiempre({ projectId, ...parsed.data, porEmail })) ?? (await crearCopia({ projectId, ...parsed.data, porEmail }));
    return NextResponse.json(copia, { status: 201 });
  } catch (e) {
    if (e instanceof ErrorDelArtefacto) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[artefactos] crear:", e);
    return NextResponse.json({ error: "No se pudo crear. Inténtalo de nuevo." }, { status: 500 });
  }
}
