/**
 * POST /api/feedback/[id]/decision — qué se hace con un reporte. Solo quien revisa (SUPER_ADMIN).
 *
 * Tres salidas, más deshacer:
 *   · `llevar`     — a la hoja de ruta: a un tema que ya existe o a uno nuevo (con su columna).
 *   · `responder`  — responder y cerrar (dudas, o cuando lo que pide ya existe).
 *   · `no_se_hara` — con el motivo, que la persona ve.
 * Un reporte llega a la hoja de ruta SOLO por acá: nada entra solo.
 */
import { NextRequest, NextResponse } from "next/server";
import { errorDeValidacion, guardRevisorDeFeedback, leerCuerpo, respuestaDeError, sinTablas } from "@/lib/feedback/http";
import { decidir } from "@/lib/feedback/mutations";
import { Decidir } from "@/lib/feedback/schema";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardRevisorDeFeedback();
  if (guard instanceof NextResponse) return guard;
  const faltan = sinTablas();
  if (faltan) return faltan;

  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = Decidir.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);

  const { id } = await params;
  try {
    return NextResponse.json(await decidir(id, parsed.data, guard.user.email));
  } catch (e) {
    return respuestaDeError(e);
  }
}
