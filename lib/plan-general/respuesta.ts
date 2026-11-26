/**
 * lib/plan-general/respuesta.ts — cómo responden las rutas del plan general cuando algo falla (2026-11-26). SERVIDOR.
 * Un error del plan (ErrorDelPlan / ErrorDelAccesoAlPlan) sale con su estado y su mensaje; una base sin el SQL del plan,
 * con el nombre del archivo que falta (KNOWN-ERRORS: P2021/P2022 en el 3004 antes del SQL).
 */
import "server-only";
import { NextResponse } from "next/server";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { ErrorDelAccesoAlPlan } from "./acceso";
import { ErrorDelPlan } from "./plan";

export const SQL_DEL_PLAN = "scripts/sql/2026-11-26-plan-general-objeto-de-la-cuenta.sql";

export async function responderDelPlan(hacer: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await hacer();
  } catch (e) {
    if (e instanceof ErrorDelPlan || e instanceof ErrorDelAccesoAlPlan) return NextResponse.json({ error: e.message }, { status: e.status });
    if (esquemaDesactualizado(e)) return NextResponse.json({ error: `Falta aplicar ${SQL_DEL_PLAN} y reiniciar.` }, { status: 503 });
    throw e;
  }
}

/** El cuerpo JSON, o null si no se entiende. */
export async function cuerpoJson(req: Request): Promise<unknown | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
