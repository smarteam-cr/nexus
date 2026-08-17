/**
 * /api/cobranza/costos/tarjetas — listar y crear tarjetas de crédito.
 *   GET  → las tarjetas con su disponible, su cargado mensual y sus costos.
 *   POST → tarjetaCreateSchema.
 *
 * ⚠ PRIVACIDAD: guardCostosAccess (SOLO SUPER_ADMIN) como PRIMERA línea de cada
 * handler — corta ANTES de tocar la DB (403, nunca 404 para un no-autorizado).
 *
 * ⚠ POR QUÉ CUELGA DE `costos/` Y NO DE `app/api/cobranza/tarjetas/`: el escaneo
 * estructural de costos-privacy.test.ts barre SOLO `costos`, `gastos` y
 * `caja-neta`. Una ruta hermana fuera de esos tres directorios no quedaría
 * cubierta por ningún guard obligatorio — verificado, no supuesto.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { loadTarjetas } from "@/lib/cobranza";
import { createTarjeta, CobranzaError } from "@/lib/cobranza/mutations";
import { tarjetaCreateSchema } from "@/lib/cobranza/schema";
import { crDateParts } from "@/lib/jobs/time";

export async function GET() {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;
  // La fecha de Costa Rica se resuelve acá (misma que la page): el motor del
  // ciclo no lee el reloj — ver lib/cobranza/tarjetas.ts.
  const hoyISO = crDateParts(new Date()).dateKey;
  return NextResponse.json({ tarjetas: await loadTarjetas(hoyISO) });
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
  const parsed = tarjetaCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  try {
    const tarjeta = await createTarjeta(parsed.data);
    return NextResponse.json({ tarjeta }, { status: 201 });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[cobranza/tarjetas] error al crear (detalle omitido a propósito)");
    throw e;
  }
}
