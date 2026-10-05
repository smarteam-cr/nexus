/**
 * POST /api/feedback/temas — un tema nuevo a mano («Nuevo tema» de la hoja de ruta). Solo quien revisa.
 *
 * Para lo que alguien dijo en una sesión o lo que vio dirección. Entra en «Por decidir» salvo que se
 * elija otra columna.
 */
import { NextRequest, NextResponse } from "next/server";
import { errorDeValidacion, guardRevisorDeFeedback, leerCuerpo, sinTablas } from "@/lib/feedback/http";
import { crearTema } from "@/lib/feedback/mutations";
import { CrearTema } from "@/lib/feedback/schema";

export async function POST(req: NextRequest) {
  const guard = await guardRevisorDeFeedback();
  if (guard instanceof NextResponse) return guard;
  const faltan = sinTablas();
  if (faltan) return faltan;

  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = CrearTema.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);

  const tema = await crearTema(parsed.data, guard.user.email);
  return NextResponse.json({ tema }, { status: 201 });
}
