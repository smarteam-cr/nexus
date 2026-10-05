/**
 * lib/feedback/http.ts — piezas compartidas por las rutas de `app/api/feedback/`. SERVIDOR.
 */
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { feedbackDisponible } from "./queries";
import { esRevisorDeFeedback } from "./reglas";

export const SQL_DEL_FEEDBACK = "scripts/sql/2026-10-04-feedback.sql";

/** Un error que la ruta convierte en respuesta con su código. */
export class ErrorDeFeedback extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function leerCuerpo(req: NextRequest): Promise<unknown | NextResponse> {
  try {
    return await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
}

/** Sin las tablas (falta el SQL o reiniciar con el cliente nuevo): un 503 que dice qué falta. */
export function sinTablas(): NextResponse | null {
  if (feedbackDisponible()) return null;
  return NextResponse.json(
    { error: `El feedback todavía no está disponible: falta aplicar ${SQL_DEL_FEEDBACK}.` },
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

/** Usuario interno que revisa el feedback (SUPER_ADMIN). */
export async function guardRevisorDeFeedback() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  if (!esRevisorDeFeedback(guard.role)) {
    return NextResponse.json({ error: "La bandeja de feedback es para dirección." }, { status: 403 });
  }
  return guard;
}
