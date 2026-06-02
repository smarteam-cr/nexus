import { prisma } from "@/lib/db/prisma";
import { getSupabaseUser } from "@/lib/supabase/server";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type HubspotAccount = NonNullable<
  Awaited<ReturnType<typeof prisma.hubspotAccount.findUnique>>
>;

// ─── Auth del consultor (compat — usar lib/auth/supabase.ts en código nuevo) ──
//
// Después del cutover a Supabase Auth, estos helpers son wrappers de compat
// para los ~40 archivos que aún importan `requireConsultantSession`. La lógica
// real vive en `lib/auth/supabase.ts` (requireUser / requireInternalUser).
//
// El selector "Soy X" (cookie nexus_cse, sentinel __super_admin__) se eliminó
// — cada usuario es él mismo vía Google OAuth.

/**
 * @deprecated Usar `requireUser()` de `@/lib/auth/supabase` en código nuevo.
 *
 * Verifica si hay sesión Supabase Auth válida.
 */
export async function getConsultantSession(): Promise<boolean> {
  const user = await getSupabaseUser();
  return !!user;
}

/**
 * @deprecated Usar `requireUser()` de `@/lib/auth/supabase` en código nuevo.
 *
 * Lanza un error si no hay sesión. Usar en API routes legacy.
 */
export async function requireConsultantSession(): Promise<void> {
  const user = await getSupabaseUser();
  if (!user) throw new Error("Unauthorized");
}

// ─── HubSpot por cliente ──────────────────────────────────────────────────────

/**
 * Obtiene la cuenta HubSpot vinculada a un cliente, o null si no tiene.
 */
export async function getClientHubspotAccount(
  clientId: string,
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
  clientId: string,
): Promise<HubspotAccount> {
  const account = await getClientHubspotAccount(clientId);
  if (!account) {
    throw new Error("HubSpot no conectado para este cliente");
  }
  return account;
}

// ─── Legacy stubs (eliminar cuando se borren las páginas /implementation/*) ───

/**
 * @deprecated Páginas /implementation/* son legacy. Estos stubs evitan errores
 * de import mientras se eliminan esas rutas. NO usar en código nuevo.
 */
export async function getSession(): Promise<HubspotAccount | null> {
  return null;
}

/**
 * @deprecated Igual que getSession — lanza siempre.
 */
export async function requireSession(): Promise<HubspotAccount> {
  throw new Error("Legacy auth flow eliminado — esta página debería borrarse");
}
