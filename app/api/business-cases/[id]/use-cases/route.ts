/**
 * POST /api/business-cases/[id]/use-cases   body: { useCaseId, selected, priceOverride? }
 *
 * Marca/desmarca un caso de uso del catálogo para este BC (upsert sobre el pivote
 * BusinessCaseUseCase — espejo de /sessions). El pivote es estado de trabajo +
 * input del prompt; la verdad PUBLICABLE es el `data` de la sección `casos_de_uso`
 * del canvas (el workspace la sincroniza al togglear). Gateado con guardSalesAccess.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const bc = await prisma.businessCase.findUnique({ where: { id }, select: { id: true } });
  if (!bc) return NextResponse.json({ error: "Business case no existe" }, { status: 404 });

  let body: { useCaseId?: unknown; selected?: unknown; priceOverride?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const useCaseId = typeof body.useCaseId === "string" ? body.useCaseId : "";
  const selected = typeof body.selected === "boolean" ? body.selected : null;
  if (!useCaseId || selected === null) {
    return NextResponse.json({ error: "useCaseId y selected requeridos" }, { status: 400 });
  }
  const priceOverride =
    typeof body.priceOverride === "string" && body.priceOverride.trim()
      ? body.priceOverride.trim()
      : body.priceOverride === null
        ? null
        : undefined; // undefined = no tocar

  const useCase = await prisma.useCase.findUnique({ where: { id: useCaseId }, select: { id: true } });
  if (!useCase) return NextResponse.json({ error: "Caso de uso no existe" }, { status: 404 });

  const row = await prisma.businessCaseUseCase.upsert({
    where: { businessCaseId_useCaseId: { businessCaseId: id, useCaseId } },
    create: { businessCaseId: id, useCaseId, selected, priceOverride: priceOverride ?? null },
    update: { selected, ...(priceOverride !== undefined ? { priceOverride } : {}) },
  });

  return NextResponse.json({ pivot: { useCaseId: row.useCaseId, selected: row.selected, priceOverride: row.priceOverride } });
}
