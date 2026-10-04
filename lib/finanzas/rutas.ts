/**
 * lib/finanzas/rutas.ts — lo repetido de las rutas de /api/finanzas (rediseño de Finanzas, 2026-10-03): leer el cuerpo
 * con su esquema y contestar los errores de negocio. Server-only.
 */
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { CobranzaError } from "@/lib/cobranza/mutations";

/** El cuerpo validado, o la respuesta 400 lista para devolver. */
export async function leerCuerpo<S extends z.ZodTypeAny>(req: NextRequest, schema: S): Promise<z.infer<S> | NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Input inválido" }, { status: 400 });
  }
  return parsed.data;
}

/** Un error de negocio con su estado; cualquier otro se relanza sin datos en el log. */
export function responderError(e: unknown, donde: string): NextResponse {
  if (e instanceof CobranzaError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(`[finanzas/${donde}] error (detalle omitido a propósito)`);
  throw e;
}
