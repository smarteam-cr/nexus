/**
 * lib/escala/responsable.ts — quién decide cómo evoluciona la escala. PURO.
 *
 * El responsable publica las versiones de la escala y lleva el frente «Escala» de «Para ti» («hoy
 * Elías González», dice el manual de operación). Va fijo por CORREO y no por rol: SUPER_ADMIN también lo
 * son otras personas. Sumar a alguien es una línea de acá.
 *
 * Vivía en `lib/escala/comentarios/reglas.ts`; ese módulo se retiró el 2026-10-05, cuando lo que el equipo
 * comenta de la escala pasó a ser feedback (lib/feedback/escala.ts), que decide cualquier super admin.
 */

export const RESPONSABLES_DE_LA_ESCALA: readonly string[] = ["egonzalez@smarteamcr.com"];

const normal = (email: string) => email.trim().toLowerCase();

export function esResponsable(email: string | null | undefined): boolean {
  return !!email && RESPONSABLES_DE_LA_ESCALA.map(normal).includes(normal(email));
}
