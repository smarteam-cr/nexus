/**
 * /api/finanzas/sociedades/catalogo — GET: el catálogo de cuentas de Odoo, leído en el momento y clasificado por su
 * código (2026-11-13). ⛔ Solo lee Odoo. Solo dirección (guardSupervisionFinanzas).
 */
import { NextResponse } from "next/server";
import { guardSupervisionFinanzas } from "@/lib/auth/api-guards";
import { leerCatalogo } from "@/lib/sociedades/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await guardSupervisionFinanzas();
  if (guard instanceof NextResponse) return guard;
  try {
    return NextResponse.json(await leerCatalogo());
  } catch (e) {
    console.error("[finanzas/sociedades/catalogo] no se pudo leer Odoo:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo leer el catálogo de Odoo ahora. Prueba en un rato." }, { status: 502 });
  }
}
