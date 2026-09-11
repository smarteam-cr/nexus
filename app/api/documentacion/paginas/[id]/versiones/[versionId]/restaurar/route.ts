import { NextResponse } from "next/server";
import { guardPermission } from "@/lib/auth/api-guards";
import { paginaPorId, restaurarVersion } from "@/lib/documentacion/consultas";
import { puedeEditarPagina } from "@/lib/documentacion/permisos";

/**
 * POST /api/documentacion/paginas/[id]/versiones/[versionId]/restaurar — vuelve a una versión.
 *
 * Antes de pisar lo que hay, guarda una foto de lo actual: restaurar también se puede deshacer.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const guard = await guardPermission("documentacion", "write");
  if (guard instanceof NextResponse) return guard;

  const { id, versionId } = await params;
  const pagina = await paginaPorId(id);
  if (!pagina || pagina.archivadaAt) {
    return NextResponse.json({ error: "La página no existe." }, { status: 404 });
  }
  if (!(await puedeEditarPagina(guard.teamMember, pagina))) {
    return NextResponse.json(
      { error: "Esta página está bloqueada: la edita el liderazgo." },
      { status: 403 },
    );
  }

  const r = await restaurarVersion({ paginaId: id, versionId, email: guard.user.email });
  if (!r.ok) return NextResponse.json({ error: r.motivo }, { status: 404 });
  return NextResponse.json({ ok: true });
}
