import { NextResponse } from "next/server";
import { guardPermission } from "@/lib/auth/api-guards";
import { archivarRama, contarHijas, paginaPorId } from "@/lib/documentacion/consultas";
import { puedeArchivar } from "@/lib/documentacion/permisos";

/**
 * POST /api/documentacion/paginas/[id]/archivar — manda la página a la papelera.
 *
 * Se lleva la rama entera con un mismo lote, para poder devolverla igual. NO borra: en esta base
 * no hay borrado definitivo desde la app.
 *
 * Archivar es de `documentacion.manage`, con una excepción: el borrador propio (página que creó
 * quien la archiva, sin subpáginas y sin bloquear). Sin eso, crear una página por error obliga a
 * pedirle a un líder que la saque, y la base se llena de restos.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardPermission("documentacion", "write");
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const pagina = await paginaPorId(id);
  if (!pagina || pagina.archivadaAt) {
    return NextResponse.json({ error: "La página no existe." }, { status: 404 });
  }

  const tieneHijas = (await contarHijas(id)) > 0;
  const permitido = await puedeArchivar(
    guard.teamMember,
    { ...pagina, tieneHijas },
    guard.user.email,
  );
  if (!permitido) {
    return NextResponse.json(
      {
        error: pagina.fija
          ? "Es una página del sistema: no se archiva."
          : tieneHijas
            ? "Tiene subpáginas: archivarla se las lleva, y eso lo hace el liderazgo."
            : "Archivar páginas de otra persona lo hace el liderazgo.",
      },
      { status: 403 },
    );
  }

  const r = await archivarRama(id, guard.user.email);
  if (!r.ok) return NextResponse.json({ error: r.motivo }, { status: 409 });
  return NextResponse.json({ ok: true, lote: r.lote, cuantas: r.cuantas });
}
