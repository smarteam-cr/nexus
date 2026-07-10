/**
 * /api/cobranza/cuentas/[cuentaId]/servicios — alta de servicio contratado.
 *   POST → crear servicio; si trae projectId sin fechaInicioFacturacion, la LEE
 *          (una vez) del anchorStartDate del cronograma (copia editable).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { createServicio, CobranzaError } from "@/lib/cobranza/mutations";
import { servicioCreateSchema } from "@/lib/cobranza/schema";

type Params = { params: Promise<{ cuentaId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const { cuentaId } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = servicioCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  try {
    const servicio = await createServicio(cuentaId, parsed.data);
    return NextResponse.json({ servicio: { id: servicio.id } }, { status: 201 });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
