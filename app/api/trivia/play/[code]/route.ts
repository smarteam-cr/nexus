/**
 * GET /api/trivia/play/[code] — el estado en vivo para el teléfono del jugador (lo consulta cada segundo y medio).
 * Jugar NO pide la sección `trivias`: basta ser del equipo (guardInternalUser). Nunca manda las correctas con la
 * pregunta abierta, ni el resultado de la respuesta propia hasta que la pregunta cierra.
 */
import { NextResponse, type NextRequest } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { SIN_CACHE, respuestaDeError, sinTablas } from "@/lib/trivias/http";
import { estadoParaJugador } from "@/lib/trivias/queries";
import { normalizarCodigo } from "@/lib/trivias/reglas";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const faltan = await sinTablas();
  if (faltan) return faltan;
  const codigo = normalizarCodigo((await params).code);
  if (!codigo) return NextResponse.json({ error: "Ese código no es de una partida." }, { status: 404 });
  try {
    const estado = await estadoParaJugador(codigo, guard.teamMember.id, new Date());
    if (!estado) return NextResponse.json({ error: "No hay una partida con ese código." }, { status: 404 });
    return NextResponse.json(estado, { headers: SIN_CACHE });
  } catch (e) {
    return respuestaDeError(e);
  }
}
