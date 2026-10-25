/**
 * POST /api/external/test/[token]/terminar — TERMINAR el test (área O, 2026-10-26). Público: el token es la llave.
 *
 * Calcula el resultado con el chequeo de la escala (lib/tests-diagnostico/resultado.ts), lo guarda y devuelve la
 * dirección de la página del resultado. HubSpot lo recibe después, por el job `tests-hubspot` (el formulario, la nota
 * «Diagnóstico de Rendimiento» y la dirección en el contacto): un fallo de HubSpot nunca le cuesta el resultado a la persona.
 */
import { NextRequest, NextResponse } from "next/server";
import { TerminarTestSchema } from "@/lib/tests-diagnostico/schema";
import { permitirGuardar } from "@/lib/tests-diagnostico/limite";
import { ErrorDelTest, terminarTest } from "@/lib/tests-diagnostico/servicio-server";
import { ErrorSinTablas } from "@/lib/tests-diagnostico/repositorio-server";

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) return NextResponse.json({ error: "Este test no existe." }, { status: 404 });
  if (!permitirGuardar(token)) return NextResponse.json({ error: "Demasiados cambios seguidos. Espera unos segundos." }, { status: 429 });
  const parsed = TerminarTestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  try {
    const url = await terminarTest(token, parsed.data.respuestas, process.env.APP_URL || req.nextUrl.origin);
    // La página del resultado, sin los datos del `#` (esos son para HubSpot y la preventa).
    return NextResponse.json({ url: url.split("#")[0] });
  } catch (e) {
    if (e instanceof ErrorDelTest) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof ErrorSinTablas) return NextResponse.json({ error: "Este test todavía no está abierto." }, { status: 503 });
    throw e;
  }
}
