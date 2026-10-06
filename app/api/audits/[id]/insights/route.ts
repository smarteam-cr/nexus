import { NextResponse } from "next/server";
import { guardAuditoria } from "@/lib/auditoria-portal/acceso";
import { leerFoto } from "@/lib/auditoria-portal/foto";
import { analizarAuditoria, tomarParaAnalizar } from "@/lib/auditoria-portal/servidor";

type Params = { params: Promise<{ id: string }> };

/**
 * POST → vuelve a generar el análisis con IA sobre la foto ya capturada, en segundo plano.
 * Lo decidido en el análisis anterior (confirmados, descartados) no pasa al nuevo: son otros
 * hallazgos. El análisis y su prompt: lib/auditoria-portal/analisis/.
 *
 * ⛔ Uno a la vez (2026-10-05): la auditoría se TOMA con la fila bloqueada (`tomarParaAnalizar`) antes
 * de lanzar el análisis. Un doble clic, o dos personas a la vez, reciben 409 en vez de dos análisis.
 */
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardAuditoria(id);
  if (g instanceof NextResponse) return g;

  const foto = leerFoto(g.audit.data);
  if (!foto?.lifecycleStats) {
    return NextResponse.json({ error: "Esta auditoría no tiene datos para analizar. Vuelve a correrla." }, { status: 409 });
  }
  if (!(await tomarParaAnalizar(id))) {
    return NextResponse.json({ error: "Ya se está generando el análisis de esta auditoría: la página se actualiza sola." }, { status: 409 });
  }

  void analizarAuditoria(id, g.ctx.teamMember.email).catch((e) =>
    console.error("[auditoria] el análisis reventó fuera de su try:", e instanceof Error ? e.message : String(e)),
  );
  return NextResponse.json({ ok: true }, { status: 202 });
}
