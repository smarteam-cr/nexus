import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";

export const POST = withAuth(async (
  _req,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params;

    // Verificar que el cliente existe
    const client = await prisma.client.findUnique({
      where: { id },
      include: { hubspotAccount: { select: { id: true } } },
    });

    if (!client) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    if (!client.hubspotAccount) {
      return NextResponse.json({ error: "No hay HubSpot conectado" }, { status: 400 });
    }

    // Desvincula el clientId de la HubspotAccount (no elimina la cuenta)
    await prisma.hubspotAccount.update({
      where: { id: client.hubspotAccount.id },
      data: { clientId: null },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
