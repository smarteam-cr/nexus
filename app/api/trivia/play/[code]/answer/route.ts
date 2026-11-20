/**
 * POST /api/trivia/play/[code]/answer — la respuesta del jugador a la pregunta abierta. Una sola vez y dentro del
 * tiempo, medido con el reloj del SERVIDOR (lib/trivias/reglas.ts › evaluarRespuesta): fuera de tiempo o repetida es
 * un 409. Basta ser del equipo.
 */
import { NextResponse, type NextRequest } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { errorDeValidacion, leerCuerpo, respuestaDeError, sinTablas } from "@/lib/trivias/http";
import { responder } from "@/lib/trivias/mutations";
import { normalizarCodigo } from "@/lib/trivias/reglas";
import { ResponderInput } from "@/lib/trivias/schema";

type Ctx = { params: Promise<{ code: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  // La hora es la de la respuesta COMPLETA (el cuerpo ya leído) y se toma antes de la guarda y de la base: lo que tardan
  // no le resta tiempo a nadie, y un envío que empieza con la pregunta abierta y termina después de ver la correcta no
  // cuenta como «a tiempo». (El portero ya exige sesión antes de llegar acá.)
  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const ahora = new Date();
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const faltan = await sinTablas();
  if (faltan) return faltan;
  const codigo = normalizarCodigo((await params).code);
  if (!codigo) return NextResponse.json({ error: "Ese código no es de una partida." }, { status: 404 });
  const parsed = ResponderInput.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);
  try {
    await responder(codigo, guard.teamMember.id, parsed.data, ahora);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respuestaDeError(e);
  }
}
