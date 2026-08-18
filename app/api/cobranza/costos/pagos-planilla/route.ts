/**
 * /api/cobranza/costos/pagos-planilla — el libro de lo que se PAGÓ.
 *   GET  → el libro completo + su cobertura declarada.
 *   POST → generar las filas de una quincena (CREATE-ONLY; re-generar es no-op).
 *
 * ⚠ PRIVACIDAD: guardCostosAccess (SOLO SUPER_ADMIN) PRIMERA línea de cada
 * handler. Cuelga de `costos/` para entrar al escaneo estructural.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { loadLibroPlanilla } from "@/lib/cobranza";
import { generarQuincena, CobranzaError } from "@/lib/cobranza/mutations";
import { planillaGenerarSchema } from "@/lib/cobranza/schema";

export async function GET() {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json({ libro: await loadLibroPlanilla() });
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
  const parsed = planillaGenerarSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  try {
    const resultado = await generarQuincena(parsed.data);
    return NextResponse.json({ resultado }, { status: 201 });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[cobranza/planilla] error al generar (detalle omitido a propósito)");
    throw e;
  }
}
