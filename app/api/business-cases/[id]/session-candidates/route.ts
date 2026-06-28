/**
 * GET /api/business-cases/[id]/session-candidates
 *
 * Sesiones de Fireflies del PROSPECTO para el panel "Contexto":
 *   - included:   las que ALIMENTAN el caso (PRE-SELECCIONADAS): tienen a alguien de
 *                 Ventas en la sala, salvo override del CSE. Mismo criterio que el handoff.
 *   - candidates: las demás sesiones del prospecto ("Buscar más sesiones").
 *
 * La regla vive en lib/business-cases/feeding (compartida con /generate). Solo lectura.
 * Incluir/excluir explícito va por POST /api/business-cases/[id]/sessions.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { loadBcFeeding } from "@/lib/business-cases/feeding";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const result = await loadBcFeeding(id);
  if (!result) return NextResponse.json({ error: "Business case no existe" }, { status: 404 });

  return NextResponse.json({ included: result.included, candidates: result.candidates });
}
