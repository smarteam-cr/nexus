/**
 * PUT    /api/trivia/[id] — guarda el título y TODAS las preguntas (las partidas jugadas no cambian: tienen su copia).
 * DELETE /api/trivia/[id] — borra la trivia; sus partidas quedan en el historial.
 * Las dos piden `trivias.write` y ser quien la creó (si no, 404).
 */
import { NextResponse, type NextRequest } from "next/server";
import { guardPermission } from "@/lib/auth/api-guards";
import { errorDeValidacion, leerCuerpo, respuestaDeError, sinTablas } from "@/lib/trivias/http";
import { borrarTrivia, guardarTrivia } from "@/lib/trivias/mutations";
import { TriviaInput } from "@/lib/trivias/schema";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Ctx) {
  const guard = await guardPermission("trivias", "write");
  if (guard instanceof NextResponse) return guard;
  const faltan = await sinTablas();
  if (faltan) return faltan;
  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = TriviaInput.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);
  const { id } = await params;
  try {
    await guardarTrivia(id, parsed.data, guard.teamMember.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respuestaDeError(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const guard = await guardPermission("trivias", "write");
  if (guard instanceof NextResponse) return guard;
  const faltan = await sinTablas();
  if (faltan) return faltan;
  const { id } = await params;
  try {
    await borrarTrivia(id, guard.teamMember.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respuestaDeError(e);
  }
}
