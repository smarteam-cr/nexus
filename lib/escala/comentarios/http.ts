/**
 * lib/escala/comentarios/http.ts — piezas compartidas por las rutas de `app/api/escala/`. SERVIDOR.
 *
 * Desde el 2026-10-05 los comentarios se guardan como reportes de Feedback (lib/feedback/escala-server.ts):
 * sin las tablas del feedback, o sin las columnas de la escala, la ruta dice qué SQL falta.
 */
import { NextResponse, type NextRequest } from "next/server";
import { ErrorDeFeedback } from "@/lib/feedback/error";
import { comentariosDisponibles, SQL_DE_LA_ESCALA_EN_FEEDBACK } from "@/lib/feedback/escala-server";

const SQL_DEL_FEEDBACK = "scripts/sql/2026-10-04-feedback.sql";

export async function leerCuerpo(req: NextRequest): Promise<unknown | NextResponse> {
  try {
    return await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
}

/** Sin las tablas (falta el SQL o reiniciar con el cliente nuevo): un 503 que dice qué falta. */
export function sinTablas(): NextResponse | null {
  if (comentariosDisponibles()) return null;
  return NextResponse.json(
    { error: `Los comentarios de la escala todavía no están disponibles: falta aplicar ${SQL_DEL_FEEDBACK} y ${SQL_DE_LA_ESCALA_EN_FEEDBACK}.` },
    { status: 503 },
  );
}

export function errorDeValidacion(issues: { message: string }[]): NextResponse {
  return NextResponse.json({ error: issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
}

/** Traduce los errores conocidos; el resto sube (lo registra Next). */
export function respuestaDeError(e: unknown): NextResponse {
  if (e instanceof ErrorDeFeedback) return NextResponse.json({ error: e.message }, { status: e.status });
  throw e;
}
