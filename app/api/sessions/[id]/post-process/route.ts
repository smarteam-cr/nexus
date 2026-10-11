import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { guardAccesoALaReunion } from "@/lib/sessions/acceso-a-la-reunion";
import { leerAhora } from "@/lib/lecturas/leer";

/**
 * POST /api/sessions/[id]/post-process
 *
 * «Generar minuta» (MinuteDialog) o «Leer esta reunión» (su página): la lectura de seguimiento, YA, pedida por una
 * persona (memoria de la cuenta, etapa 2). Body opcional: { force?: boolean } → si true, rehace la minuta existente.
 *
 *   · Solo quien tiene acceso al cliente dueño de la reunión (`resolvedClientId`, el manual si no hay). Sin acceso,
 *     404: confirmar que la reunión existe ya es información. Una reunión sin dueño: cualquier interno (no se lee).
 *     La regla es la de lib/sessions/acceso-a-la-reunion.ts.
 *   · `force` sobre una minuta ya revisada o editada: 409. La minuta es memoria y se corrige en la reunión, no se pisa.
 *   · Toma la fila de la cola: si el job (u otra persona) la está leyendo desde hace menos de 15 minutos, 409.
 *   · Cobra contra el presupuesto HUMANO (`pedidaPorEmail`).
 *   · Con `SEGUIMIENTO_REUNIONES_ENABLED=0` o sin el SQL de la cola, el post-proceso viejo, como antes.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acceso = await guardAccesoALaReunion(id);
  if (acceso instanceof NextResponse) return acceso;

  let force = false;
  try {
    const body = (await req.json().catch(() => ({}))) as { force?: boolean };
    force = !!body.force;
  } catch {
    /* body opcional */
  }

  if (force) {
    const minuta = await prisma.sessionMinute.findUnique({ where: { sessionId: id }, select: { status: true } });
    if (minuta && (minuta.status === "REVIEWED" || minuta.status === "EDITED")) {
      return NextResponse.json({ status: "revisada", error: "La minuta ya se revisó: corrígela en la reunión en vez de rehacerla." }, { status: 409 });
    }
  }

  const result = await leerAhora(id, { force, pedidaPorEmail: acceso.user.email.toLowerCase() });
  // Lo que sigue a la lectura (avance, ficha, etapa, preventa) ya quedó corriendo en segundo plano; no viaja.
  const cuerpo: Record<string, unknown> = { ...result };
  delete cuerpo.despues;
  const httpStatus = result.status === "ocupada" ? 409 : result.status === "error" ? 500 : 200;
  return NextResponse.json(cuerpo, { status: httpStatus });
}
