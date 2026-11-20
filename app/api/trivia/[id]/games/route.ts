/**
 * POST /api/trivia/[id]/games — lanza una partida en vivo de la trivia: código nuevo, sala de espera y la copia de las
 * preguntas. Pide `trivias.write` y ser quien la creó: quien la lanza es el anfitrión.
 */
import { NextResponse, type NextRequest } from "next/server";
import { guardPermission } from "@/lib/auth/api-guards";
import { errorDeValidacion, leerCuerpo, respuestaDeError, sinTablas } from "@/lib/trivias/http";
import { lanzarPartida } from "@/lib/trivias/mutations";
import { LanzarInput } from "@/lib/trivias/schema";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const guard = await guardPermission("trivias", "write");
  if (guard instanceof NextResponse) return guard;
  const faltan = await sinTablas();
  if (faltan) return faltan;
  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = LanzarInput.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);
  const { id } = await params;
  try {
    const partida = await lanzarPartida(id, parsed.data.modo, guard.teamMember.id);
    return NextResponse.json(partida, { status: 201 });
  } catch (e) {
    return respuestaDeError(e);
  }
}
