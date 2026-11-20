/**
 * POST /api/trivia/play/[code]/join — entra a la partida con el usuario de Nexus (sin apodos). Volver a entrar desde
 * otro dispositivo es la MISMA participación (único por partida y persona). Basta ser del equipo.
 */
import { NextResponse, type NextRequest } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { SIN_CACHE, respuestaDeError, sinTablas } from "@/lib/trivias/http";
import { unirseAPartida } from "@/lib/trivias/mutations";
import { estadoParaJugador } from "@/lib/trivias/queries";
import { normalizarCodigo } from "@/lib/trivias/reglas";

type Ctx = { params: Promise<{ code: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const faltan = await sinTablas();
  if (faltan) return faltan;
  const codigo = normalizarCodigo((await params).code);
  if (!codigo) return NextResponse.json({ error: "Ese código no es de una partida." }, { status: 404 });
  try {
    await unirseAPartida(codigo, { teamMemberId: guard.teamMember.id, nombre: guard.teamMember.name });
    const estado = await estadoParaJugador(codigo, guard.teamMember.id, new Date());
    return NextResponse.json(estado, { headers: SIN_CACHE });
  } catch (e) {
    return respuestaDeError(e);
  }
}
