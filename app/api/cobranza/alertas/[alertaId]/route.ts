/**
 * /api/cobranza/alertas/[alertaId] — ciclo de vida de una alerta.
 *   PATCH { estado?, posponerHasta? } → estado ABIERTA→VISTA→RESUELTA|DESCARTADA
 *   (registra quién/cuándo) y/o snooze (posponer sin cambiar estado; null lo quita).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { patchAlerta } from "@/lib/cobranza/mutations";
import { alertaPatchSchema } from "@/lib/cobranza/schema";

type Params = { params: Promise<{ alertaId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const { alertaId } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = alertaPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  try {
    await patchAlerta(alertaId, parsed.data, guard.user.email);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "La alerta no existe" }, { status: 404 });
  }
}
