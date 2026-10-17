/**
 * /api/cobranza/licencias/[id] — editar o archivar un contrato con licencias (2026-10-17).
 *   PATCH  → reemplaza sus datos (la cuenta no cambia: para otra cuenta, otro contrato).
 *   DELETE → lo archiva (no lo borra: lo que ya se leyó con él se puede explicar después).
 *
 * Acceso: guardCobranzaEditor (`cobranza.write`).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaEditor } from "@/lib/auth/api-guards";
import { actualizarLicencia, archivarLicencia } from "@/lib/finanzas/licencias-escritura-server";
import { licenciaSchema } from "@/lib/finanzas/licencias-esquema";
import { leerCuerpo, responderError } from "@/lib/finanzas/rutas";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardCobranzaEditor();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  const data = await leerCuerpo(req, licenciaSchema.omit({ cuentaId: true }));
  if (data instanceof NextResponse) return data;
  try {
    await actualizarLicencia(id, data, guard.user.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderError(e, "licencias");
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardCobranzaEditor();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  try {
    await archivarLicencia(id, guard.user.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderError(e, "licencias");
  }
}
