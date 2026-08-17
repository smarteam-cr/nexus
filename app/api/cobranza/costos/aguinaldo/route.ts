/**
 * /api/cobranza/costos/aguinaldo — el aguinaldo DERIVADO del libro de planilla.
 *   GET ?anio=YYYY → una fila por persona y moneda, con su cobertura declarada.
 *
 * No hay tabla de aguinaldos ni endpoint de escritura: es una vista que se
 * recalcula sola cuando el libro cambia. Si hiciera falta congelarla algún día,
 * eso sería un snapshot con su propia decisión, no un campo más.
 *
 * ⚠ PRIVACIDAD: guardCostosAccess (SOLO SUPER_ADMIN) PRIMERA línea del handler.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { loadAguinaldo } from "@/lib/cobranza";
import { crDateParts } from "@/lib/jobs/time";

export async function GET(req: NextRequest) {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;

  const raw = req.nextUrl.searchParams.get("anio");
  // Sin año explícito se usa el corriente. No se adivina uno distinto: cambiar
  // de año cambia qué 12 meses se suman, y eso lo elige una persona.
  const hoyISO = crDateParts(new Date()).dateKey;
  const anio = raw && /^\d{4}$/.test(raw) ? Number(raw) : Number(hoyISO.slice(0, 4));

  // `hoyISO` va por parámetro porque `calcularAguinaldo` es puro: decide si el
  // período ya cerró y no puede resolver la fecha de Costa Rica por su cuenta.
  return NextResponse.json({ aguinaldo: await loadAguinaldo(anio, hoyISO) });
}
