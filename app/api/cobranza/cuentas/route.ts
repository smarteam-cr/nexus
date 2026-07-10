/**
 * /api/cobranza/cuentas — panel de cartera + alta de cuenta.
 *   GET  → filas del panel (clientes con proyecto real; incluye "sin configurar").
 *   POST → get-or-create de la CuentaFinanciera del cliente (idempotente: si ya
 *          existe devuelve la existente con created:false — el botón "Configurar
 *          cuenta" es ensure-and-open, un re-click no es un error).
 * Acceso: guardCobranzaAccess (ADMIN + SUPER_ADMIN) — enforcement server-side.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { loadCartera } from "@/lib/cobranza/queries";
import { createCuenta, CobranzaError } from "@/lib/cobranza/mutations";
import { cuentaCreateSchema } from "@/lib/cobranza/schema";
import { crDateParts } from "@/lib/jobs/time";

export async function GET() {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const rows = await loadCartera(crDateParts(new Date()).dateKey);
  return NextResponse.json({ rows });
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
  const parsed = cuentaCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  try {
    const { cuenta, created } = await createCuenta(parsed.data);
    return NextResponse.json({ cuenta: { id: cuenta.id }, created }, { status: created ? 201 : 200 });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
