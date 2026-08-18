/**
 * /api/cobranza/comisiones-partner — lo que Smarteam GANA de cada aliado.
 *   GET  → las comisiones + el total por partner y por moneda.
 *   POST → comisionPartnerCreateSchema.
 *
 * ⚠ GATE `guardCobranzaAccess` (ADMIN + SUPER_ADMIN), NO el de costos: esto es
 * un INGRESO, igual que `IngresoVariable`. Copiar acá el guard de costos dejaría
 * la pantalla en SUPER_ADMIN sin que nadie lo note.
 *
 * ⚠ Y por eso vive FUERA de `costos/`: las comisiones de VENDEDOR (que son
 * remuneración) están en `costos/comisiones-vendedor`, con otro guard, otra ruta
 * y otro loader. Nunca se juntan.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { loadComisionesPartner } from "@/lib/cobranza";
import { createComisionPartner, CobranzaError } from "@/lib/cobranza/mutations";
import { comisionPartnerCreateSchema } from "@/lib/cobranza/schema";

export async function GET() {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json({ data: await loadComisionesPartner() });
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
  const parsed = comisionPartnerCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  try {
    const comision = await createComisionPartner(parsed.data, guard.user.email);
    return NextResponse.json({ comision }, { status: 201 });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[cobranza/comisiones-partner] error al crear");
    throw e;
  }
}
