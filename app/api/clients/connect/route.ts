import { NextRequest, NextResponse } from "next/server";
import { requireConsultantSession } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { revalidateClientsSidebar } from "@/lib/cache/clients";

// ── Types ──────────────────────────────────────────────────────────────────────

interface AccountDetails {
  portalId: number;
  timeZone?: string;
  companyCurrency?: string;
  dataHostingLocation?: string;
}

interface HsCompany {
  id: string;
  properties: Record<string, string | null>;
}

// ── POST /api/clients/connect ──────────────────────────────────────────────────
// Crea un nuevo cliente a partir de un HubSpot Private App Token.
// No requiere OAuth ni redirects de browser.

export async function POST(request: NextRequest) {
  try {
    await requireConsultantSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let token: string;
  try {
    const body = await request.json();
    token = (body.token ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  if (!token) {
    return NextResponse.json({ error: "Token requerido" }, { status: 400 });
  }

  // 1. Validar token con HubSpot
  const accountRes = await fetch("https://api.hubapi.com/account-info/v3/details", {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!accountRes.ok) {
    return NextResponse.json(
      { error: "Token inválido. Verifica que el Private App tenga permisos de CRM." },
      { status: 400 }
    );
  }

  const accountData = (await accountRes.json()) as AccountDetails;
  const portalId = String(accountData.portalId);

  // 2. Verificar si este portal ya está conectado a otro cliente
  const existing = await prisma.hubspotAccount.findUnique({
    where: { hubspotPortalId: portalId },
    include: { client: { select: { id: true, name: true } } },
  });

  if (existing?.client) {
    return NextResponse.json(
      { error: `Este portal ya está conectado al cliente "${existing.client.name}".` },
      { status: 409 }
    );
  }

  // 3. Buscar la empresa principal del portal (la más antigua = la propia empresa)
  const company = await findMainCompany(token);

  // 4. Crear el Client con datos de HubSpot
  const client = await prisma.client.create({
    data: {
      name: company?.name || `Portal ${portalId}`,
      company: company?.name || null,
      industry: company?.industry || null,
      hubspotCompanyId: company?.id || null,
    },
  });

  // 5. Crear o actualizar HubspotAccount vinculada al nuevo client
  if (existing) {
    // El portal existe sin cliente → actualizarlo
    await prisma.hubspotAccount.update({
      where: { hubspotPortalId: portalId },
      data: {
        clientId: client.id,
        accessToken: token,
        refreshToken: "", // Private Apps no usan refresh token
        expiresAt: new Date("2099-01-01"), // No expira
        hubName: company?.domain ?? null,
      },
    });
  } else {
    await prisma.hubspotAccount.create({
      data: {
        hubspotPortalId: portalId,
        hubName: company?.domain ?? null,
        accessToken: token,
        refreshToken: "", // Private Apps no usan refresh token
        expiresAt: new Date("2099-01-01"), // No expira
        clientId: client.id,
      },
    });
  }

  // Invalidar cache del sidebar — el nuevo cliente debe aparecer
  revalidateClientsSidebar();

  return NextResponse.json({ clientId: client.id }, { status: 201 });
}

// ── Buscar empresa principal del portal ───────────────────────────────────────
// Ordena por fecha de creación ASC → la más antigua suele ser la empresa dueña.

async function findMainCompany(token: string): Promise<{
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
} | null> {
  try {
    const res = await fetch("https://api.hubapi.com/crm/v3/objects/companies/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filterGroups: [],
        properties: ["name", "domain", "industry"],
        sorts: [{ propertyName: "createdate", direction: "ASCENDING" }],
        limit: 1,
      }),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as { results: HsCompany[] };
    if (data.results?.length > 0) {
      const c = data.results[0];
      return {
        id: c.id,
        name: c.properties.name ?? "",
        domain: c.properties.domain ?? null,
        industry: c.properties.industry ?? null,
      };
    }
  } catch {
    // non-fatal
  }
  return null;
}
