/**
 * POST /api/sessions/[id]/analisis-de-venta — analiza (o vuelve a analizar) una reunión de venta (S3, 2026-10-25).
 *
 * Pide acceso a la reunión y, mientras se prueba, ser super admin (`veElAnalizador`). Gasta IA (unos diez centavos de
 * dólar): se cobra al presupuesto humano de quien lo pide. Lo demás: lib/analizador-venta/analizar-server.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { guardAccesoALaReunion } from "@/lib/sessions/acceso-a-la-reunion";
import { analizarReunionDeVenta } from "@/lib/analizador-venta/analizar-server";
import { veElAnalizador } from "@/lib/analizador-venta/reglas";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const acceso = await guardAccesoALaReunion(id);
  if (acceso instanceof NextResponse) return acceso;
  if (!veElAnalizador(acceso.user.teamMember?.roleEnum)) return NextResponse.json({ error: "El analizador de reuniones de venta todavía está en prueba." }, { status: 403 });
  try {
    const r = await analizarReunionDeVenta(id, { pedidoPor: acceso.user.email });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, juicios: r.analisis.juicios.length, descartados: r.descartados });
  } catch (e) {
    if (esquemaDesactualizado(e)) return NextResponse.json({ error: "A la base le falta el SQL 2026-10-26-analizador-venta.sql." }, { status: 503 });
    throw e;
  }
}
