/**
 * /api/finanzas/sociedades/actualizar — POST: vuelve a copiar de Odoo lo que se deben las sociedades de Smarteam
 * (2026-11-13). ⛔ Solo lee Odoo. Solo dirección, como la página (guardSupervisionFinanzas).
 */
import { NextResponse } from "next/server";
import { guardSupervisionFinanzas } from "@/lib/auth/api-guards";
import { actualizarEntreSociedades } from "@/lib/sociedades/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const guard = await guardSupervisionFinanzas();
  if (guard instanceof NextResponse) return guard;
  const r = await actualizarEntreSociedades();
  if (!r.ok) return NextResponse.json({ error: "No se pudo leer Odoo ahora. Lo que había sigue igual." }, { status: 502 });
  return NextResponse.json({ ok: true, nuevas: r.nuevas, cambiadas: r.cambiadas, desaparecidas: r.desaparecidas });
}
