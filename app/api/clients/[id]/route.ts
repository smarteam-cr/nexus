import { NextRequest, NextResponse } from "next/server";
import { requireConsultantSession } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { revalidateClientsSidebar } from "@/lib/cache/clients";

// GET /api/clients/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireConsultantSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      hubspotAccount: { select: { id: true, hubName: true, hubspotPortalId: true } },
      projects: {
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, status: true, projectType: true, serviceType: true, tags: true, currentStage: true, currentStep: true },
      },
      _count: { select: { audits: true, implementations: true, documents: true } },
    },
  });

  if (!client) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  return NextResponse.json(client);
}

// PATCH /api/clients/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireConsultantSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const data = await request.json();

  const client = await prisma.client.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.company !== undefined && { company: data.company?.trim() || null }),
      ...(data.industry !== undefined && { industry: data.industry?.trim() || null }),
      ...(data.notes !== undefined && { notes: data.notes?.trim() || null }),
      ...(data.emailDomains !== undefined && {
        emailDomains: (data.emailDomains as string[])
          .map((d: string) => d.trim().toLowerCase().replace(/^@/, ""))
          .filter(Boolean),
      }),
    },
  });

  // Si cambió name o company, el sidebar muestra outdated → invalidar
  if (data.name !== undefined || data.company !== undefined) {
    revalidateClientsSidebar();
  }

  return NextResponse.json(client);
}

// DELETE /api/clients/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireConsultantSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  await prisma.client.delete({ where: { id } });

  // Invalidar sidebar — el cliente ya no debe aparecer
  revalidateClientsSidebar();

  return NextResponse.json({ ok: true });
}
