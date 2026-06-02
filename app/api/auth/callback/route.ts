import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, getPortalInfo } from "@/lib/hubspot/client";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const stateStr = searchParams.get("state");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(
      `${process.env.APP_URL}/?error=oauth_denied`
    );
  }

  let clientId: string | null = null;
  let isNewClient = false;
  let isSystemLogin = false;

  if (stateStr) {
    try {
      const stateData = JSON.parse(
        Buffer.from(stateStr, "base64").toString("utf-8")
      );
      clientId = stateData.clientId ?? null;
      isNewClient = stateData.newClient === true;
      isSystemLogin = stateData.system === true;
    } catch {
      // state invalido
    }
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const portalInfo = await getPortalInfo(tokens.access_token);

    if (isSystemLogin) {
      // Eliminar otras cuentas del sistema que no sean este portal
      // (evita duplicados cuando se reconecta con un portal distinto)
      await prisma.hubspotAccount.deleteMany({
        where: {
          isSystem: true,
          NOT: { hubspotPortalId: String(portalInfo.hub_id) },
        },
      });

      const account = await prisma.hubspotAccount.upsert({
        where: { hubspotPortalId: String(portalInfo.hub_id) },
        create: {
          hubspotPortalId: String(portalInfo.hub_id),
          hubName: portalInfo.hub_domain,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          isSystem: true,
        },
        update: {
          hubName: portalInfo.hub_domain,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          isSystem: true,
          portalSnapshot: Prisma.DbNull,
          portalSnapshotAt: null,
        },
      });

      // Nota: las cookies consultant_session/account_id se eliminaron en el
      // cutover a Supabase Auth (junio 2026). El usuario que llega acá ya está
      // logueado vía Google OAuth — este callback solo conecta HubSpot al
      // sistema, no autentica.
      return NextResponse.redirect(`${process.env.APP_URL}/clients`);
    }

    let account: { id: string };

    if (isNewClient && !clientId) {
      account = await prisma.$transaction(async (tx) => {
        const existing = await tx.hubspotAccount.findUnique({
          where: { hubspotPortalId: String(portalInfo.hub_id) },
          select: { id: true, clientId: true },
        });

        if (existing?.clientId) {
          clientId = existing.clientId;
          return tx.hubspotAccount.update({
            where: { id: existing.id },
            data: {
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token,
              expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
              portalSnapshot: Prisma.DbNull,
              portalSnapshotAt: null,
            },
          });
        }

        const company = await findMainCompany(tokens.access_token, portalInfo.hub_domain);
        const newClientRecord = await tx.client.create({
          data: {
            name: company?.name || portalInfo.hub_domain,
            company: company?.name || null,
            industry: company?.industry || null,
            hubspotCompanyId: company?.id || null,
          },
        });

        clientId = newClientRecord.id;

        return tx.hubspotAccount.upsert({
          where: { hubspotPortalId: String(portalInfo.hub_id) },
          create: {
            hubspotPortalId: String(portalInfo.hub_id),
            hubName: portalInfo.hub_domain,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
            clientId: newClientRecord.id,
          },
          update: {
            hubName: portalInfo.hub_domain,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
            portalSnapshot: Prisma.DbNull,
            portalSnapshotAt: null,
            clientId: newClientRecord.id,
          },
        });
      });
    } else {
      account = await prisma.hubspotAccount.upsert({
        where: { hubspotPortalId: String(portalInfo.hub_id) },
        create: {
          hubspotPortalId: String(portalInfo.hub_id),
          hubName: portalInfo.hub_domain,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          ...(clientId ? { clientId } : {}),
        },
        update: {
          hubName: portalInfo.hub_domain,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          portalSnapshot: Prisma.DbNull,
          portalSnapshotAt: null,
          ...(clientId ? { clientId } : {}),
        },
      });
    }

    // (Cookie account_id eliminada en cutover a Supabase Auth — junio 2026)
    if (isNewClient && clientId) {
      return NextResponse.redirect(`${process.env.APP_URL}/clients/${clientId}/stage/1`);
    }
    if (clientId) {
      return NextResponse.redirect(`${process.env.APP_URL}/clients/${clientId}/settings?connected=1`);
    }
    return NextResponse.redirect(`${process.env.APP_URL}/dashboard`);
  } catch (err) {
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(`${process.env.APP_URL}/?error=oauth_failed`);
  }
}

async function findMainCompany(
  accessToken: string,
  hubDomain: string
): Promise<{ id: string; name: string; industry: string | null } | null> {
  try {
    const res = await fetch("https://api.hubapi.com/crm/v3/objects/companies/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: "domain", operator: "EQ", value: hubDomain }] }],
        properties: ["name", "domain", "industry"],
        limit: 1,
      }),
    });

    if (!res.ok) return null;

    const data = await res.json() as {
      results: Array<{ id: string; properties: Record<string, string | null> }>;
    };

    if (data.results?.length > 0) {
      const c = data.results[0];
      return { id: c.id, name: c.properties.name ?? hubDomain, industry: c.properties.industry ?? null };
    }
  } catch {
    // non-fatal
  }
  return null;
}
