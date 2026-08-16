/**
 * /api/cobranza/comisiones-partner/aliados — los aliados y su CADENCIA.
 *   POST → partnerCreateSchema.
 *
 * No hay GET: los aliados viajan dentro de `loadComisionesPartner()`, que es lo
 * que la pantalla ya pide. Un GET propio sería un segundo lugar contestando
 * "qué aliados existen".
 *
 * ⚠ GATE `guardCobranzaAccess` (ADMIN + SUPER_ADMIN), NO el de costos: esto es
 * la configuración de un INGRESO, igual que la comisión que configura.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { createPartner, CobranzaError } from "@/lib/cobranza/mutations";
import { partnerCreateSchema } from "@/lib/cobranza/schema";

export async function POST(req: NextRequest) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = partnerCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  try {
    const partner = await createPartner(parsed.data);
    return NextResponse.json({ partner }, { status: 201 });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[cobranza/aliados] error al crear (detalle omitido a propósito)");
    throw e;
  }
}
