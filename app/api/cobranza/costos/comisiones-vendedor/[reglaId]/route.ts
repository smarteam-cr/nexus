/**
 * /api/cobranza/costos/comisiones-vendedor/[reglaId] — editar y borrar una REGLA.
 *
 * Borrar la regla NO toca lo ya liquidado: esas filas llevan su propio snapshot
 * de porcentaje y monto justamente para sobrevivir a esto. Lo que cambia es lo
 * DEVENGADO de acá en adelante, que es lo que se espera al borrarla.
 *
 * ⚠ PRIVACIDAD: guardCostosAccess (SOLO SUPER_ADMIN) PRIMERA línea de cada handler.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { updateReglaComision, deleteReglaComision, CobranzaError } from "@/lib/cobranza/mutations";
import { reglaComisionPatchSchema } from "@/lib/cobranza/schema";

type Params = { params: Promise<{ reglaId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;
  const { reglaId } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = reglaComisionPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  try {
    await updateReglaComision(reglaId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[cobranza/comisiones-vendedor] error al editar la regla (detalle omitido a propósito)");
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;
  const { reglaId } = await params;

  try {
    await deleteReglaComision(reglaId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[cobranza/comisiones-vendedor] error al borrar la regla (detalle omitido a propósito)");
    throw e;
  }
}
