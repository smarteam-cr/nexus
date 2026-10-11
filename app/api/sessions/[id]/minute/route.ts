import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { guardAccesoALaReunion } from "@/lib/sessions/acceso-a-la-reunion";
import { olvidarMedicion } from "@/lib/para-ti/medir-server";
import { CambioDeMinuta } from "@/lib/seguimiento/schema";

/**
 * PATCH /api/sessions/[id]/minute
 *
 * Actualiza la SessionMinute de una sesión.
 * Body opcional (validado con Zod, lib/seguimiento/schema.ts):
 *   - status: "DRAFT" | "REVIEWED" | "EDITED"
 *   - summary, agreements, decisions, risks, topics: editan los campos
 *
 * Al setear status: REVIEWED, registra reviewedAt + reviewedByEmail (del CSE activo).
 *
 * Pide un usuario interno CON ACCESO al cliente dueño de la reunión (`resolvedClientId`, el manual solo si no hay);
 * sin acceso, 404: hasta el 2026-10-09 cualquiera con sesión cambiaba la minuta de cualquier cliente. Una reunión SIN
 * dueño: cualquier interno, como su página y «Generar minuta» (la regla única de lib/sessions/acceso-a-la-reunion.ts).
 * Lo usan MinuteDialog y la tarjeta «Lo que dejó esta reunión» (lib/seguimiento).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;
  const noEncontrada = () => NextResponse.json({ error: "Minuta no encontrada" }, { status: 404 });

  const acceso = await guardAccesoALaReunion(sessionId);
  if (acceso instanceof NextResponse) return acceso.status === 401 ? acceso : noEncontrada();
  const { user } = acceso;

  const raw = await req.json().catch(() => undefined);
  if (raw === undefined) return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  const parsed = CambioDeMinuta.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos para la minuta." }, { status: 400 });
  const body = parsed.data;

  const data: Record<string, unknown> = {};
  if (body.status) {
    data.status = body.status;
    if (body.status === "REVIEWED" || body.status === "EDITED") {
      data.reviewedAt = new Date();
      data.reviewedByEmail = user.email;
    }
  }
  if (body.summary !== undefined) data.summary = body.summary;
  if (body.agreements !== undefined) data.agreements = body.agreements as unknown as object;
  if (body.decisions !== undefined) data.decisions = body.decisions as unknown as object;
  if (body.risks !== undefined) data.risks = body.risks as unknown as object;
  if (body.topics !== undefined) data.topics = body.topics as unknown as object;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const existe = await prisma.sessionMinute.findUnique({ where: { sessionId }, select: { id: true } });
  if (!existe) return noEncontrada();

  const updated = await prisma.sessionMinute.update({
    where: { sessionId },
    data,
    select: { id: true, status: true, reviewedAt: true, reviewedByEmail: true },
  });

  // La minuta revisada deja de contar en «Lo que dejaron tus reuniones» de «Para ti».
  olvidarMedicion(user.email);
  return NextResponse.json(updated);
}
