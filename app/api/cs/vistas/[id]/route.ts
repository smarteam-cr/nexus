/**
 * DELETE /api/cs/vistas/[id]
 *
 * Borra una vista guardada de la pestaña «Cartera» (2026-10-09, entrega 3). Solo quien la creó: las vistas son
 * compartidas y una persona no le borra la suya a otra.
 */
import { NextResponse } from "next/server";
import { guardLiderDeCs } from "@/lib/auth/api-guards";
import { borrarVista } from "@/lib/cs/vistas-de-cartera-server";
import { faltaLaTabla } from "@/lib/cs/clasificacion-server";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardLiderDeCs();
  if (guard instanceof NextResponse) return guard;
  try {
    const r = await borrarVista(id, guard.user.email ?? "");
    if (r === "no-existe") return NextResponse.json({ error: "La vista ya no existe." }, { status: 404 });
    if (r === "no-es-tuya") return NextResponse.json({ error: "Solo quien creó la vista la puede borrar." }, { status: 403 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (faltaLaTabla(e)) {
      return NextResponse.json({ error: "Falta aplicar el SQL de la cartera (scripts/sql/2026-10-09-cartera-de-la-csl.sql)." }, { status: 503 });
    }
    throw e;
  }
}
