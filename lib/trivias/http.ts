/**
 * lib/trivias/http.ts — piezas compartidas por las rutas de `app/api/trivia/`. SERVIDOR.
 */
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { SQL_DE_TRIVIAS, triviasDisponible } from "./disponible";
import { ErrorDeTrivias } from "./error";

export { ErrorDeTrivias };

/** Las lecturas en vivo no se cachean en ningún lado: cada pedido lee la base. */
export const SIN_CACHE = { "Cache-Control": "no-store" } as const;

export async function leerCuerpo(req: NextRequest): Promise<unknown | NextResponse> {
  try {
    return await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
}

/** Sin las tablas (falta el SQL o reiniciar con el cliente nuevo): un 503 que dice qué falta. */
export async function sinTablas(): Promise<NextResponse | null> {
  if (await triviasDisponible()) return null;
  return NextResponse.json(
    { error: `Las trivias todavía no están disponibles: falta aplicar ${SQL_DE_TRIVIAS}.` },
    { status: 503 },
  );
}

/** El primer problema, en palabras (el editor lo muestra tal cual). */
export function errorDeValidacion(issues: { message: string }[]): NextResponse {
  return NextResponse.json({ error: issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
}

/** Traduce los errores conocidos; el resto sube (lo registra Next). */
export function respuestaDeError(e: unknown): NextResponse {
  if (e instanceof ErrorDeTrivias) return NextResponse.json({ error: e.message }, { status: e.status });
  if (esquemaDesactualizado(e)) {
    return NextResponse.json(
      { error: `Las trivias todavía no están disponibles: falta aplicar ${SQL_DE_TRIVIAS}.` },
      { status: 503 },
    );
  }
  throw e;
}
