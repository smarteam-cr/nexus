import { NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { papelera } from "@/lib/documentacion/consultas";

/**
 * GET /api/documentacion/papelera — las páginas archivadas.
 *
 * Archivar no borra: la rama entera queda con un mismo lote y se restaura igual (el POST de
 * restaurar está en `papelera/restaurar`, que sí pide permiso). Mirar la papelera es de todo el
 * equipo interno, como leer cualquier página.
 */
export async function GET() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;

  const paginas = await papelera();
  return NextResponse.json({ paginas });
}
