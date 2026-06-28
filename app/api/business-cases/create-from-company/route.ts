/**
 * POST /api/business-cases/create-from-company
 *   body: { companyId, companyName, domain?, dealId?, name? }
 *
 * Crea un business case sobre una empresa de HubSpot que puede no ser cliente:
 * find-or-create de un Client (isProspect=true si es nuevo) + BusinessCase (sin
 * Project, sin canvas todavía — el canvas se crea al primer "Generar"). Devuelve
 * el businessCaseId. Gateado con guardSalesAccess.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { createBusinessCase } from "@/lib/business-cases";
import { createBusinessCaseCanvas } from "@/lib/canvas/default-canvases";

export async function POST(req: NextRequest) {
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  let body: {
    companyId?: unknown;
    companyName?: unknown;
    domain?: unknown;
    dealId?: unknown;
    name?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
  const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
  const domain = typeof body.domain === "string" ? body.domain.trim().toLowerCase() : "";
  const dealId = typeof body.dealId === "string" && body.dealId.trim() ? body.dealId.trim() : null;
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "";
  if (!companyId || !companyName) {
    return NextResponse.json({ error: "Falta la empresa de HubSpot." }, { status: 400 });
  }

  // find-or-create Client — prospecto si es nuevo (no ensucia los listados de CS).
  let client = await prisma.client.findFirst({
    where: { hubspotCompanyId: companyId },
    select: { id: true },
  });
  if (!client) {
    client = await prisma.client.create({
      data: {
        name: companyName,
        company: companyName,
        hubspotCompanyId: companyId,
        emailDomains: domain ? [domain] : [],
        isProspect: true,
      },
      select: { id: true },
    });
  }

  const bc = await createBusinessCase({
    clientId: client.id,
    name: name || `Caso de negocio — ${companyName}`,
    hubspotCompanyId: companyId,
    hubspotDealId: dealId,
    createdByEmail: guard.user.email ?? null,
  });

  // Template editorial vacío ("Caso de uso 1") listo desde el inicio: el workspace
  // muestra la página completa de una y el primer "Generar" lo llena en su lugar.
  await createBusinessCaseCanvas(bc.id, 1);

  return NextResponse.json({ businessCaseId: bc.id }, { status: 201 });
}
