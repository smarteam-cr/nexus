/**
 * GET /api/business-cases/[id]/use-case-candidates
 *
 * Candidatos del checklist de casos de uso para este BC: activos aplicables a su
 * tipo + los ya seleccionados (aunque estén inactivos). `enabled:false` cuando el
 * template lo apaga o no hay catálogo aplicable → el checklist NI SE MONTA
 * (degradación elegante). `catalogUnavailable:true` = tabla ausente (drop dual-PC):
 * la UI avisa en vez de silenciar. Gateado con guardSalesAccess.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { resolveCaseTypeFor } from "@/lib/business-cases/resolve-template";
import { getUseCaseCandidates } from "@/lib/business-cases/use-cases";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const bc = await prisma.businessCase.findUnique({
    where: { id },
    select: { id: true, caseType: true, caseSubtype: true },
  });
  if (!bc) return NextResponse.json({ error: "Business case no existe" }, { status: 404 });

  const v0 = await prisma.projectCanvas.findFirst({
    where: { businessCaseId: id, version: 0 },
    select: { sections: true },
  });
  const resolved = resolveCaseTypeFor(bc, v0?.sections);

  const result = await getUseCaseCandidates(id, resolved.caseType, resolved.templateId);
  return NextResponse.json(result);
}
