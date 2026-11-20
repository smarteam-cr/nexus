/**
 * POST /api/trivia/games/[gameId]/advance — los botones del anfitrión: empezar, cerrar la pregunta, mostrar
 * resultados, siguiente pregunta y terminar. `desde` es lo que tiene en pantalla: si la partida ya cambió, 409.
 * Pide `trivias.write` y ser quien conduce la partida.
 */
import { NextResponse, type NextRequest } from "next/server";
import { guardPermission } from "@/lib/auth/api-guards";
import { errorDeValidacion, leerCuerpo, respuestaDeError, sinTablas } from "@/lib/trivias/http";
import { avanzarPartida } from "@/lib/trivias/mutations";
import { AvanzarInput } from "@/lib/trivias/schema";

type Ctx = { params: Promise<{ gameId: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const guard = await guardPermission("trivias", "write");
  if (guard instanceof NextResponse) return guard;
  const faltan = await sinTablas();
  if (faltan) return faltan;
  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = AvanzarInput.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);
  const { gameId } = await params;
  try {
    await avanzarPartida(gameId, guard.teamMember.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respuestaDeError(e);
  }
}
