/**
 * PATCH /api/cobranza/comisiones-partner/[comisionId]/estado — mueve una comisión de
 * aliado entre "por cobrar" y "cobrada".
 *
 * ⚠ GATE `guardCobranzaAccess` (ADMIN + SUPER_ADMIN), NO el de costos: esto es un
 * INGRESO, igual que el resto de `comisiones-partner`. Copiar acá el guard de costos
 * dejaría la acción en SUPER_ADMIN sin que nadie lo note — y quien registra estas
 * comisiones no es dirección.
 *
 * ⚠ Ruta aparte del PATCH general a propósito: el estado NO se toca por el patch de
 * campos. Es el chokepoint único de una afirmación con consecuencia monetaria ("esta
 * plata entró"), y INV20 exige que quede firmada.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { comisionPartnerEstadoSchema } from "@/lib/cobranza/schema";
import { cambiarEstadoComisionPartner } from "@/lib/cobranza/mutations";
import { CobranzaError } from "@/lib/cobranza/mutations";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ comisionId: string }> },
) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = comisionPartnerEstadoSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  const { comisionId } = await params;
  try {
    const r = await cambiarEstadoComisionPartner(comisionId, parsed.data, guard.user.email);
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[cobranza/comisiones-partner/estado] error al cambiar el estado");
    throw e;
  }
}
