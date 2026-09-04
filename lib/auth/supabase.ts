/**
 * lib/auth/supabase.ts
 *
 * Helpers de auth basados en Supabase Auth. Reemplazan progresivamente a
 * lib/auth.ts (que se mantiene como fallback durante la Fase D dual-auth).
 *
 * Convención:
 *   - requireUser()         → cualquier AppUser autenticado (INTERNAL o EXTERNAL)
 *   - requireInternalUser() → solo INTERNAL (equipo Smarteam)
 *   - requireExternalUser() → solo EXTERNAL (placeholder, no implementado aún)
 *
 * Cada uno lanza UnauthorizedError (401) o ForbiddenError (403).
 */
import { cache } from "react";
import { getSupabaseUser } from "@/lib/supabase/server";
import { prisma } from "@/lib/db/prisma";
import type { AppUser, TeamMember, TeamRole } from "@prisma/client";

export class UnauthorizedError extends Error {
  status = 401;
  constructor(message = "No autenticado") {
    super(message);
    this.name = "UnauthorizedError";
  }
}
export class ForbiddenError extends Error {
  status = 403;
  constructor(message = "Sin permiso") {
    super(message);
    this.name = "ForbiddenError";
  }
}
export class NotImplementedError extends Error {
  status = 501;
  constructor(message = "No implementado") {
    super(message);
    this.name = "NotImplementedError";
  }
}

export type AppUserWithTeamMember = AppUser & { teamMember: TeamMember | null };

/**
 * Resuelve el AppUser logueado vía sesión Supabase Auth.
 * Lanza UnauthorizedError si no hay sesión, ForbiddenError si la sesión existe
 * pero el email no tiene AppUser asociado (caso raro — un user de auth.users
 * sin row en AppUser, no debería pasar con el callback funcionando bien).
 *
 * `cache()` de React (C-07): una sola resolución por request aunque la pidan el layout, la
 * página y varios guards — cada llamada extra era un viaje a Supabase Auth Y una lectura de
 * AppUser. Un 401/403 también se memoriza dentro del request, que es lo correcto: la sesión
 * no cambia a mitad de un render. `requireInternalUser` y compañía no necesitan su propio
 * `cache`: derivan de esta.
 */
export const requireUser = cache(async (): Promise<AppUserWithTeamMember> => {
  const supabaseUser = await getSupabaseUser();
  if (!supabaseUser?.email) throw new UnauthorizedError();

  const appUser = await prisma.appUser.findUnique({
    where: { email: supabaseUser.email.toLowerCase() },
    include: { teamMember: true },
  });
  if (!appUser) throw new ForbiddenError("Usuario autenticado pero sin AppUser");
  return appUser;
});

/**
 * Requiere un usuario INTERNAL del equipo Smarteam. Devuelve el AppUser, su
 * TeamMember asociado y su rol enum. 403 si no es interno o no tiene
 * TeamMember vinculado.
 */
export async function requireInternalUser(): Promise<{
  user: AppUserWithTeamMember;
  teamMember: TeamMember;
  role: TeamRole;
}> {
  const user = await requireUser();
  if (user.kind !== "INTERNAL") {
    throw new ForbiddenError("Se requiere usuario interno (equipo Smarteam)");
  }
  if (!user.teamMember) {
    throw new ForbiddenError("Usuario interno sin TeamMember vinculado");
  }
  if (user.teamMember.deactivatedAt) {
    throw new ForbiddenError("Tu cuenta del equipo fue desactivada. Contactá a un administrador.");
  }
  return { user, teamMember: user.teamMember, role: user.teamMember.roleEnum };
}

/**
 * Placeholder para usuarios EXTERNAL (clientes finales). El flujo externo no
 * se construye en este cambio — esta función queda preparada para cuando se
 * abra el módulo de onboarding.
 */
export async function requireExternalUser(): Promise<{
  user: AppUserWithTeamMember;
  clientId: string;
}> {
  const user = await requireUser();
  if (user.kind !== "EXTERNAL" || !user.clientId) {
    throw new NotImplementedError("Flujo externo aún no implementado");
  }
  return { user, clientId: user.clientId };
}
