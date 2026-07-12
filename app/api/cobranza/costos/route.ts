/**
 * /api/cobranza/costos — registro de costos recurrentes (fase 4).
 *   GET  → { costos: CostoRecurrenteDTO[] } (referencia ESTIMADA, incl. salarios).
 *   POST → crea un CostoRecurrente (201).
 * ⚠ PRIVACIDAD: guardCostosAccess (SOLO SUPER_ADMIN) como PRIMERA línea de cada
 * handler — es LA barrera (Prisma bypassa RLS). Hay un test estructural que
 * verifica su presencia. Los console.error no loguean el body (montos).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { loadCostos } from "@/lib/cobranza/queries";
import { createCosto, CobranzaError } from "@/lib/cobranza/mutations";
import { costoCreateSchema } from "@/lib/cobranza/schema";

export async function GET() {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json({ costos: await loadCostos() });
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
  const parsed = costoCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  try {
    const costo = await createCosto(parsed.data);
    return NextResponse.json({ costo }, { status: 201 });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[cobranza/costos] error al crear (detalle omitido a propósito)");
    throw e;
  }
}
