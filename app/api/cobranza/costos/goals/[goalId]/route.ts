/**
 * /api/cobranza/costos/goals/[goalId] — una meta de gerencia (Finanzas › Metas y bonos, 2026-11-13).
 *   PATCH { …la meta entera } → la reemplaza, firmada.
 *   DELETE → la quita de la pantalla: la fila queda archivada, no se borra.
 *
 * ⚠ PRIVACIDAD: guardCostosAccess (SOLO SUPER_ADMIN) PRIMERA línea de cada handler.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { metaDeGerenciaSchema } from "@/lib/finanzas/metas-de-gerencia-esquema";
import { actualizarMetaDeGerencia, archivarMetaDeGerencia } from "@/lib/finanzas/metas-de-gerencia-server";
import { leerCuerpo, responderError } from "@/lib/finanzas/rutas";

type Ctx = { params: Promise<{ goalId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;
  const { goalId } = await params;
  const data = await leerCuerpo(req, metaDeGerenciaSchema);
  if (data instanceof NextResponse) return data;
  try {
    await actualizarMetaDeGerencia(goalId, data, guard.user.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderError(e, "goals");
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;
  const { goalId } = await params;
  try {
    await archivarMetaDeGerencia(goalId, guard.user.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderError(e, "goals");
  }
}
