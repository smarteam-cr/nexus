/**
 * lib/analizador-venta/guardia-server.ts — QUIÉN puede ver y trabajar el análisis de la venta de una preventa (S4 y S5,
 * 2026-10-27). SERVIDOR.
 *
 * El análisis vive en la preventa (`/api/sales/exploraciones/[id]/analisis-de-venta`): mirar pide `preventa.read` y
 * analizar o confirmar, `preventa.write` (`veElAnalizador`, abierto a quien entra a la preventa desde el 2026-10-28). Solo la
 * preventa de un prospecto (una exploración sin proyecto): la exploración de un proyecto es de Customer Success y no se
 * analiza como venta. Devuelve la empresa de la preventa: toda reunión que se toque tiene que ser de ella (invariante 1).
 */
import "server-only";
import { NextResponse } from "next/server";
import { guardPermission } from "@/lib/auth/api-guards";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { prisma } from "@/lib/db/prisma";
import { getClientSessions } from "@/lib/sessions/project-sources";
import { veElAnalizador } from "./reglas";

export interface QuienAnaliza {
  email: string;
  clientId: string;
}

export async function guardDelAnalisisDeVenta(exploracionId: string, accion: "read" | "write"): Promise<QuienAnaliza | NextResponse> {
  const g = await guardPermission("preventa", accion);
  if (g instanceof NextResponse) return g;
  if (!veElAnalizador(g.role)) return NextResponse.json({ error: "No puedes ver el análisis de la venta." }, { status: 403 });
  let exp: { clientId: string; projectId: string | null } | null;
  try {
    exp = await prisma.exploracionDeVenta.findUnique({ where: { id: exploracionId }, select: { clientId: true, projectId: true } });
  } catch (e) {
    if (esquemaDesactualizado(e)) return NextResponse.json({ error: "A la base le falta el SQL de la preventa." }, { status: 503 });
    throw e;
  }
  if (!exp || exp.projectId) return NextResponse.json({ error: "Esa preventa no existe." }, { status: 404 });
  return { email: g.teamMember.email, clientId: exp.clientId };
}

/** ¿La reunión es de la empresa de la preventa y ya ocurrió? Por el chokepoint (invariante 1). */
export async function esReunionDeLaEmpresa(clientId: string, sessionId: string): Promise<boolean> {
  const [s] = await getClientSessions(clientId, { ids: [sessionId] });
  return !!s;
}
