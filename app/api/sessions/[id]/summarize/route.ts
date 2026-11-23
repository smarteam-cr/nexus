import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { summarizeTranscript } from "@/lib/ai/summarize-session";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { guardAccesoALaReunion } from "@/lib/sessions/acceso-a-la-reunion";

/**
 * POST /api/sessions/[id]/summarize — genera con IA el resumen de una reunión y lo guarda.
 *
 *   · Solo quien puede abrir la reunión (lib/sessions/acceso-a-la-reunion.ts): con dueño, acceso a ese cliente; sin
 *     acceso o si no existe, 404 con el mismo texto. Sin dueño, cualquier interno, como en /sessions. Hasta el
 *     2026-11-23 bastaba con tener sesión, y la transcripción de cualquier cliente iba a Claude.
 *   · La llamada ya pasaba por el medidor (`getAnthropic` está medido), pero sin dueño: se cobraba al presupuesto
 *     automático y a ningún cliente. Ahora va a nombre de quien apretó el botón y del cliente.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acceso = await guardAccesoALaReunion(id);
  if (acceso instanceof NextResponse) return acceso;

  const session = await prisma.firefliesSession.findUnique({
    where: { id },
    select: { id: true, title: true, transcript: true },
  });

  if (!session) return NextResponse.json({ error: "No encuentro esa reunión." }, { status: 404 });
  if (!session.transcript) return NextResponse.json({ error: "no_transcript" }, { status: 400 });
  const { title, transcript } = session;

  // Sin `reunionId` a propósito: esa marca es la de la LECTURA de una reunión, y el panel «Cada reunión leída» de Gasto
  // de la IA cuenta por ella. Un resumen pedido a mano no es una lectura.
  const summary = await conContextoDeIA(
    { origen: "sessions/summarize", clientId: acceso.dueno, triggeredByEmail: acceso.user.email.toLowerCase() },
    () => summarizeTranscript(title, transcript),
  );

  if (!summary) return NextResponse.json({ error: "summarization_failed" }, { status: 500 });

  await prisma.firefliesSession.update({
    where: { id },
    data: { summary: summary as unknown as Prisma.InputJsonValue },
  });

  return NextResponse.json({ summary });
}
