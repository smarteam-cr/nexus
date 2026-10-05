/**
 * PATCH /api/feedback/pedidos/[id] — quien recibió un pedido de opinión lo vio, o dijo «Ahora no».
 *
 * Solo la persona a quien se le pidió. Responder no pasa por acá: es mandar un reporte con el pedido
 * (POST /api/feedback con `pedidoId`).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { errorDeValidacion, leerCuerpo, respuestaDeError, sinTablas } from "@/lib/feedback/http";
import { marcarPedido } from "@/lib/feedback/mutations";
import { MarcarPedido } from "@/lib/feedback/schema";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const faltan = sinTablas();
  if (faltan) return faltan;

  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = MarcarPedido.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);

  const { id } = await params;
  try {
    await marcarPedido(id, guard.user.email, parsed.data.accion);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respuestaDeError(e);
  }
}
