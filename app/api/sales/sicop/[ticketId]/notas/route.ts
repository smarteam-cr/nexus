/**
 * GET /api/sales/sicop/[ticketId]/notas — el hilo de notas de una licitación, clasificado.
 *
 * Se pide BAJO DEMANDA, al abrir el detalle de una licitación, y no en la carga de la lista:
 * traer las notas de las 45 en cada pintada son dos llamadas más a HubSpot para mostrar algo
 * que casi siempre nadie abre.
 *
 * ⚠ Las notas NO se persisten. HubSpot es su dueño, el volumen es chico y el parseo es regex
 * (gratis). Guardarlas agregaría un sync que se puede desincronizar sin que nadie lo note; lo
 * único que se cachea es lo caro: la lectura de IA y el texto de los archivos.
 *
 * Gate `ventas.read`: leer es gratis. Bajar archivos y gastar IA es otro endpoint y otra celda.
 */
import { NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { leerNotasDeTickets, leerResponsables } from "@/lib/ventas/sicop";
import { leerAdjuntosGuardados } from "@/lib/ventas/sicop-archivos";
import { resumirNotas } from "@/lib/ventas/sicop-notas";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const { ticketId } = await params;
  if (!/^\d+$/.test(ticketId)) {
    return NextResponse.json({ error: "Id de ticket inválido" }, { status: 400 });
  }

  try {
    const hs = await getSystemHubspotClient();
    const [notasPorTicket, autores, adjuntos] = await Promise.all([
      leerNotasDeTickets(hs, [ticketId]),
      leerResponsables(hs),
      leerAdjuntosGuardados([ticketId]),
    ]);

    const resumen = resumirNotas(notasPorTicket.get(ticketId) ?? [], autores);

    return NextResponse.json({
      resumen,
      archivos: adjuntos.porTicket.get(ticketId) ?? [],
      /* La pantalla lo necesita para no prometer un botón de descarga que va a fallar. */
      esquemaDeArchivosAtrasado: adjuntos.esquemaAtrasado,
    });
  } catch (e) {
    /* Un fallo de HubSpot no puede tumbar el detalle entero: la ficha de IA ya está en la
       página y sigue sirviendo aunque las notas no lleguen. */
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudieron leer las notas" },
      { status: 502 },
    );
  }
}
