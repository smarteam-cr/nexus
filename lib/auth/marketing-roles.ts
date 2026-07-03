/**
 * lib/auth/marketing-roles.ts
 *
 * Roles EDITORES del área de Marketing + Contenido. Fuente ÚNICA — client-safe
 * (SIN imports de server ni de Prisma), como lib/auth/sales-roles.ts.
 *
 * Modelo de acceso del área (decisión del usuario):
 *   - LEER: cualquier rol interno (las secciones Marketing/Contenido son
 *     universales en el sidebar y las páginas no redirigen por rol).
 *   - ESCRIBIR (CRUD de insumos, correr ingesta/agente, podar ideas, aprobar
 *     sugerencias): SOLO estos roles. La API lo exige con `guardMarketingEditor`
 *     y la UI oculta las acciones con `canEdit`.
 */
export const MARKETING_EDITOR_ROLES = ["MARKETING", "CSL", "SUPER_ADMIN"] as const;

/** ¿El roleEnum puede EDITAR el área de Marketing/Contenido? */
export function isMarketingEditor(role: string | null | undefined): boolean {
  return !!role && (MARKETING_EDITOR_ROLES as readonly string[]).includes(role);
}
