/**
 * lib/escala/comentarios/http.ts — piezas compartidas por las rutas de `app/api/escala/`. SERVIDOR.
 */
import { NextResponse, type NextRequest } from "next/server";
import { SQL_DE_LA_ESCALA } from "@/lib/escala/documento/vigente";
import { comentariosDisponibles, ErrorDeComentario } from "./consultas";

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
    { error: `Los comentarios de la escala todavía no están disponibles: falta aplicar ${SQL_DE_LA_ESCALA}.` },
    { status: 503 },
  );
}

export function errorDeValidacion(issues: { message: string }[]): NextResponse {
  return NextResponse.json({ error: issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
}

/** Traduce los errores conocidos; el resto sube (lo registra Next). */
export function respuestaDeError(e: unknown): NextResponse {
  if (e instanceof ErrorDeComentario) return NextResponse.json({ error: e.message }, { status: e.status });
  throw e;
}
