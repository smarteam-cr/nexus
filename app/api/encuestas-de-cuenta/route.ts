/**
 * Feedback › Encuestas › Sobre los clientes (2026-10-13). Solo dirección.
 * GET   → cada pregunta sobre la cuenta con si está activa y sus resultados (la última respuesta de cada persona).
 * PATCH { clave, activa } → la prende o la apaga.
 */
import { NextResponse, type NextRequest } from "next/server";
import { guardRevisorDeFeedback } from "@/lib/feedback/http";
import { activaSchema } from "@/lib/encuestas-de-cuenta/schema";
import {
  cambiarActiva,
  ErrorDePreguntas,
  preguntasDeCuentaDisponible,
  resumenDePreguntas,
  SQL_DE_PREGUNTAS_DE_CUENTA,
} from "@/lib/encuestas-de-cuenta/servidor";

function sinTablas(): NextResponse | null {
  if (preguntasDeCuentaDisponible()) return null;
  return NextResponse.json(
    { error: `Las preguntas sobre los clientes todavía no están disponibles: falta aplicar ${SQL_DE_PREGUNTAS_DE_CUENTA}.` },
    { status: 503 },
  );
}

export async function GET() {
  const guard = await guardRevisorDeFeedback();
  if (guard instanceof NextResponse) return guard;
  const faltan = sinTablas();
  if (faltan) return faltan;
  return NextResponse.json({ preguntas: await resumenDePreguntas() }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(req: NextRequest) {
  const guard = await guardRevisorDeFeedback();
  if (guard instanceof NextResponse) return guard;
  const faltan = sinTablas();
  if (faltan) return faltan;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const parsed = activaSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  try {
    await cambiarActiva(parsed.data.clave, parsed.data.activa, guard.user.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ErrorDePreguntas) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
