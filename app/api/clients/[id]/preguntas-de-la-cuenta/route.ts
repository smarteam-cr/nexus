/**
 * Preguntas sobre la cuenta (2026-10-13): lo que Customer Success sabe de un cliente, preguntado al entrar a su ficha.
 *
 * GET  → { pregunta } la que le toca a quien entra, o null (el servidor decide: rol, cliente de cartera, activa, y
 *        cuándo volver a preguntar). Nunca falla por falta de tablas: sin ellas, null.
 * POST → guarda un evento (mostrada · respondida · ahora_no). APPEND-ONLY.
 * Pide acceso al cliente. Ver lib/encuestas-de-cuenta/.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { eventoDePreguntaSchema } from "@/lib/encuestas-de-cuenta/schema";
import { ErrorDePreguntas, preguntaPendiente, registrarEvento } from "@/lib/encuestas-de-cuenta/servidor";

type Params = Promise<{ id: string }>;

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  try {
    const pregunta = await preguntaPendiente({ clientId: id, email: guard.user.email, rol: guard.user.teamMember?.roleEnum ?? null });
    return NextResponse.json({ pregunta }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[clients/preguntas-de-la-cuenta]", e);
    return NextResponse.json({ pregunta: null });
  }
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const parsed = eventoDePreguntaSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  try {
    const r = await registrarEvento({
      clientId: id,
      email: guard.user.email,
      rol: guard.user.teamMember?.roleEnum ?? null,
      motivoDeAcceso: guard.reason,
      ...parsed.data,
    });
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof ErrorDePreguntas) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[clients/preguntas-de-la-cuenta]", e);
    return NextResponse.json({ error: "No se pudo guardar la respuesta." }, { status: 500 });
  }
}
