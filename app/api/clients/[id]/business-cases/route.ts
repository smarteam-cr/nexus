/**
 * /api/clients/[id]/business-cases
 *   GET  → lista los business cases del cliente
 *   POST { name, hubspotCompanyId? } → crea uno nuevo (DRAFT)
 *
 * Gateado con guardSalesAccess (VENTAS/CSL/SUPER_ADMIN). El segmento usa `[id]`
 * para no chocar con el resto de rutas de /api/clients (Next exige el mismo
 * nombre de slug en todo el nivel).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import {
  createBusinessCase,
  listBusinessCases,
  CreateBusinessCaseBody,
} from "@/lib/business-cases";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const businessCases = await listBusinessCases(clientId);
  return NextResponse.json({ businessCases });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, hubspotCompanyId: true },
  });
  if (!client) {
    return NextResponse.json({ error: "Cliente no existe" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = CreateBusinessCaseBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }

  const created = await createBusinessCase({
    clientId,
    name: parsed.data.name,
    hubspotCompanyId: parsed.data.hubspotCompanyId ?? client.hubspotCompanyId,
    createdByEmail: guard.user.email ?? null,
  });
  return NextResponse.json({ businessCase: created }, { status: 201 });
}
