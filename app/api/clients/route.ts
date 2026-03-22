import { NextRequest, NextResponse } from "next/server";
import { requireConsultantSession } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { syncFirefliesSessions, extractTitleTerms, extractDomain } from "@/lib/fireflies/sync";

// GET /api/clients — Listar todos los clientes
export async function GET() {
  try {
    await requireConsultantSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clients = await prisma.client.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      hubspotAccount: { select: { id: true, hubName: true, hubspotPortalId: true } },
      _count: { select: { audits: true, implementations: true, documents: true } },
    },
  });

  return NextResponse.json(clients);
}

// POST /api/clients — Crear cliente
export async function POST(request: NextRequest) {
  try {
    await requireConsultantSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  // Disparar sync de Fireflies en background para el nuevo cliente.
  // Pasamos los datos del cliente como matcher extra porque el cliente
  // recién fue creado y la DB aún puede no reflejarlo en la primera consulta
  // del sync (race condition mínima, pero lo evitamos así).
  if (process.env.FIREFLIES_API_KEY) {
    const extraMatchers = [
      {
        name: client.name,
        titleTerms: extractTitleTerms(client.name),
        domain: client.company ? extractDomain(client.company) : null,
      },
    ].filter((m) => m.titleTerms.length > 0 || m.domain !== null);

    void syncFirefliesSessions(extraMatchers).catch((err) => {
      console.error("[clients] Error en sync Fireflies background:", err);
    });
  }

  return NextResponse.json(client, { status: 201 });
}
