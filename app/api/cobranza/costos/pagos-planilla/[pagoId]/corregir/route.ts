/**
 * /api/cobranza/costos/pagos-planilla/[pagoId]/corregir — corregir una quincena YA PAGADA (2026-10-07).
 *   PATCH { monto, fechaPago? } → la quincena sigue PAGADA y a nombre de quien la pagó; la corrección (quién, cuándo, de
 *         cuánto a cuánto) queda escrita en sus notas (`corregirQuincenaPagada`).
 *
 * Ruta propia y no el PATCH genérico: ese sigue rechazando una pagada, y corregir lo pagado tiene que dejar rastro.
 *
 * ⚠ PRIVACIDAD: guardCostosAccess PRIMERA línea, con la excepción por persona de «editar la planilla».
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { corregirQuincenaPagada, CobranzaError } from "@/lib/cobranza/mutations";
import { planillaCorregirSchema } from "@/lib/cobranza/schema";

type Params = { params: Promise<{ pagoId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardCostosAccess({ porPersona: { section: "planilla", action: "write" } });
  if (guard instanceof NextResponse) return guard;
  const { pagoId } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = planillaCorregirSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Input inválido" }, { status: 400 });
  }

  try {
    return NextResponse.json(await corregirQuincenaPagada(pagoId, parsed.data, guard.user.email));
  } catch (e) {
    if (e instanceof CobranzaError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[cobranza/planilla] error al corregir una quincena pagada (detalle omitido a propósito)");
    throw e;
  }
}
