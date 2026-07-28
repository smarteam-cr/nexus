/**
 * /api/cobranza/ingresos-variables — entradas de dinero fuera del ciclo quincenal.
 *   GET  → { ingresos: IngresoVariableRow[] } (registrados + derivados de cobros).
 *   POST → crea un IngresoVariable (201). `clientId` es OPCIONAL: un ingreso
 *          "de forma general" (sin cliente) es legítimo — por eso no pasa por
 *          `Cobro`, que exige servicio y cuenta.
 * Acceso: guardCobranzaAccess (ADMIN + SUPER_ADMIN) — son INGRESOS, no costos.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { loadIngresosVariables } from "@/lib/cobranza/queries";
import { createIngresoVariable, CobranzaError } from "@/lib/cobranza/mutations";
import { ingresoVariableCreateSchema } from "@/lib/cobranza/schema";
import { crDateParts } from "@/lib/jobs/time";

export async function GET() {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const todayISO = crDateParts(new Date()).dateKey;
  return NextResponse.json({ ingresos: await loadIngresosVariables(todayISO) });
}

export async function POST(req: NextRequest) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = ingresoVariableCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  try {
    const ingreso = await createIngresoVariable(parsed.data, guard.user.email);
    return NextResponse.json({ ingreso }, { status: 201 });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
