import { NextResponse } from "next/server";
import { enrichSingleSession } from "@/lib/google/meet-enrichment";
import { prisma } from "@/lib/db/prisma";
import { guardAccesoALaReunion } from "@/lib/sessions/acceso-a-la-reunion";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";

/**
 * POST /api/sessions/[id]/enrich — vuelve a buscar en Drive el documento de una reunión y devuelve su transcripción.
 *
 * Solo quien puede abrir la reunión (lib/sessions/acceso-a-la-reunion.ts): con dueño, acceso a ese cliente; sin acceso
 * o si no existe, 404 con el mismo texto. Una reunión sin dueño, cualquier interno, como en /sessions. Hasta el
 * 2026-11-23 bastaba con tener sesión: cualquiera del equipo que mandara el id recibía la transcripción de cualquier
 * cliente (docs/evaluacion-de-nexus-2026-11.md §3.1).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acceso = await guardAccesoALaReunion(id);
  if (acceso instanceof NextResponse) return acceso;

  // Si Drive trae la transcripción sin resumen, la lectura le pide el resumen a Claude: se cobra como el botón
  // «Generar resumen», a quien lo pidió y al cliente.
  const found = await conContextoDeIA(
    { origen: "sessions/enrich", clientId: acceso.dueno, triggeredByEmail: acceso.user.email.toLowerCase() },
    () => enrichSingleSession(id),
  );

  // Devolver el transcript actualizado para que el cliente lo muestre sin recargar
  const updated = await prisma.firefliesSession.findUnique({
    where: { id },
    select: { id: true, transcript: true, summary: true, enrichedAt: true },
  });

  return NextResponse.json({ found, ...updated });
}
