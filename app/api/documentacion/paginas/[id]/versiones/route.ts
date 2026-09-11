import { NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { versionesDe } from "@/lib/documentacion/consultas";

/**
 * GET /api/documentacion/paginas/[id]/versiones — el historial de una página.
 *
 * Devuelve las fotos guardadas (sin su contenido, que es lo pesado): cuándo, quién y por qué.
 * El contenido de una versión se trae al restaurarla.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const versiones = await versionesDe(id);
  return NextResponse.json({ versiones });
}
