import { NextResponse } from "next/server";
import { guardAuditoria } from "@/lib/auditoria-portal/acceso";
import { esClaveDePendiente } from "@/lib/auditoria-portal/comprobar";
import { marcarRevisadoSchema } from "@/lib/auditoria-portal/schema";
import { actualizarFoto } from "@/lib/auditoria-portal/servidor";

type Params = { params: Promise<{ id: string }> };

/** PATCH → marca (o desmarca) como revisado un pendiente de «Comprobar a mano», con quién y cuándo. */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardAuditoria(id);
  if (g instanceof NextResponse) return g;

  const parsed = marcarRevisadoSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const { clave, revisado, nota } = parsed.data;
  if (!esClaveDePendiente(clave)) return NextResponse.json({ error: "Ese pendiente no existe" }, { status: 400 });

  const por = g.ctx.teamMember.name;
  const foto = await actualizarFoto(id, (f) => {
    const comprobados = { ...(f.comprobados ?? {}) };
    if (revisado) comprobados[clave] = { por, en: new Date().toISOString(), ...(nota ? { nota } : {}) };
    else delete comprobados[clave];
    return { ...f, comprobados };
  });
  if (!foto) return NextResponse.json({ error: "Auditoría no encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
