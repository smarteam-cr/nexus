/**
 * /api/finanzas/actualizar — «Actualizar» de Conciliación e Integraciones (rediseño de Finanzas, 2026-10-03).
 *   POST { ventas?: boolean } → vuelve a copiar Odoo y Mercury (y las ventas ganadas de HubSpot, salvo `ventas: false`)
 *   y devuelve qué pasó con cada fuente: { fuentes: FuenteActualizada[], todoBien, texto }.
 *
 * Acceso: `cobranza.read`, el mismo que «Actualizar desde Odoo» y «Actualizar desde Mercury»: no cambia ningún dato del
 * negocio, vuelve a copiar lo que esos sistemas ya dicen. ⛔ Solo LEE HubSpot, Odoo y Mercury.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { actualizarFuentesDelTablero } from "@/lib/finanzas/actualizar-tablero-server";
import { avisoDeActualizacion } from "@/lib/finanzas/actualizar-tablero";
import { crDateParts } from "@/lib/jobs/time";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ ventas: z.boolean().optional() });

export async function POST(req: NextRequest) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw ?? {});
  if (!parsed.success) return NextResponse.json({ error: "Input inválido" }, { status: 400 });
  const anio = Number(crDateParts(new Date()).dateKey.slice(0, 4));
  const fuentes = await actualizarFuentesDelTablero(guard.user.email, anio, { ventas: parsed.data.ventas });
  return NextResponse.json({ fuentes, ...avisoDeActualizacion(fuentes) });
}
