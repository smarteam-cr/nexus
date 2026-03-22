import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type HubspotAccount = NonNullable<
  Awaited<ReturnType<typeof prisma.hubspotAccount.findUnique>>
>;

// ─── Auth del consultor ───────────────────────────────────────────────────────

/**
 * Verifica si hay una sesión de consultor activa.
 * La sesión se setea al hacer login con CONSULTANT_SECRET.
 */
export async function getConsultantSession(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get("consultant_session")?.value === "authenticated";
}

/**
 * Lanza un error si no hay sesión de consultor activa.
 * Usar en Server Components y API routes que requieren autenticación.
 */
export async function requireConsultantSession(): Promise<void> {
  const authenticated = await getConsultantSession();
  if (!authenticated) {
    throw new Error("Unauthorized");
  }
}

// ─── HubSpot por cliente ──────────────────────────────────────────────────────

/**
 * Obtiene la cuenta HubSpot vinculada a un cliente, o null si no tiene.
 */
export async function getClientHubspotAccount(
  clientId: string
): Promise<HubspotAccount | null> {
  return prisma.hubspotAccount.findUnique({
    where: { clientId },
  });
}

/**
 * Obtiene la cuenta HubSpot vinculada a un cliente.
 * Lanza un error si el cliente no tiene HubSpot conectado.
 */
export async function requireClientHubspotAccount(
  clientId: string
): Promise<HubspotAccount> {
  const account = await getClientHubspotAccount(clientId);
  if (!account) {
    throw new Error("HubSpot no conectado para este cliente");
  }
  return account;
}

// ─── Legacy (deprecated) ──────────────────────────────────────────────────────

/**
 * @deprecated Usar getClientHubspotAccount(clientId) + requireConsultantSession()
 * Mantenido durante la transición para no romper código existente.
 */
export async function getSession(): Promise<HubspotAccount | null> {
  const cookieStore = await cookies();
  const accountId = cookieStore.get("account_id")?.value;
  if (!accountId) return null;
  return prisma.hubspotAccount.findUnique({ where: { id: accountId } });
}

/**
 * @deprecated Usar requireClientHubspotAccount(clientId) + requireConsultantSession()
 * Mantenido durante la transición para no romper código existente.
 */
export async function requireSession(): Promise<HubspotAccount> {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}
