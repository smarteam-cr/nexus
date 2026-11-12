/**
 * PUT /api/projects/[projectId]/orden-del-riel — el orden de la lista de artefactos del proyecto, después de arrastrar una
 * fila adentro de su grupo (Elías, 12 nov). Llegan las claves del grupo en su orden nuevo y los documentos de esas filas:
 * el orden se guarda en el proyecto (`Project.ordenDelRiel`, lo ven todos igual) y los documentos de un mismo tipo quedan,
 * además, en ese orden para quien los lee (`ordenarSegunLaLista`). Devuelve el orden guardado.
 *
 * Cosmético, como desanclar: alcanza con el acceso al proyecto.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { prisma } from "@/lib/db/prisma";
import { conOrdenDelGrupo, TOPE_DEL_ORDEN } from "@/lib/flow/grupos-del-riel";
import { ordenarSegunLaLista } from "@/lib/artefactos/copias-server";

type Params = Promise<{ projectId: string }>;

const cuerpo = z.strictObject({
  claves: z.array(z.string().min(1).max(80)).min(1).max(TOPE_DEL_ORDEN),
  documentos: z.array(z.string().min(1).max(60)).max(TOPE_DEL_ORDEN),
});

export async function PUT(req: NextRequest, { params }: { params: Params }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const parsed = cuerpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return cuerpoInvalido(parsed.error);
  try {
    const ordenDelRiel = await prisma.$transaction(async (tx) => {
      // Dos arrastres a la vez (uno en cada grupo) no se pisan: el segundo espera y lee lo que guardó el primero.
      await tx.$queryRaw`SELECT 1 FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;
      const p = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { ordenDelRiel: true } });
      const nuevo = conOrdenDelGrupo(p.ordenDelRiel, parsed.data.claves);
      await tx.project.update({ where: { id: projectId }, data: { ordenDelRiel: nuevo } });
      return nuevo;
    });
    /* El orden de quien los lee acompaña, pero no decide: la lista ya quedó guardada, y responder error haría que la
       pantalla volviera atrás algo que al recargar aparece. */
    await ordenarSegunLaLista(projectId, parsed.data.documentos).catch((e) => console.error("[orden-del-riel] orden de lectura:", e));
    return NextResponse.json({ ordenDelRiel });
  } catch (e) {
    console.error("[orden-del-riel]", e);
    return NextResponse.json({ error: "No se pudo guardar el orden. Inténtalo de nuevo." }, { status: 500 });
  }
}
