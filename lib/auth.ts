import { prisma } from "@/lib/db/prisma";
import { getSupabaseUser } from "@/lib/supabase/server";
import { requireInternalUser } from "@/lib/auth/supabase";

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
 * @deprecated Usar `requireInternalUser()` de `@/lib/auth/supabase` en código nuevo.
 *
 * ⛔ DESDE 2026-09-04 EXIGE USUARIO INTERNO ACTIVO, no solo sesión.
 *
 * Antes miraba únicamente que existiera un usuario de Supabase. Eso dejaba abiertas dos puertas,
 * medidas en la auditoría del 2026-09-03: (1) un empleado DESACTIVADO con la pestaña abierta seguía
 * entrando por los 35 handlers y las 13 páginas que llaman a esta función — y no expiraba nunca,
 * porque el middleware le renueva la sesión en cada request; (2) cualquier cuenta de Supabase sin
 * `AppUser INTERNAL` (el callback de login la rechaza, pero una sesión ya emitida no vuelve a pasar
 * por ahí) entraba igual. Entre lo que exponían: el `systemPrompt` completo de los 30 agentes y las
 * transcripciones de cualquier reunión.
 *
 * Delegar en `requireInternalUser` cierra las dos de una: exige `kind === "INTERNAL"`, TeamMember
 * vinculado y `deactivatedAt` nulo. Nadie que hoy PUEDA loguearse queda afuera, porque el callback
 * ya exige exactamente eso al entrar. Lo único que cambia es que dejar de ser del equipo surte
 * efecto en el próximo request, no en el próximo login.
 */
export async function requireConsultantSession(): Promise<void> {
  await requireInternalUser();
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

// Los stubs `getSession` / `requireSession` vivían acá para que las páginas
// /implementation/* compilaran mientras se retiraban. Esas rutas se borraron el
// 2026-08-17 (Tanda T) junto con el chat viejo, así que los stubs se fueron con ellas.
