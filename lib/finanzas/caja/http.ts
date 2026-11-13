/**
 * lib/finanzas/caja/http.ts — lo que repiten las rutas de la caja: leer el cuerpo con su esquema y traducir errores.
 * La guarda NO vive acá: es la primera línea de cada handler (lo vigila guardas.test.ts).
 */
import { NextResponse, type NextRequest } from "next/server";
import type { ZodType } from "zod";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { ErrorDeCaja } from "./mutaciones-server";

export async function leerCuerpo<T>(req: NextRequest, schema: ZodType<T>): Promise<T | NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "El pedido no trae un JSON válido." }, { status: 400 });
  }
  const r = schema.safeParse(raw);
  if (!r.success) return NextResponse.json({ error: r.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  return r.data;
}

export function responderError(e: unknown): NextResponse {
  if (e instanceof ErrorDeCaja) return NextResponse.json({ error: e.message }, { status: e.status });
  if (esquemaDesactualizado(e)) {
    return NextResponse.json({ error: "Falta correr el SQL de la caja (scripts/sql/2026-11-13-caja-y-pagos.sql)." }, { status: 503 });
  }
  console.error("[finanzas/caja] error (detalle omitido a propósito)");
  throw e;
}
