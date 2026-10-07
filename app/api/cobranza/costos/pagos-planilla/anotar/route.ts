/**
 * /api/cobranza/costos/pagos-planilla/anotar — anotar desde el calendario una quincena que falta (2026-10-06).
 *   POST { teamMemberId, periodo, quincena, monto } → la quincena queda en el libro, PAGADA en su fecha y a nombre de
 *        quien la anota (`anotarQuincenaPagada`, que paga por el chokepoint de INV18). La moneda la pone el servidor.
 *
 * ⚠ PRIVACIDAD: guardCostosAccess (SOLO SUPER_ADMIN) PRIMERA línea del handler — son salarios.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { anotarQuincenaPagada, CobranzaError } from "@/lib/cobranza/mutations";
import { planillaAnotarSchema } from "@/lib/cobranza/schema";
import { crDateParts } from "@/lib/jobs/time";

export async function POST(req: NextRequest) {
  const guard = await guardCostosAccess({ porPersona: { section: "planilla", action: "write" } });
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = planillaAnotarSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Input inválido" }, { status: 400 });
  }

  try {
    const r = await anotarQuincenaPagada(parsed.data, guard.user.email, crDateParts(new Date()).dateKey);
    return NextResponse.json(r, { status: 201 });
  } catch (e) {
    if (e instanceof CobranzaError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[cobranza/planilla] error al anotar una quincena (detalle omitido a propósito)");
    throw e;
  }
}
