/**
 * /api/external/test/[token] — el intento de una persona (área O, 2026-10-26). Público: el token (256 bits) es la llave.
 *
 *   GET   → dónde quedó (para retomar): las preguntas sin niveles, lo elegido y el paso.
 *   PATCH → { respuestas, paso }: el guardado al avanzar. Con tope por intento (lib/tests-diagnostico/limite.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { GuardarAvanceSchema } from "@/lib/tests-diagnostico/schema";
import { permitirGuardar } from "@/lib/tests-diagnostico/limite";
import { ErrorDelTest, guardarElAvance } from "@/lib/tests-diagnostico/servicio-server";
import { vistaDelIntento } from "@/lib/tests-diagnostico/ids-publicos";
import { ErrorSinTablas, intentoPorToken } from "@/lib/tests-diagnostico/repositorio-server";

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
type Params = { params: Promise<{ token: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) return NextResponse.json({ error: "Este test no existe." }, { status: 404 });
  try {
    const i = await intentoPorToken(token);
    if (!i) return NextResponse.json({ error: "Este test no existe." }, { status: 404 });
    return NextResponse.json(vistaDelIntento(i));
  } catch (e) {
    if (e instanceof ErrorSinTablas) return NextResponse.json({ error: "Este test todavía no está abierto." }, { status: 503 });
    throw e;
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) return NextResponse.json({ error: "Este test no existe." }, { status: 404 });
  if (!permitirGuardar(token)) return NextResponse.json({ error: "Demasiados cambios seguidos. Espera unos segundos." }, { status: 429 });
  const parsed = GuardarAvanceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  try {
    await guardarElAvance(token, parsed.data.respuestas, parsed.data.paso);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ErrorDelTest) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof ErrorSinTablas) return NextResponse.json({ error: "Este test todavía no está abierto." }, { status: 503 });
    throw e;
  }
}
