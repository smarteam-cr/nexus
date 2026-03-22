import { NextRequest, NextResponse } from "next/server";
import { requireConsultantSession } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { buildLifecycleSnapshot } from "@/lib/hubspot/portal-analyzer";

export async function GET() {
  try {
    await requireConsultantSession();
    const audits = await prisma.audit.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json(audits);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireConsultantSession();
    const { name, clientId } = (await request.json()) as { name?: string; clientId?: string };

    // Obtener la cuenta HubSpot del cliente (si hay clientId) o la primera disponible
    const account = clientId
      ? await prisma.hubspotAccount.findUnique({ where: { clientId } })
      : await prisma.hubspotAccount.findFirst();

    if (!account) {
      return NextResponse.json({ error: "No hay cuenta HubSpot conectada" }, { status: 400 });
    }

    // Captura el snapshot de ciclo de vida en el momento de crear la auditoría
    const snapshot = await buildLifecycleSnapshot(account.id);

    const audit = await prisma.audit.create({
      data: {
        accountId: account.id,
        ...(clientId && { clientId }),
        name:
          name?.trim() ||
          `Auditoría ${new Date().toLocaleDateString("es-ES", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}`,
        data: snapshot as object,
      },
    });

    return NextResponse.json(audit, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
