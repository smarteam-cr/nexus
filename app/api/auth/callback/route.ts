import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, getPortalInfo } from "@/lib/hubspot/client";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { requireInternalUser } from "@/lib/auth/supabase";
import { requireAccessToClient } from "@/lib/auth/access";
import { requireCapability } from "@/lib/auth/roles";
import { can } from "@/lib/auth/permissions/engine";
import {
  COOKIE_NONCE_OAUTH,
  PATH_COOKIE_NONCE_OAUTH,
  verificarState,
} from "@/lib/hubspot/oauth-state";

/**
 * GET /api/auth/callback — HubSpot vuelve acá con el `code`.
 *
 * ⛔ ORDEN DE LAS DEFENSAS, y es deliberado: (1) sesión interna, (2) `state` firmado + nonce,
 * (3) permiso por variante — TODO antes de canjear el `code` y antes de tocar la base. Un
 * `state` que no verifica es «no toques nada»: con la versión vieja (base64 sin firma, ruta
 * pública) cualquiera reemplazaba la cuenta de sistema de Smarteam por su propio portal.
 * Ver `lib/hubspot/oauth-state.ts`.
 *
 * ⚠ Esta ruta se alcanza por una redirección top-level desde HubSpot: la cookie de sesión de
 * Supabase (SameSite=Lax) SÍ viaja en esa navegación, así que exigir sesión acá no rompe el flujo.
 */
export async function GET(request: NextRequest) {
  const app = process.env.APP_URL;

  /* Toda salida —éxito o error— borra el nonce: un state es de un solo uso. */
  const salir = (destino: string) => {
    const res = NextResponse.redirect(`${app}${destino}`);
    res.cookies.set(COOKIE_NONCE_OAUTH, "", { maxAge: 0, path: PATH_COOKIE_NONCE_OAUTH });
    return res;
  };

  let ctx: Awaited<ReturnType<typeof requireInternalUser>>;
  try {
    ctx = await requireInternalUser();
  } catch {
    return salir("/?error=not_member");
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const stateStr = searchParams.get("state");
  const error = searchParams.get("error");

  if (error || !code) return salir("/?error=oauth_denied");

  const payload = verificarState(
    stateStr,
    request.cookies.get(COOKIE_NONCE_OAUTH)?.value,
    process.env.HUBSPOT_CLIENT_SECRET,
  );
  if (!payload) return salir("/integrations?error=oauth_state");

  const clientIdPedido = "clientId" in payload ? payload.clientId : null;
  const isNewClient = "newClient" in payload && payload.newClient === true;
  const isSystemLogin = "system" in payload && payload.system === true;

  /* La MISMA regla que al arrancar. El state firmado dice QUÉ se pidió; quién puede se vuelve a
     preguntar acá porque la sesión que completa el flujo no tiene por qué ser la que lo arrancó. */
  try {
    if (isSystemLogin) {
      if (!(await can(ctx.teamMember, "configuracion", "manage"))) return salir("/integrations?error=forbidden");
    } else if (clientIdPedido) {
      await requireAccessToClient(clientIdPedido);
    } else if (isNewClient) {
      await requireCapability("seeAllClients");
    }
  } catch {
    return salir("/?error=forbidden");
  }

  let clientId: string | null = clientIdPedido;

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

      await prisma.hubspotAccount.upsert({
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
      return salir("/integrations?hs_connected=1");
    }

    if (isNewClient && !clientId) {
      await prisma.$transaction(async (tx) => {
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
      await prisma.hubspotAccount.upsert({
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
    if (isNewClient && clientId) return salir(`/clients/${clientId}`);
    if (clientId) return salir(`/clients/${clientId}/settings?connected=1`);
    return salir("/dashboard");
  } catch (err) {
    console.error("OAuth callback error:", err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    return salir("/?error=oauth_failed");
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
