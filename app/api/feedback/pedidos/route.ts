/**
 * POST /api/feedback/pedidos — dirección le pide la opinión a alguien sobre una pantalla. Solo quien revisa.
 *
 * A la persona le aparece una vez al entrar a esa pantalla, hasta que responda o diga «Ahora no». No le
 * llega correo. (Lo que le pidieron a uno lo lee GET /api/feedback.)
 */
import { NextRequest, NextResponse } from "next/server";
import { errorDeValidacion, guardRevisorDeFeedback, leerCuerpo, sinTablas } from "@/lib/feedback/http";
import { crearPedidos } from "@/lib/feedback/mutations";
import { CrearPedido } from "@/lib/feedback/schema";

export async function POST(req: NextRequest) {
  const guard = await guardRevisorDeFeedback();
  if (guard instanceof NextResponse) return guard;
  const faltan = sinTablas();
  if (faltan) return faltan;

  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = CrearPedido.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);

  const creados = await crearPedidos(parsed.data, guard.user.email);
  return NextResponse.json({ creados }, { status: 201 });
}
