import { NextResponse } from "next/server";
import { guardAuditoria } from "@/lib/auditoria-portal/acceso";
import { leerFoto } from "@/lib/auditoria-portal/foto";
import { analizarAuditoria } from "@/lib/auditoria-portal/servidor";

type Params = { params: Promise<{ id: string }> };

/**
 * POST → vuelve a generar el análisis con IA sobre la foto ya capturada, en segundo plano.
 * Lo decidido en el análisis anterior (confirmados, descartados) no pasa al nuevo: son otros
 * hallazgos. El análisis y su prompt: lib/auditoria-portal/analisis/.
 */
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardAuditoria(id);
  if (g instanceof NextResponse) return g;

  const foto = leerFoto(g.audit.data);
  if (!foto?.lifecycleStats) {
    return NextResponse.json({ error: "Esta auditoría no tiene datos para analizar. Vuelve a correrla." }, { status: 409 });
  }
  if (foto.estado === "capturando" || foto.estado === "analizando") {
    return NextResponse.json({ error: "La auditoría ya se está armando." }, { status: 409 });
  }

  void analizarAuditoria(id, g.ctx.teamMember.email).catch((e) =>
    console.error("[auditoria] el análisis reventó fuera de su try:", e instanceof Error ? e.message : String(e)),
  );
  return NextResponse.json({ ok: true }, { status: 202 });
}
