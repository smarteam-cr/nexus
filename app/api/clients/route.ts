import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { guardInternalUser, guardCapability } from "@/lib/auth/api-guards";
import { accessibleClientWhere } from "@/lib/auth/access";
import { revalidateClientsSidebar } from "@/lib/cache/clients";
import { resolveAllSessions } from "@/lib/sessions/resolve-client";

// GET /api/clients — Lista los clientes VISIBLES para el usuario (server-side).
export async function GET() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;

  const where = await accessibleClientWhere(guard.user);
  const clients = await prisma.client.findMany({
    where: where ?? undefined,
    orderBy: { createdAt: "desc" },
    include: {
      hubspotAccount: { select: { id: true, hubName: true, hubspotPortalId: true } },
      _count: { select: { audits: true, implementations: true, documents: true } },
    },
  });

  return NextResponse.json(clients);
}

// POST /api/clients — Crear cliente (roles con visibilidad total: VENTAS/CSL/MARKETING/SUPER_ADMIN).
export async function POST(request: Request) {
  const guard = await guardCapability("seeAllClients");
  if (guard instanceof NextResponse) return guard;

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
}
