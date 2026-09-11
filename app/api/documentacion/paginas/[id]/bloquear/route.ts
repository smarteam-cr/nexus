import { NextRequest, NextResponse } from "next/server";
import { guardPermission } from "@/lib/auth/api-guards";
import { cambiarBloqueo, paginaPorId } from "@/lib/documentacion/consultas";
import { CambiarBloqueo } from "@/lib/documentacion/esquema";

/**
 * POST /api/documentacion/paginas/[id]/bloquear — pone o saca el candado.
 *
 * Una página bloqueada solo la edita `documentacion.manage`, y tampoco acepta subpáginas nuevas.
 * Es lo que protege al reglamento de la Escala y al manual de Nexus de un cambio sin querer, sin
 * volverlos intocables: se desbloquean con un clic.
 *
 * Poner y sacar el candado es, por definición, de quien ordena la base: `manage`.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardPermission("documentacion", "manage");
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const pagina = await paginaPorId(id);
  if (!pagina) return NextResponse.json({ error: "La página no existe." }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const parsed = CambiarBloqueo.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Falta `bloqueada` (booleano)." }, { status: 400 });
  }

  const actualizada = await cambiarBloqueo(id, parsed.data.bloqueada, guard.user.email);
  return NextResponse.json({ bloqueada: actualizada.bloqueada });
}
