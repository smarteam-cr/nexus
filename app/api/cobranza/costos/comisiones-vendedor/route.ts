/**
 * /api/cobranza/costos/comisiones-vendedor — lo que Smarteam le PAGA a quien vendió.
 *   GET  → las reglas, lo DEVENGADO (derivado de los cobros) y lo LIQUIDADO.
 *   POST → reglaComisionCreateSchema (crea una REGLA, no una comisión).
 *
 * ⚠ PRIVACIDAD: guardCostosAccess (SOLO SUPER_ADMIN) como PRIMERA línea de cada
 * handler. Es remuneración de una persona — la misma superficie que los salarios,
 * NO la de `comisiones-partner`, que es un ingreso y la ve ADMIN.
 *
 * ⚠ POR QUÉ CUELGA DE `costos/`: el escaneo estructural de costos-privacy.test.ts
 * barre SOLO `costos`, `gastos` y `caja-neta`. Una ruta hermana fuera de esos
 * tres directorios no quedaría cubierta por ningún guard obligatorio.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { loadComisionesVendedor } from "@/lib/cobranza";
import { createReglaComision, CobranzaError } from "@/lib/cobranza/mutations";
import { reglaComisionCreateSchema } from "@/lib/cobranza/schema";

export async function GET() {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json({ data: await loadComisionesVendedor() });
}

export async function POST(req: NextRequest) {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = reglaComisionCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  try {
    const regla = await createReglaComision(parsed.data);
    return NextResponse.json({ regla }, { status: 201 });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[cobranza/comisiones-vendedor] error al crear la regla (detalle omitido a propósito)");
    throw e;
  }
}
