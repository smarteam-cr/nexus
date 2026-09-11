import { NextRequest, NextResponse } from "next/server";
import { guardPermission } from "@/lib/auth/api-guards";
import { restaurarLote } from "@/lib/documentacion/consultas";

/**
 * POST /api/documentacion/papelera/restaurar — devuelve al árbol un grupo archivado.
 *
 * Se restaura por LOTE y no por página: archivar se llevó la rama entera, y devolver solo la
 * madre dejaría a las hijas invisibles en la papelera. Si la madre de alguna sigue archivada,
 * esa página vuelve a la raíz — preferible verla en el lugar equivocado a devolverla a un lugar
 * que no existe.
 */
export async function POST(req: NextRequest) {
  const guard = await guardPermission("documentacion", "manage");
  if (guard instanceof NextResponse) return guard;

  let body: { lote?: unknown };
  try {
    body = (await req.json()) as { lote?: unknown };
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  if (typeof body.lote !== "string" || !body.lote) {
    return NextResponse.json({ error: "Falta `lote`." }, { status: 400 });
  }

  const r = await restaurarLote(body.lote);
  if (!r.ok) return NextResponse.json({ error: r.motivo }, { status: 404 });
  return NextResponse.json({ ok: true, cuantas: r.cuantas });
}
