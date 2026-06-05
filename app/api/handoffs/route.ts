import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { guardInternalUser, guardAccessToClient } from "@/lib/auth/api-guards";
import { createDefaultCanvases, createHandoffCanvas } from "@/lib/canvas/default-canvases";

interface Body {
  dealId?: string;
  projectName?: string;
  // Modo "cliente existente":
  clientId?: string;
  // Modo "cliente nuevo" (resuelto vía /api/handoffs/lookup):
  companyId?: string;
  companyName?: string;
  domain?: string;
}

/**
 * POST /api/handoffs
 *
 * Orquestador del bloque de fundación: crea un handoff (entidad cliente-level) que
 * ARRANCA un proyecto. En Nexus es atómico (decisión #2): en UN $transaction crea
 * Project (+hubspotDealId) + los 4 canvases del set + el canvas Handoff + la entidad
 * Handoff (hubspotSyncStatus="pending"). El sync a HubSpot (crear el record en el
 * pipeline) es una fase aparte (Fase 5) gobernada por hubspotSyncStatus. El agente
 * de handoff lo dispara el frontend después (su corrida es larga y reintentable).
 */
export async function POST(req: NextRequest) {
  const internal = await guardInternalUser();
  if (internal instanceof NextResponse) return internal;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const dealId = body.dealId?.trim() || null;

  // ── 1. Resolver/crear el Client ─────────────────────────────────────────────
  let clientId: string;
  if (body.clientId) {
    const g = await guardAccessToClient(body.clientId);
    if (g instanceof NextResponse) return g;
    clientId = body.clientId;
  } else if (body.companyId && body.companyName?.trim()) {
    const existing = await prisma.client.findFirst({
      where: { hubspotCompanyId: body.companyId },
      select: { id: true },
    });
    if (existing) {
      clientId = existing.id;
    } else {
      const created = await prisma.client.create({
        data: {
          name: body.companyName.trim(),
          company: body.companyName.trim(),
          hubspotCompanyId: body.companyId,
          emailDomains: body.domain ? [body.domain.trim().toLowerCase()] : [],
        },
        select: { id: true },
      });
      clientId = created.id;
    }
  } else {
    return NextResponse.json(
      { error: "Falta clientId (cliente existente) o companyId + companyName (cliente nuevo)" },
      { status: 400 },
    );
  }

  // ── 2. Evitar handoff duplicado para el mismo deal (Handoff.hubspotDealId @unique)
  if (dealId) {
    const dup = await prisma.handoff.findUnique({
      where: { hubspotDealId: dealId },
      select: { id: true, clientId: true },
    });
    if (dup) {
      return NextResponse.json(
        { error: "Ya existe un handoff para ese deal", handoffId: dup.id, clientId: dup.clientId },
        { status: 409 },
      );
    }
  }

  const projectName = body.projectName?.trim() || "Onboarding";

  // ── 3. Crear Project + canvases + Handoff (atómico en Nexus) ─────────────────
  try {
    const result = await prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: { clientId, name: projectName, status: "active", hubspotDealId: dealId },
        select: { id: true },
      });

      // Set de canvases del proyecto (Kickoff/Diag/Plan/Crono) + el canvas Handoff.
      await createDefaultCanvases(project.id, tx);
      const handoffCanvasId = await createHandoffCanvas(project.id, tx);

      const handoff = await tx.handoff.create({
        data: {
          clientId,
          projectId: project.id,
          hubspotDealId: dealId,
          hubspotSyncStatus: "pending",
        },
        select: { id: true },
      });

      return { projectId: project.id, handoffId: handoff.id, handoffCanvasId };
    });

    return NextResponse.json({ clientId, ...result }, { status: 201 });
  } catch (e) {
    console.error("[handoffs] create error:", e);
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }
}
