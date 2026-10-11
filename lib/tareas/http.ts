/**
 * lib/tareas/http.ts — piezas compartidas por las rutas de `app/api/tareas/`. SERVIDOR.
 *
 * Cada ruta llama primero a `guardInternalUser()` (lo exige el escaneo de guardas) y después a `prepararTareas`, que
 * responde 503 sin el SQL y arma QUIÉN pide: su contexto y las empresas que ve, una vez por pedido.
 */
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { AppUserWithTeamMember } from "@/lib/auth/supabase";
import type { TeamMember } from "@prisma/client";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { ErrorDeTareas, SQL_DE_TAREAS, contextoDeTareas, tareasDisponible, type ContextoDeTareas } from "./servidor";
import { clientesQueVesParaTareas, type ClientesQueVes } from "./clientes";

export async function leerCuerpo(req: NextRequest): Promise<unknown | NextResponse> {
  try {
    return await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
}

export function errorDeValidacion(issues: { message: string }[]): NextResponse {
  return NextResponse.json({ error: issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
}

/** Lo que responde una ruta cuando a la base le falta una tabla o una columna de Tareas. */
export function sinElSql(): NextResponse {
  return NextResponse.json({ error: `Tareas todavía no está disponible: falta aplicar ${SQL_DE_TAREAS}.` }, { status: 503 });
}

/** Traduce los errores conocidos; el resto sube (lo registra Next). Una tabla o una columna que falta es 503, no 500. */
export function respuestaDeError(e: unknown): NextResponse {
  if (e instanceof ErrorDeTareas) return NextResponse.json({ error: e.message, ...(e.extra ?? {}) }, { status: e.status });
  if (esquemaDesactualizado(e)) {
    console.error(`[tareas] a la base le falta algo de ${SQL_DE_TAREAS}: ${e instanceof Error ? e.message : e}`);
    return sinElSql();
  }
  throw e;
}

export interface Pedido {
  ctx: ContextoDeTareas;
  clientes: ClientesQueVes;
}

/** Sin las tablas, 503 que dice qué falta. Con ellas, el contexto de quien pide. */
export async function prepararTareas(guard: { user: AppUserWithTeamMember; teamMember: TeamMember }): Promise<Pedido | NextResponse> {
  if (!(await tareasDisponible())) return sinElSql();
  const [ctx, clientes] = await Promise.all([contextoDeTareas(guard.user), clientesQueVesParaTareas(guard.teamMember)]);
  return { ctx, clientes };
}
