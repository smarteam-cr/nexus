/**
 * POST /api/business-cases/create-from-company
 *   body: { companyId, companyName, domain?, dealId?, name?, caseType?, caseSubtype? }
 *
 * Crea un business case sobre una empresa de HubSpot que puede no ser cliente:
 * find-or-create de un Client (isProspect=true si es nuevo) + BusinessCase (con su
 * tipo + tags seed) + Plantilla v0 sembrada con el template del tipo. Devuelve
 * el businessCaseId. Gateado con guardSalesAccess.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { createBusinessCase } from "@/lib/business-cases";
import { createBusinessCaseCanvas } from "@/lib/canvas/default-canvases";
import { bcTypeOrNull, seedTagsFor, DEFAULT_BC_TYPE_ID } from "@/lib/business-cases/case-types";

export async function POST(req: NextRequest) {
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  let body: {
    companyId?: unknown;
    companyName?: unknown;
    domain?: unknown;
    dealId?: unknown;
    name?: unknown;
    caseType?: unknown;
    caseSubtype?: unknown;
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

  // Tipo de caso — validación ESTRICTA del input (desconocido → 400; ausente → default).
  const rawType = typeof body.caseType === "string" && body.caseType.trim() ? body.caseType.trim() : DEFAULT_BC_TYPE_ID;
  const typeDef = bcTypeOrNull(rawType);
  if (!typeDef) {
    return NextResponse.json({ error: "Tipo de business case desconocido." }, { status: 400 });
  }
  if (!typeDef.enabled) {
    return NextResponse.json({ error: `"${typeDef.label}" todavía no está disponible.` }, { status: 400 });
  }
  // Kill-switch operativo (rollback sin revert): BC_DISABLED_TYPES="website,integration"
  // apaga la CREACIÓN de esos tipos; los BCs existentes siguen funcionando.
  const disabled = (process.env.BC_DISABLED_TYPES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (disabled.includes(typeDef.id)) {
    return NextResponse.json({ error: `"${typeDef.label}" está deshabilitado temporalmente.` }, { status: 400 });
  }
  const rawSubtype = typeof body.caseSubtype === "string" && body.caseSubtype.trim() ? body.caseSubtype.trim() : null;
  const caseSubtype = rawSubtype && typeDef.subtypes?.some((s) => s.id === rawSubtype) ? rawSubtype : null;
  if (rawSubtype && !caseSubtype) {
    return NextResponse.json({ error: "Sub-tipo desconocido para ese tipo de caso." }, { status: 400 });
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
    caseType: typeDef.id,
    caseSubtype,
    tags: seedTagsFor(typeDef, caseSubtype),
  });

  // Plantilla (v0): base con las guías editables del agente. NO se llena con
  // contenido — cada "Generar con IA" crea un caso de uso nuevo (v1, v2, …).
  // Se siembra con el template del tipo + __meta (respaldo dual-PC del tipo).
  await createBusinessCaseCanvas(bc.id, 0, prisma, typeDef.templateId, {
    caseType: typeDef.id,
    caseSubtype,
  });

  return NextResponse.json({ businessCaseId: bc.id }, { status: 201 });
}
