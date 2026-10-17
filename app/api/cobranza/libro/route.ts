/**
 * /api/cobranza/libro — «Lo pagado»: lo que Odoo y Mercury ya dicen, listo para pasar a Nexus con la firma de quien
 * confirma (plan «Un solo libro financiero», paso 2, 2026-10-17).
 *   GET  → la lista de hoy, sin escribir nada: cuotas que se pegan a su factura, pagadas listas para cobrar (con el día
 *          del pago), pagadas sin el día del pago y choques. Lee Odoo para saber el día de cada pago.
 *   POST { pegar: cobroId[], cobrar: [{ cobroId, fechaCobro }] } → escribe SOLO lo marcado, firmado por quien confirma.
 *
 * Acceso: GET con guardCobranzaAccess (leer); POST con guardCobranzaEditor (`cobranza.write`): cobrar es cambiar plata.
 * ⛔ La firma sale del guard, nunca del cuerpo. ⛔ Nada de esto escribe en Odoo ni en Mercury.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardCobranzaAccess, guardCobranzaEditor } from "@/lib/auth/api-guards";
import { cargarLoPagado, confirmarLoPagado } from "@/lib/cobranza/libro/servicio";
import { crDateParts } from "@/lib/jobs/time";

export const dynamic = "force-dynamic";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const seleccionSchema = z.object({
  pegar: z.array(z.string().min(1).max(40)).max(500),
  cobrar: z
    .array(z.object({ cobroId: z.string().min(1).max(40), fechaCobro: z.string().regex(FECHA, "La fecha del pago va como AAAA-MM-DD.") }))
    .max(500),
});

const mensaje = (e: unknown) => (e instanceof Error ? e.message : "No se pudo leer Odoo y Mercury.");

export async function GET() {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  try {
    const lista = await cargarLoPagado(crDateParts(new Date()).dateKey);
    return NextResponse.json({ ...lista, firma: guard.user.email });
  } catch (e) {
    console.error("[cobranza/libro] no se pudo armar la lista (detalle omitido a propósito)");
    return NextResponse.json({ error: `No se pudo armar la lista: ${mensaje(e)}` }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const guard = await guardCobranzaEditor();
  if (guard instanceof NextResponse) return guard;
  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const sel = seleccionSchema.safeParse(cuerpo);
  if (!sel.success) return NextResponse.json({ error: sel.error.issues[0]?.message ?? "Selección inválida" }, { status: 400 });
  if (sel.data.pegar.length === 0 && sel.data.cobrar.length === 0) {
    return NextResponse.json({ error: "No marcaste nada para confirmar." }, { status: 400 });
  }
  try {
    const r = await confirmarLoPagado(guard.user.email, sel.data, crDateParts(new Date()).dateKey);
    return NextResponse.json({ ...r, firma: guard.user.email });
  } catch (e) {
    console.error("[cobranza/libro] no se pudo confirmar (detalle omitido a propósito)");
    return NextResponse.json({ error: mensaje(e) }, { status: 400 });
  }
}
