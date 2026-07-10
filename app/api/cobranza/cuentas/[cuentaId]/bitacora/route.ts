/**
 * /api/cobranza/cuentas/[cuentaId]/bitacora — registro de gestión.
 *   POST → entrada de bitácora (llamada / correo / nota) con el email del guard.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { addBitacora } from "@/lib/cobranza/mutations";
import { bitacoraCreateSchema } from "@/lib/cobranza/schema";

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
  const parsed = bitacoraCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  const entrada = await addBitacora(cuentaId, parsed.data, guard.user.email);
  return NextResponse.json({ entrada: { id: entrada.id } }, { status: 201 });
}
