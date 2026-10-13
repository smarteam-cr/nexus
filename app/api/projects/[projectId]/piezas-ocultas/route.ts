import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { esPiezaOcultable, conPiezaOculta } from "@/lib/pieces/piezas-ocultas";

/**
 * app/api/projects/[projectId]/piezas-ocultas — ocultar o mostrar una pieza del riel del proyecto
 * (2026-10-12, pedido de Elías). No borra nada ni apaga la pieza: queda en «Ver N piezas más».
 *
 * Es del proyecto (lo ve todo el equipo igual) y cosmético: lo puede cambiar cualquiera con acceso al
 * proyecto. Devuelve la lista nueva.
 */

type Params = Promise<{ projectId: string }>;

const cuerpo = z.strictObject({ slug: z.string().min(1).max(80), oculta: z.boolean() });

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const parsed = cuerpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return cuerpoInvalido(parsed.error);
  const { slug, oculta } = parsed.data;
  if (!esPiezaOcultable(slug)) return NextResponse.json({ error: "Esa pieza no se puede ocultar." }, { status: 400 });

  try {
    const piezasOcultas = await prisma.$transaction(async (tx) => {
      const p = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { piezasOcultas: true } });
      const nuevas = conPiezaOculta(p.piezasOcultas, slug, oculta);
      await tx.project.update({ where: { id: projectId }, data: { piezasOcultas: nuevas } });
      return nuevas;
    });
    return NextResponse.json({ piezasOcultas });
  } catch (e) {
    console.error("[piezas-ocultas]", e);
    return NextResponse.json({ error: "No se pudo guardar. Inténtalo de nuevo." }, { status: 500 });
  }
}
