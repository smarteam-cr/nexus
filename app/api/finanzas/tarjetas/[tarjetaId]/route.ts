/**
 * /api/finanzas/tarjetas/[tarjetaId] — editar o eliminar una tarjeta (rediseño de Finanzas, 2026-10-03). Eliminarla no
 * borra ningún costo: solo el vínculo.
 * ⚠ PRIVACIDAD: `guardGastosEditor` como PRIMERA línea (costos-privacy.test.ts, P5).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardGastosEditor } from "@/lib/auth/api-guards";
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
  const { tarjetaId } = await params;
  try {
    await deleteTarjeta(tarjetaId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderError(e, "tarjetas");
  }
}
