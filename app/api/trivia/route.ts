/**
 * POST /api/trivia — crea una trivia con sus preguntas. Pide `trivias.write` (por defecto solo SUPER_ADMIN).
 */
import { NextResponse, type NextRequest } from "next/server";
import { guardPermission } from "@/lib/auth/api-guards";
import { errorDeValidacion, leerCuerpo, respuestaDeError, sinTablas } from "@/lib/trivias/http";
import { crearTrivia } from "@/lib/trivias/mutations";
import { TriviaInput } from "@/lib/trivias/schema";

export async function POST(req: NextRequest) {
  const guard = await guardPermission("trivias", "write");
  if (guard instanceof NextResponse) return guard;
  const faltan = await sinTablas();
  if (faltan) return faltan;
  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = TriviaInput.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);
  try {
    const { id } = await crearTrivia(parsed.data, guard.teamMember.id);
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    return respuestaDeError(e);
  }
}
