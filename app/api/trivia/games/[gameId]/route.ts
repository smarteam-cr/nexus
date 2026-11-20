/**
 * GET /api/trivia/games/[gameId] — el estado en vivo para la pantalla del anfitrión (la consulta cada segundo).
 * Pide `trivias.read` y ser quien conduce la partida (si no, 404). Las correctas y cuántos eligieron cada opción solo
 * viajan con la pregunta cerrada: la pantalla se proyecta.
 */
import { NextResponse, type NextRequest } from "next/server";
import { guardPermission } from "@/lib/auth/api-guards";
import { SIN_CACHE, respuestaDeError, sinTablas } from "@/lib/trivias/http";
import { estadoParaAnfitrion } from "@/lib/trivias/queries";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ gameId: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const guard = await guardPermission("trivias", "read");
  if (guard instanceof NextResponse) return guard;
  const faltan = await sinTablas();
  if (faltan) return faltan;
  const { gameId } = await params;
  try {
    const estado = await estadoParaAnfitrion(gameId, guard.teamMember.id, new Date());
    if (!estado) return NextResponse.json({ error: "No encontramos esa partida." }, { status: 404 });
    return NextResponse.json(estado, { headers: SIN_CACHE });
  } catch (e) {
    return respuestaDeError(e);
  }
}
