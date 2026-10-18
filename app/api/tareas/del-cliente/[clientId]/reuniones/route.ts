/**
 * GET /api/tareas/del-cliente/[clientId]/reuniones — las próximas reuniones de la cuenta, para la ficha del cliente ›
 * La cuenta › Tareas (fase 2.2 de docs/nexus-sistema-de-trabajo-plan.md, 2026-10-17): las de los próximos 8 días en los
 * calendarios de la gente de Smarteam que la trabaja y las planeadas en Tareas, con quién de Smarteam va a cada una.
 *
 * Solo lee (Google Calendar con el permiso de siempre, y la base). 404 si el cliente no existe o no lo ves. Lo arma
 * lib/mi-dia/proximas-server.ts; un evento cuenta para la cuenta solo si es de UNA empresa (invariante 1).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { errorDeValidacion, prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { proximasReunionesDeLaCuenta } from "@/lib/mi-dia/proximas-server";

type Params = { params: Promise<{ clientId: string }> };

const ClientIdParam = z.string().trim().min(1, "Falta el id.").max(64, "Ese id no es válido.");

export async function GET(_req: Request, { params }: Params) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const parsed = ClientIdParam.safeParse((await params).clientId);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);
  const clientId = parsed.data;
  try {
    const p = await prepararTareas(guard);
    if (p instanceof NextResponse) return p;
    const existe = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!existe || (!p.clientes.todos && !p.clientes.ids.has(clientId))) return NextResponse.json({ error: "Ese cliente no existe." }, { status: 404 });
    return NextResponse.json(await proximasReunionesDeLaCuenta(clientId, p.ctx.email));
  } catch (e) {
    return respuestaDeError(e);
  }
}
