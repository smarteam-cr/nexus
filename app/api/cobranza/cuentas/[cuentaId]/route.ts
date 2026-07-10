/**
 * /api/cobranza/cuentas/[cuentaId] — detalle + edición de la cuenta.
 *   GET   → detalle completo (servicios + plan + cobros + bitácora + proyectos).
 *   PATCH → editar campos; cambiar estadoCuenta registra quién/cuándo (curaduría).
 * SIN DELETE en v1 (local==PROD: evitar accidentes; usar SUSPENDIDA/excluida).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { getCuentaDetail } from "@/lib/cobranza/queries";
import { updateCuenta, CobranzaError } from "@/lib/cobranza/mutations";
import { cuentaPatchSchema } from "@/lib/cobranza/schema";

type Params = { params: Promise<{ cuentaId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const { cuentaId } = await params;
  const cuenta = await getCuentaDetail(cuentaId);
  if (!cuenta) return NextResponse.json({ error: "La cuenta no existe" }, { status: 404 });
  return NextResponse.json({ cuenta });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const { cuentaId } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = cuentaPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  try {
    await updateCuenta(cuentaId, parsed.data, guard.user.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "La cuenta no existe" }, { status: 404 });
  }
}
