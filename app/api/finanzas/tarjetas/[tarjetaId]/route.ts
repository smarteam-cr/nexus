/**
 * /api/finanzas/tarjetas/[tarjetaId] — editar o eliminar una tarjeta (rediseño de Finanzas, 2026-10-03). Eliminarla no
 * borra ningún costo (solo el vínculo), pero SÍ borra sus cortes: por eso eliminar es solo de quien supervisa
 * (2026-10-05, lib/finanzas/tarjetas-eliminar.test.ts). Editar sigue siendo de quien registra.
 * ⚠ PRIVACIDAD: `guardGastosEditor` como PRIMERA línea (costos-privacy.test.ts, P5).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardGastosEditor } from "@/lib/auth/api-guards";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import { deleteTarjeta, updateTarjeta } from "@/lib/cobranza/mutations";
import { tarjetaPatchSchema } from "@/lib/cobranza/schema";
import { leerCuerpo, responderError } from "@/lib/finanzas/rutas";

type Params = { params: Promise<{ tarjetaId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardGastosEditor();
  if (guard instanceof NextResponse) return guard;
  const { tarjetaId } = await params;
  const data = await leerCuerpo(req, tarjetaPatchSchema);
  if (data instanceof NextResponse) return data;
  try {
    await updateTarjeta(tarjetaId, data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderError(e, "tarjetas");
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await guardGastosEditor();
  if (guard instanceof NextResponse) return guard;
  // ⛔ Eliminarla se lleva sus cortes (CASCADE): solo quien supervisa Finanzas, la MISMA condición que
  // `guardSupervisionFinanzas` (2026-10-05). Quien registra la edita, pero no la elimina.
  if (!isCostosRole(guard.role)) {
    return NextResponse.json(
      { error: "Eliminar una tarjeta es de quien supervisa Finanzas: se lleva sus cortes. Puedes editarla, pero no eliminarla." },
      { status: 403 },
    );
  }
  const { tarjetaId } = await params;
  try {
    await deleteTarjeta(tarjetaId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderError(e, "tarjetas");
  }
}
