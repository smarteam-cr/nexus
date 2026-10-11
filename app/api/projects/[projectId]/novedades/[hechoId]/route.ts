/**
 * PATCH /api/projects/[projectId]/novedades/[hechoId] — decidir una novedad de un documento (memoria de la cuenta,
 * etapa 6). Cuerpo: `{ accion: "usar" | "desestimar", pieza, nota?, reemplazaAId? }`.
 *
 *   · «usar»       — el acuerdo del chat que la llevaba se aplicó, o la persona marcó «Listo» porque ya la cambió.
 *   · «desestimar» — «No aplica». No vuelve.
 *
 * Decide las secciones pendientes de ESE documento en el hecho, y queda escrito quién y cuándo en el propio hecho. La
 * escritura va por `decidirDestinoDeHecho` (lib/seguimiento/hechos-server.ts, el único escritor).
 *
 * Guard: la celda de generar ese documento (`guardContextoDelDocumento`), la misma que cura sus reuniones: quien puede
 * cambiar el documento decide lo que le proponen. El hecho tiene que ser del proyecto (404 si no).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardContextoDelDocumento } from "@/lib/auth/api-guards";
import { documentoConContexto } from "@/lib/contexto/documento";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { decidirNovedad } from "@/lib/seguimiento/novedades-server";
import { DecisionDeNovedad } from "@/lib/seguimiento/schema";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ projectId: string; hechoId: string }> }) {
  const { projectId, hechoId } = await params;
  const parsed = DecisionDeNovedad.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Falta qué hacer con la novedad (usar o desestimar) y de qué documento es." }, { status: 400 });
  const doc = documentoConContexto(parsed.data.pieza);
  if (!doc) return NextResponse.json({ error: "Ese documento no recibe novedades." }, { status: 404 });
  const guard = await guardContextoDelDocumento(projectId, doc.seccion);
  if (guard instanceof NextResponse) return guard;
  const quien = (guard.teamMember.email ?? guard.user.email ?? "").toLowerCase();
  if (!quien) return NextResponse.json({ error: "No sabemos quién eres." }, { status: 401 });
  try {
    const r = await decidirNovedad({
      projectId,
      hechoId,
      pieza: parsed.data.pieza,
      accion: parsed.data.accion,
      quien,
      nota: parsed.data.nota ?? null,
      reemplazaAId: parsed.data.reemplazaAId ?? null,
    });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, decididos: r.decididos });
  } catch (e) {
    if (esquemaDesactualizado(e)) {
      return NextResponse.json({ error: "A la base le falta el SQL de los hechos. Corre npm run check:esquema." }, { status: 503 });
    }
    throw e;
  }
}
