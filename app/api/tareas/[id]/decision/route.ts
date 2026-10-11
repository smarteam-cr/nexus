/**
 * POST /api/tareas/[id]/decision — decidir una propuesta: Usar · Más adelante · Descartar · No es mía · Es esa · Retirar.
 *
 * Decide quien la recibe (o el líder, en un pedido a su equipo); retira quien la pidió. Es un UPDATE con
 * `estado='propuesta' AND version=?`: si otra persona ya la decidió, 409.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { errorDeValidacion, leerCuerpo, prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { decidirTarea } from "@/lib/tareas/mutaciones";
import { DecidirTarea } from "@/lib/tareas/schema";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = DecidirTarea.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);
  const { id } = await params;
  try {
    await decidirTarea(p.ctx, p.clientes, id, parsed.data.version, parsed.data.decision);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respuestaDeError(e);
  }
}
