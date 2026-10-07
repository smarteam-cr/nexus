/**
 * /api/cobranza/costos/pagos-planilla/pagar-quincena — «Pagar la quincena» del historial de planilla (2026-10-06).
 *   PUT { periodo, quincena, fechaPago? } → todas las filas PENDIENTES de esa quincena quedan PAGADAS con esa fecha y a
 *       nombre de quien lo hace. Cada fila pasa por el chokepoint de INV18 (`pagarQuincena`), una por una.
 *
 * ⚠ PRIVACIDAD: guardCostosAccess (SOLO SUPER_ADMIN) PRIMERA línea del handler — son salarios.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { pagarQuincenaCompleta, CobranzaError } from "@/lib/cobranza/mutations";
import { planillaPagarQuincenaSchema } from "@/lib/cobranza/schema";

export async function PUT(req: NextRequest) {
  const guard = await guardCostosAccess({ porPersona: { section: "planilla", action: "write" } });
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = planillaPagarQuincenaSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Input inválido" }, { status: 400 });
  }

  try {
    return NextResponse.json(await pagarQuincenaCompleta(parsed.data, guard.user.email));
  } catch (e) {
    if (e instanceof CobranzaError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[cobranza/planilla] error al pagar la quincena (detalle omitido a propósito)");
    throw e;
  }
}
