/**
 * /api/finanzas/tipo-de-cambio — «Actualizar» de Finanzas › Tipo de cambio (2026-10-05).
 *   POST → trae ahora lo que falta del tipo de cambio del BCCR (lo mismo que hace el job diario) y dice qué guardó.
 * Solo trae datos públicos y los guarda; no toca ningún monto. Pide poder editar Cobranza porque escribe en la base.
 * Si ya hay una actualización corriendo (otro clic, otra persona, el job de las 6), no arranca otra: espera esa y
 * contesta con su resultado (el candado vive en `sincronizarTipoDeCambio`). 502 = no quedó ninguna tasa de la semana.
 */
import { NextResponse } from "next/server";
import { guardCobranzaEditor } from "@/lib/auth/api-guards";
import { sincronizarTipoDeCambio } from "@/lib/finanzas/tipo-cambio-server";

export async function POST() {
  const guard = await guardCobranzaEditor();
  if (guard instanceof NextResponse) return guard;
  try {
    const r = await sincronizarTipoDeCambio();
    return NextResponse.json(r, { status: r.ok ? 200 : 502 });
  } catch (e) {
    console.error("[tipo-de-cambio] falló «Actualizar»:", e);
    return NextResponse.json({ error: "No se pudo traer el tipo de cambio. Prueba de nuevo en un rato." }, { status: 500 });
  }
}
