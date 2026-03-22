import { requireConsultantSession } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getHubspotClient } from "@/lib/hubspot/client";
import { NextRequest, NextResponse } from "next/server";

interface HsCompany {
  id: string;
  properties: {
    name?: string | null;
    domain?: string | null;
    city?: string | null;
    country?: string | null;
    industry?: string | null;
    numberofemployees?: string | null;
    lifecyclestage?: string | null;
  };
}

interface SearchResult {
  results: HsCompany[];
  total: number;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireConsultantSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: clientId } = await params;
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (q.length < 2) {
    return NextResponse.json([]);
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { hubspotAccount: { select: { id: true } } },
  });

  if (!client?.hubspotAccount) {
    return NextResponse.json({ error: "No HubSpot account" }, { status: 400 });
  }

  try {
    const hsClient = await getHubspotClient(client.hubspotAccount.id);

    const res = await hsClient.apiRequest({
      method: "POST",
      path: "/crm/v3/objects/companies/search",
      body: {
        filterGroups: [
          {
            filters: [
              {
                propertyName: "name",
                operator: "CONTAINS_TOKEN",
                value: q,
              },
            ],
          },
          {
            filters: [
              {
                propertyName: "domain",
                operator: "CONTAINS_TOKEN",
                value: q,
              },
            ],
          },
        ],
        properties: [
          "name",
          "domain",
          "city",
          "country",
          "industry",
          "numberofemployees",
          "lifecyclestage",
        ],
        limit: 10,
        sorts: [{ propertyName: "name", direction: "ASCENDING" }],
      },
    });

    const data = (await res.json()) as SearchResult;

    return NextResponse.json(
      (data.results ?? []).map((c) => ({
        id: c.id,
        name: c.properties.name ?? "(sin nombre)",
        domain: c.properties.domain ?? null,
        city: c.properties.city ?? null,
        country: c.properties.country ?? null,
        industry: c.properties.industry ?? null,
        employees: c.properties.numberofemployees ?? null,
        lifecycle: c.properties.lifecyclestage ?? null,
      }))
    );
  } catch (e) {
    console.error("HubSpot company search error:", e);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
