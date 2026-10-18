/**
 * lib/nexus-chat/http-server.ts — la puerta de las rutas del chat de Nexus. SERVER-ONLY.
 *
 * RBAC: miembro interno con la celda `asistente.read` (conversar consume modelo, igual que los otros dos chats) Y acceso
 * a la cuenta (`requireAccessToClient`, la misma regla que la ficha del cliente). Los montos de los negocios, solo con
 * `ventas.read`. El correo sale de la SESIÓN: es la clave del hilo.
 */
import "server-only";
import { NextResponse } from "next/server";
import type { TeamMember } from "@prisma/client";
import { guardAccessToClient, guardPermission } from "@/lib/auth/api-guards";
import { can } from "@/lib/auth/permissions/engine";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { ErrorDelChat } from "./aplicar-server";
import { esErrorPropio } from "@/lib/operaciones/contexto-server";
import { PresupuestoDeIaAgotado } from "@/lib/ai/presupuesto";

export interface QuienPide {
  persona: TeamMember;
  usuarioEmail: string;
  veMontos: boolean;
  clientId: string;
}

export async function quienPide(clientId: string): Promise<QuienPide | NextResponse> {
  const g = await guardPermission("asistente", "read");
  if (g instanceof NextResponse) return g;
  const acceso = await guardAccessToClient(clientId);
  if (acceso instanceof NextResponse) return acceso;
  const usuarioEmail = (g.user.email ?? g.teamMember.email).toLowerCase();
  return { persona: g.teamMember, usuarioEmail, veMontos: await can(g.teamMember, "ventas", "read"), clientId };
}

/**
 * Un error para la persona: el del chat o de un escritor de la capa (por CLASE) con su estado; el presupuesto, 429; la
 * base atrasada, 503; lo demás —también un error de la API de Anthropic, que trae su propio `status` y su JSON crudo—,
 * 502 con un texto genérico, y el detalle al log.
 */
export function respuestaDeError(e: unknown, donde: string): NextResponse {
  if (e instanceof ErrorDelChat || esErrorPropio(e)) return NextResponse.json({ error: e.message }, { status: e.status });
  // El presupuesto de IA de todo Nexus (lib/ai/presupuesto.ts), aparte del tope de la persona.
  if (e instanceof PresupuestoDeIaAgotado) return NextResponse.json({ error: "Nexus ya usó el presupuesto de IA de hoy. Mañana sigues." }, { status: 429 });
  if (esquemaDesactualizado(e)) {
    console.error(`[nexus-chat] ${donde}: a la base le falta algo (scripts/sql/2026-10-17-ficha-h-hilo-de-la-cuenta.sql):`, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Al chat de Nexus le falta su actualización en la base. Avísale a quien administra Nexus." }, { status: 503 });
  }
  console.error(`[nexus-chat] ${donde}:`, e);
  return NextResponse.json({ error: "Nexus no pudo contestar. Prueba de nuevo en un momento." }, { status: 502 });
}
