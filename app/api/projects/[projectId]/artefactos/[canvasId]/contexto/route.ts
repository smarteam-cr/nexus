/**
 * /api/projects/[projectId]/artefactos/[canvasId]/contexto — las reuniones elegidas de una COPIA (etapa V3b de
 * docs/artefactos-plan.md). GET lista las del proyecto; PUT guarda las elegidas, con la celda de generar ese tipo. Las notas
 * van por /contexto/copia-<canvasId>/notas y las instrucciones por /doc-brief.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAccessToProject, guardContextoDelDocumento } from "@/lib/auth/api-guards";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { prisma } from "@/lib/db/prisma";
import { copiaDelProyecto, reunionesDelProyecto, reunionesParaElegir } from "@/lib/artefactos/contexto-server";
import { conReunionesDeLaCopia, TOPE_DE_REUNIONES_DE_LA_COPIA } from "@/lib/artefactos/contexto-de-la-copia";
import type { SeccionConContexto } from "@/lib/contexto/documento";
import type { Prisma } from "@prisma/client";

type Params = Promise<{ projectId: string; canvasId: string }>;

const cuerpo = z.strictObject({ reuniones: z.array(z.string().min(1).max(200)).max(TOPE_DE_REUNIONES_DE_LA_COPIA) });

const noEsCopia = () => NextResponse.json({ error: "Ese documento no es una copia de este proyecto." }, { status: 404 });

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { projectId, canvasId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const copia = await copiaDelProyecto(projectId, canvasId);
  if (!copia) return noEsCopia();
  const [reuniones, puede] = await Promise.all([reunionesParaElegir(projectId, canvasId), guardContextoDelDocumento(projectId, copia.tipo.permiso as SeccionConContexto)]);
  return reuniones ? NextResponse.json({ reuniones, puedeEditar: !(puede instanceof NextResponse) }) : noEsCopia();
}

export async function PUT(req: NextRequest, { params }: { params: Params }) {
  const { projectId, canvasId } = await params;
  const acceso = await guardAccessToProject(projectId);
  if (acceso instanceof NextResponse) return acceso;
  const copia = await copiaDelProyecto(projectId, canvasId);
  if (!copia) return noEsCopia();
  const guard = await guardContextoDelDocumento(projectId, copia.tipo.permiso as SeccionConContexto);
  if (guard instanceof NextResponse) return guard;
  const parsed = cuerpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return cuerpoInvalido(parsed.error);

  const reuniones = await reunionesDelProyecto(projectId, parsed.data.reuniones);
  await prisma.projectCanvas.update({
    where: { id: canvasId },
    data: { sections: conReunionesDeLaCopia(copia.sections, reuniones) as unknown as Prisma.InputJsonValue },
  });
  return NextResponse.json({ reuniones });
}
