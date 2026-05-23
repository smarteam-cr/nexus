import { withAuth } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";
import { getHubspotClient, getSystemHubspotClient } from "@/lib/hubspot/client";
import { Client } from "@hubspot/api-client";
import { NextResponse } from "next/server";

// ── Propiedades de empresa a obtener de HubSpot ──────────────────────────────

const COMPANY_PROPS = [
  "name",
  "domain",
  "industry",
  "annualrevenue",
  "numberofemployees",
  "city",
  "country",
  "phone",
  "lifecyclestage",
  "hs_lead_status",
  "description",
  "createdate",
  "hs_lastmodifieddate",
  "hubspot_owner_id",
  "type",
  "founded_year",
  "website",
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface AccountDetails {
  portalId?: number;
  timeZone?: string;
  dataHostingLocation?: string;
  companyCurrency?: string;
}

interface HsCompany {
  id: string;
  properties: Record<string, string | null>;
}

interface SearchResult {
  results: HsCompany[];
  total: number;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const GET = withAuth(async (
  _request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id: clientId } = await params;

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { hubspotAccount: true },
  });

  if (!client) {
    return NextResponse.json({ connected: false });
  }

  // ── Caso 1: cliente con su propia cuenta HubSpot ──────────────────────────
  if (client.hubspotAccount) {
    return handleWithClientAccount(client, client.hubspotAccount);
  }

  // ── Caso 2: sin cuenta propia pero tiene hubspotCompanyId → usar sistema ──
  if (client.hubspotCompanyId) {
    return handleWithSystemAccount(client);
  }

  return NextResponse.json({ connected: false });
});

// ── Con cuenta del cliente ────────────────────────────────────────────────────

async function handleWithClientAccount(
  client: { id: string; name: string; company: string | null; hubspotCompanyId: string | null },
  hubspotAccount: { id: string; hubName: string | null; hubspotPortalId: string }
) {
  try {
    const hsClient = await getHubspotClient(hubspotAccount.id);

    const accountRes = await hsClient.apiRequest({
      method: "GET",
      path: "/account-info/v3/details",
    });
    const accountData = (await accountRes.json()) as AccountDetails;

    let hubspotCompany: HsCompany | null = null;

    if (client.hubspotCompanyId) {
      hubspotCompany = await fetchCompanyById(hsClient, client.hubspotCompanyId);
    } else {
      hubspotCompany = await findCompanyFuzzy(hsClient, {
        companyName: client.company,
        clientName: client.name,
        hubName: hubspotAccount.hubName,
      });
      if (hubspotCompany) {
        await prisma.client.update({
          where: { id: client.id },
          data: { hubspotCompanyId: hubspotCompany.id },
        }).catch(() => {});
      }
    }

    const companyUrl = hubspotCompany
      ? `https://app.hubspot.com/contacts/${hubspotAccount.hubspotPortalId}/company/${hubspotCompany.id}`
      : null;

    return NextResponse.json({
      connected: true,
      source: "client",
      hubName: hubspotAccount.hubName,
      hubspotPortalId: hubspotAccount.hubspotPortalId,
      timeZone: accountData.timeZone ?? null,
      dataHostingLocation: accountData.dataHostingLocation ?? null,
      companyCurrency: accountData.companyCurrency ?? null,
      hubspotCompanyId: hubspotCompany?.id ?? null,
      hubspotCompanyUrl: companyUrl,
      hubspotCompany: hubspotCompany?.properties ?? null,
    });
  } catch {
    return NextResponse.json({
      connected: true,
      source: "client",
      hubName: hubspotAccount.hubName,
      hubspotPortalId: hubspotAccount.hubspotPortalId,
      hubspotCompanyUrl: `https://app.hubspot.com/contacts/${hubspotAccount.hubspotPortalId}/companies/list`,
    });
  }
}

// ── Con cuenta del sistema ────────────────────────────────────────────────────

async function handleWithSystemAccount(
  client: { id: string; name: string; company: string | null; hubspotCompanyId: string | null }
) {
  try {
    const hsClient = await getSystemHubspotClient();

    const systemAccount = await prisma.hubspotAccount.findFirst({
      where: { isSystem: true },
      select: { hubspotPortalId: true, hubName: true },
    });

    const hubspotCompany = client.hubspotCompanyId
      ? await fetchCompanyById(hsClient, client.hubspotCompanyId)
      : null;

    const companyUrl = hubspotCompany && systemAccount
      ? `https://app.hubspot.com/contacts/${systemAccount.hubspotPortalId}/company/${hubspotCompany.id}`
      : null;

    return NextResponse.json({
      connected: true,
      source: "system",
      hubName: systemAccount?.hubName ?? null,
      hubspotPortalId: systemAccount?.hubspotPortalId ?? null,
      hubspotCompanyId: hubspotCompany?.id ?? null,
      hubspotCompanyUrl: companyUrl,
      hubspotCompany: hubspotCompany?.properties ?? null,
    });
  } catch {
    return NextResponse.json({ connected: false });
  }
}

// ── Fetch por ID directo ──────────────────────────────────────────────────────

async function fetchCompanyById(
  hsClient: Client,
  companyId: string
): Promise<HsCompany | null> {
  try {
    const res = await hsClient.apiRequest({
      method: "GET",
      path: `/crm/v3/objects/companies/${companyId}?properties=${COMPANY_PROPS.join(",")}`,
    });
    return (await res.json()) as HsCompany;
  } catch {
    return null;
  }
}

// ── Búsqueda fuzzy (solo cuando no hay ID guardado) ───────────────────────────

async function findCompanyFuzzy(
  hsClient: Client,
  opts: {
    companyName: string | null;
    clientName: string;
    hubName: string | null;
  }
): Promise<HsCompany | null> {
  const { companyName, clientName, hubName } = opts;

  const searches: Array<{ propertyName: string; operator: string; value: string }> = [];

  if (hubName) {
    searches.push({ propertyName: "domain", operator: "EQ", value: hubName });
  }
  if (companyName) {
    searches.push({ propertyName: "name", operator: "EQ", value: companyName });
    searches.push({ propertyName: "name", operator: "CONTAINS_TOKEN", value: companyName });
  }
  if (clientName !== companyName) {
    searches.push({ propertyName: "name", operator: "CONTAINS_TOKEN", value: clientName });
  }

  for (const filter of searches) {
    try {
      const res = await hsClient.apiRequest({
        method: "POST",
        path: "/crm/v3/objects/companies/search",
        body: {
          filterGroups: [{ filters: [filter] }],
          properties: COMPANY_PROPS,
          limit: 1,
        },
      });

      const data = (await res.json()) as SearchResult;
      if (data.results?.length > 0) return data.results[0];
    } catch {
      continue;
    }
  }

  return null;
}
