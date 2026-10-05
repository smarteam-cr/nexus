import { NextResponse } from "next/server";
import { guardAuditoria } from "@/lib/auditoria-portal/acceso";
import { leerFoto } from "@/lib/auditoria-portal/foto";
import { decidirHallazgosSchema } from "@/lib/auditoria-portal/schema";
import { actualizarFoto } from "@/lib/auditoria-portal/servidor";

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH → confirma, descarta o devuelve a «sugerido» hallazgos del análisis.
 * Lo que la IA propone nace sugerido: entra al informe solo lo que una persona confirma.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardAuditoria(id);
  if (g instanceof NextResponse) return g;

  const parsed = decidirHallazgosSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  if (!leerFoto(g.audit.data)?.analisis) return NextResponse.json({ error: "Esta auditoría no tiene análisis." }, { status: 409 });

  const { ids, estado } = parsed.data;
  const quien = g.ctx.teamMember.name;
  const en = new Date().toISOString();
  const foto = await actualizarFoto(id, (f) => {
    if (!f.analisis) return f;
    return {
      ...f,
      analisis: {
        ...f.analisis,
        hallazgos: f.analisis.hallazgos.map((h) => {
          if (!ids.includes(h.id)) return h;
          if (estado === "sugerido") return { ...h, estado, decididoPor: undefined, decididoEn: undefined };
          return { ...h, estado, decididoPor: quien, decididoEn: en };
        }),
      },
    };
  });
  if (!foto) return NextResponse.json({ error: "Auditoría no encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
