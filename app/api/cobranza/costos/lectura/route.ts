/**
 * /api/cobranza/costos/lectura — la lectura de los números de Rentabilidad (iniciativa C de docs/roadmap.md).
 *   GET  → las propuestas (pendientes y decididas hace poco) y las últimas corridas.
 *   POST → corre la lectura ahora, a nombre de quien la pide. Una llamada a Claude (si hay señales), medida.
 *
 * ⚠ PRIVACIDAD: guardCostosAccess (SOLO SUPER_ADMIN) PRIMERA línea de cada handler: la lectura mira el margen de cada
 * cuenta y el costo de la hora.
 */
import { NextResponse } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { cargarLecturaDeLosNumeros, correrLecturaDeLosNumeros } from "@/lib/rentabilidad/lectura/servidor";
import { responderError } from "@/lib/finanzas/rutas";

export const maxDuration = 180;

export async function GET() {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json({ lectura: await cargarLecturaDeLosNumeros() });
}

export async function POST() {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;
  try {
    return NextResponse.json({ resultado: await correrLecturaDeLosNumeros({ por: guard.user.email }) });
  } catch (e) {
    return responderError(e, "lectura");
  }
}
