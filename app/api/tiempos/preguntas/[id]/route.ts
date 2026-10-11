/**
 * POST /api/tiempos/preguntas/[id] — responder («1 h») u omitir («Omitir» · «No lo hice yo») una pregunta propia.
 * «No lo hice yo» con `quien` le pasa la pregunta a esa persona; la respuesta dice a quién (`pasoA`).
 */
import { NextResponse, type NextRequest } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { responderPregunta } from "@/lib/tiempos/preguntas";
import { respuestaSchema } from "@/lib/tiempos/schema";
import { ErrorDeTiempos, SQL_DE_TIEMPOS, tiemposDisponible } from "@/lib/tiempos/servidor";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  if (!tiemposDisponible()) {
    return NextResponse.json({ error: `Los tiempos todavía no están disponibles: falta aplicar ${SQL_DE_TIEMPOS}.` }, { status: 503 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const parsed = respuestaSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });

  const { id } = await params;
  try {
    const { pasoA } = await responderPregunta(id, guard.user.email, parsed.data);
    return NextResponse.json({ ok: true, pasoA });
  } catch (e) {
    if (e instanceof ErrorDeTiempos) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
