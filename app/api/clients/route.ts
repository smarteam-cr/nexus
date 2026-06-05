import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";
import { revalidateClientsSidebar } from "@/lib/cache/clients";
import { resolveAllSessions } from "@/lib/sessions/resolve-client";

// GET /api/clients — Listar todos los clientes
export const GET = withAuth(async () => {
  const clients = await prisma.client.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      hubspotAccount: { select: { id: true, hubName: true, hubspotPortalId: true } },
      _count: { select: { audits: true, implementations: true, documents: true } },
    },
  });

  return NextResponse.json(clients);
});

// POST /api/clients — Crear cliente
export const POST = withAuth(async (request) => {
  const { name, company, industry, notes } = await request.json();

  if (!name?.trim()) {
    return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
  }

  const client = await prisma.client.create({
    data: {
      name: name.trim(),
      company: company?.trim() || null,
      industry: industry?.trim() || null,
      notes: notes?.trim() || null,
    },
  });

  // Invalidar cache del sidebar (AppShell)
  revalidateClientsSidebar();
  // PERF #1: cliente nuevo puede matchear sesiones existentes → re-resolver en background.
  void resolveAllSessions().catch(() => {});

  return NextResponse.json(client, { status: 201 });
});
