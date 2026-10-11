/**
 * POST /api/tareas/lecturas/[id]/conversacion — «¿Faltó algo?»: leer la conversación de una reunión ya leída
 * (docs/tareas-plan.md §7.3). Solo quien puede leer esa reunión, una vez por reunión (se reintenta si falló). Corre en
 * segundo plano (`after`): la pantalla consulta /api/tareas/lecturas/[id] hasta que termina.
 */
import { after, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { pedirConversacion, procesarConversacion } from "@/lib/tareas/lectura";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const { id } = await params;
  try {
    const r = await pedirConversacion(p.ctx, p.clientes, id);
    if (r.tomada) after(() => procesarConversacion(r.id));
    return NextResponse.json({ id: r.id, estado: r.estado });
  } catch (e) {
    return respuestaDeError(e);
  }
}
