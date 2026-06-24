import { Client } from "@hubspot/api-client";
import { prisma } from "@/lib/db/prisma";

// ── Cuenta del sistema (Smarteam) ─────────────────────────────────────────────

export async function getSystemHubspotClient(): Promise<Client> {
  const account = await prisma.hubspotAccount.findFirst({
    where: { isSystem: true },
  });
  if (!account) throw new Error("No hay cuenta HubSpot del sistema configurada");
  if (account.expiresAt <= new Date(Date.now() + 5 * 60 * 1000)) {
    const refreshed = await refreshAccessToken(account.refreshToken);
    await prisma.hubspotAccount.update({
      where: { id: account.id },
      data: {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      },
    });
    return new Client({ accessToken: refreshed.access_token });
  }
  return new Client({ accessToken: account.accessToken });
}

/**
 * Fuerza el refresh del token del sistema y lo guarda, IGNORANDO `expiresAt`. Para usar
 * cuando una llamada devolvió 401 aunque `expiresAt` diga "válido": pasa por clock skew o
 * rotación del token entre entornos que comparten la cuenta del sistema (PROD + local). El
 * llamador debe re-obtener el cliente con getSystemHubspotClient() después.
 */
export async function forceRefreshSystemToken(): Promise<void> {
  const account = await prisma.hubspotAccount.findFirst({ where: { isSystem: true } });
  if (!account) throw new Error("No hay cuenta HubSpot del sistema configurada");
  const refreshed = await refreshAccessToken(account.refreshToken);
  await prisma.hubspotAccount.update({
    where: { id: account.id },
    data: {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
    },
  });
}

export async function getSystemAccessToken(): Promise<string> {
  const account = await prisma.hubspotAccount.findFirst({
    where: { isSystem: true },
  });
  if (!account) throw new Error("No hay cuenta HubSpot del sistema configurada");
  if (account.expiresAt <= new Date(Date.now() + 5 * 60 * 1000)) {
    const refreshed = await refreshAccessToken(account.refreshToken);
    await prisma.hubspotAccount.update({
      where: { id: account.id },
      data: {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      },
    });
    return refreshed.access_token;
  }
  return account.accessToken;
}

export async function getHubspotClient(accountId: string): Promise<Client> {
  const account = await prisma.hubspotAccount.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    throw new Error(`HubSpot account not found: ${accountId}`);
  }

  // Refresh token if expired (with 5 min buffer)
  if (account.expiresAt <= new Date(Date.now() + 5 * 60 * 1000)) {
    const refreshed = await refreshAccessToken(account.refreshToken);
    await prisma.hubspotAccount.update({
      where: { id: accountId },
      data: {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      },
    });
    return new Client({ accessToken: refreshed.access_token });
  }

  return new Client({ accessToken: account.accessToken });
}

export async function refreshAccessToken(refreshToken: string) {
  const response = await fetch("https://api.hubapi.com/oauth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.HUBSPOT_CLIENT_ID!,
      client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to refresh HubSpot token");
  }

  return response.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }>;
}

export async function exchangeCodeForTokens(code: string) {
  const response = await fetch("https://api.hubapi.com/oauth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.HUBSPOT_CLIENT_ID!,
      client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
      redirect_uri: process.env.HUBSPOT_REDIRECT_URI!,
      code,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HubSpot OAuth error: ${error}`);
  }

  return response.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    hub_id: number;
    hub_domain: string;
    token_type: string;
  }>;
}

export async function getPortalInfo(accessToken: string) {
  const response = await fetch(
    "https://api.hubapi.com/oauth/v1/access-tokens/" + accessToken
  );
  if (!response.ok) throw new Error("Failed to get portal info");
  return response.json() as Promise<{
    hub_id: number;
    hub_domain: string;
    app_id: number;
    token_type: string;
    user: string;
    scopes: string[];
  }>;
}
