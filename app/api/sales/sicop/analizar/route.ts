/**
 * POST /api/sales/sicop/analizar — lee con IA las licitaciones del pipeline «Gobiernos».
 *
 * Body opcional: { ticketId?: string, forzar?: boolean }
 *   · sin body    → lee todo lo que cambió desde la última corrida (lo normal).
 *   · ticketId    → vuelve a leer UNA (el botón de una fila).
 *   · forzar      → re-lee aunque la huella no haya cambiado (después de tocar el criterio).
 *
 * ⛔ Pide `ventas.write` y no `ventas.read`: leer la pantalla es gratis, pero apretar este
 * botón gasta una llamada a Claude por licitación. El permiso separa mirar de gastar.
 *
 * El gasto queda medido solo: todas las llamadas pasan por `lib/anthropic.ts`, que registra
 * cada una en `LlmCall` y consulta el tope diario antes de disparar.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardPermission } from "@/lib/auth/api-guards";
import { correrAnalisisSicop } from "@/lib/ventas/sicop-analisis";

/** Una corrida completa son ~45 lecturas de a 4 en paralelo: bastante más que el default. */
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const guard = await guardPermission("ventas", "write");
  if (guard instanceof NextResponse) return guard;

  let body: { ticketId?: unknown; forzar?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* Sin body es el caso normal (el botón «Analizar»): no es un error. */
  }

  const resultado = await correrAnalisisSicop({
    soloTicketId: typeof body.ticketId === "string" && body.ticketId ? body.ticketId : undefined,
    forzar: body.forzar === true,
  });

  if (resultado.tablaAusente) {
    return NextResponse.json(
      {
        error:
          "Falta aplicar la migración: scripts/sql/2026-08-23-sicop-lectura.sql. " +
          "Hasta entonces no hay dónde guardar la lectura.",
      },
      { status: 503 },
    );
  }
  if (resultado.error) return NextResponse.json({ error: resultado.error }, { status: 502 });

  return NextResponse.json({ resultado });
}
