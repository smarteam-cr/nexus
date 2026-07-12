/**
 * /api/cobranza/gastos — gastos puntuales/circunstanciales (fase 4.5).
 *   GET  → { gastos: GastoPuntualDTO[] } (orden fecha desc).
 *   POST → crea un GastoPuntual (201). tags libres → normalizados a slug en Zod.
 * ⚠ PRIVACIDAD: guardCostosAccess (SOLO SUPER_ADMIN) como PRIMERA línea de cada
 * handler — es LA barrera (Prisma bypassa RLS). Test estructural lo verifica.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { loadGastos } from "@/lib/cobranza/queries";
import { createGasto, CobranzaError } from "@/lib/cobranza/mutations";
import { gastoCreateSchema } from "@/lib/cobranza/schema";

export async function GET() {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json({ gastos: await loadGastos() });
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
  const parsed = gastoCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  try {
    const gasto = await createGasto(parsed.data);
    return NextResponse.json({ gasto }, { status: 201 });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[cobranza/gastos] error al crear (detalle omitido a propósito)");
    throw e;
  }
}
