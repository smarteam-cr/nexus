/**
 * /api/cobranza/costos/comisiones-vendedor/cuotas/[cuotaId] — «¿Se pagó?» de una cuota de comisión (2026-10-06).
 *   PATCH { estado: "PAGADA" | "NO_PAGADA" | "POR_CONFIRMAR" } → la cuota queda así, a nombre de quien responde
 *         (`confirmarCuotaComision`). POR_CONFIRMAR = deshacer la respuesta.
 *
 * ⚠ Remuneración: guardCostosAccess PRIMERA línea, con la excepción por persona de «editar comisiones» (Dinia).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { CobranzaError } from "@/lib/cobranza/mutations";
import { confirmarCuotaComision } from "@/lib/finanzas/comisiones-historial-server";
import { crDateParts } from "@/lib/jobs/time";

type Params = { params: Promise<{ cuotaId: string }> };

const cuerpo = z.object({ estado: z.enum(["PAGADA", "NO_PAGADA", "POR_CONFIRMAR"]) });

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardCostosAccess({ porPersona: { section: "comisionesVendedor", action: "write" } });
  if (guard instanceof NextResponse) return guard;
  const { cuotaId } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = cuerpo.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "El estado es PAGADA, NO_PAGADA o POR_CONFIRMAR." }, { status: 400 });

  try {
    const r = await confirmarCuotaComision(cuotaId, parsed.data.estado, guard.user.email, crDateParts(new Date()).dateKey);
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof CobranzaError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[comisiones-vendedor] error al confirmar una cuota (detalle omitido a propósito)");
    throw e;
  }
}
