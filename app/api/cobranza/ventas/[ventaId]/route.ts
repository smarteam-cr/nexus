/**
 * PATCH /api/cobranza/ventas/[ventaId] — un negocio ganado sin cobro (2026-11-13): reasignar a quién lo persigue,
 * descartarlo con una razón (no genera cobro) o devolverlo a la lista. Quién y cuándo quedan en la venta.
 * Acceso: guardCobranzaEditor (`cobranza.write`).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaEditor } from "@/lib/auth/api-guards";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { ventaSeguimientoSchema } from "@/lib/cobranza/schema";
import { asignarResponsableDeVenta, descartarVenta, devolverVentaALaLista, SeguimientoError } from "@/lib/cobranza/seguimiento-server";

type Params = { params: Promise<{ ventaId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardCobranzaEditor();
  if (guard instanceof NextResponse) return guard;
  const { ventaId } = await params;
  const parsed = ventaSeguimientoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return cuerpoInvalido(parsed.error);
  const b = parsed.data;
  try {
    if ("responsable" in b) await asignarResponsableDeVenta(ventaId, b.responsable);
    else if ("descartar" in b) await descartarVenta(ventaId, b.descartar, guard.user.email);
    else await devolverVentaALaLista(ventaId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof SeguimientoError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[cobranza/ventas]", e);
    return NextResponse.json({ error: "No se pudo guardar. Inténtalo de nuevo." }, { status: 500 });
  }
}
