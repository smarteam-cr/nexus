import { NextResponse } from "next/server";
import { guardAuditoria } from "@/lib/auditoria-portal/acceso";
import { leerFoto } from "@/lib/auditoria-portal/foto";
import { decidirHallazgos } from "@/lib/auditoria-portal/analisis/validar";
import { decidirHallazgosSchema } from "@/lib/auditoria-portal/schema";
import { actualizarFoto } from "@/lib/auditoria-portal/servidor";

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH → confirma, descarta o devuelve a «sugerido» hallazgos del análisis.
 * Lo que la IA propone nace sugerido: entra al informe solo lo que una persona confirma.
 *
 * Los ids (h1…) se renumeran en cada análisis: el pedido trae el `generadoEn` del análisis que se ve,
 * y si mientras tanto se generó otro, no se toca nada (409). Se compara con la fila bloqueada.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardAuditoria(id);
  if (g instanceof NextResponse) return g;

  const parsed = decidirHallazgosSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  if (!leerFoto(g.audit.data)?.analisis) return NextResponse.json({ error: "Esta auditoría no tiene análisis." }, { status: 409 });

  const pedido = { ...parsed.data, quien: g.ctx.teamMember.name, en: new Date().toISOString() };
  // `as`: se asigna dentro del callback; sin esto TypeScript la daría por `null` después.
  let rechazo = null as string | null;
  const foto = await actualizarFoto(id, (f) => {
    const r = decidirHallazgos(f.analisis, pedido);
    if (!r.ok) {
      rechazo = r.error;
      return f;
    }
    return { ...f, analisis: r.analisis };
  });
  if (!foto) return NextResponse.json({ error: "Auditoría no encontrada" }, { status: 404 });
  if (rechazo) return NextResponse.json({ error: rechazo }, { status: 409 });
  return NextResponse.json({ ok: true });
}
