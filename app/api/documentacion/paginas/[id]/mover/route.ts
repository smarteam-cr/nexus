import { NextRequest, NextResponse } from "next/server";
import { guardPermission } from "@/lib/auth/api-guards";
import { moverPagina, paginaPorId } from "@/lib/documentacion/consultas";
import { MoverPagina } from "@/lib/documentacion/esquema";
import { puedeEditarPagina } from "@/lib/documentacion/permisos";

/**
 * POST /api/documentacion/paginas/[id]/mover — cambia de madre y/o de posición.
 *
 * El chequeo de ciclos se hace DENTRO de la transacción, con el árbol entero cargado ahí
 * (`consultas.moverPagina`): es lo que impide que dos movimientos cruzados se validen cada uno
 * contra una foto vieja y dejen una rama colgando de sí misma.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardPermission("documentacion", "write");
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const pagina = await paginaPorId(id);
  if (!pagina || pagina.archivadaAt) {
    return NextResponse.json({ error: "La página no existe." }, { status: 404 });
  }
  if (!(await puedeEditarPagina(guard.teamMember, pagina))) {
    return NextResponse.json(
      { error: "Esta página está bloqueada: la mueve el liderazgo." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const parsed = MoverPagina.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Destino inválido." },
      { status: 400 },
    );
  }

  const r = await moverPagina({ id, parentId: parsed.data.parentId, indice: parsed.data.indice });
  if (!r.ok) return NextResponse.json({ error: r.motivo }, { status: 409 });
  return NextResponse.json({ ok: true });
}
