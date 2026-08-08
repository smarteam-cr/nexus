/**
 * lib/google/elegir-impersonado.ts — A QUIÉN impersona Nexus para leer el material de una
 * reunión. Puro: la política entera cabe en una tabla de test.
 *
 * ── EL AGUJERO QUE ESTO CIERRA (2026-08-08) ──────────────────────────────────
 * El enriquecimiento impersonaba SIEMPRE al organizador. Si la reunión la creó el cliente
 * —o una sala de reuniones del calendario— la impersonación es imposible por diseño: la
 * delegación de dominio solo cubre cuentas NUESTRAS. Medido: ~267 reuniones con organizador
 * externo al 7% de éxito, y una sala del equipo con 25 documentos y CERO legibles. Todo ese
 * material existe y se compartió con los invitados; solo faltaba leerlo con la cuenta de un
 * invitado nuestro.
 *
 * Decisión de Elías (2026-08-08): «sí, siempre que haya un miembro nuestro invitado».
 *
 * ── POR QUÉ EL PRIMER INTERNO EN ORDEN ALFABÉTICO ────────────────────────────
 * Determinismo = idempotencia: la misma sesión elige siempre a la misma persona, así que un
 * reintento no cambia de cuenta a mitad de camino y el diagnóstico de un fallo es
 * reproducible. No hay ninguna razón de negocio para preferir a una persona sobre otra —
 * cualquier invitado ve el mismo doc compartido.
 */
import { esDeNuestroEquipo } from "@/lib/sessions/dominio-propio";

/**
 * ¿Es un RECURSO de Google Calendar (sala, calendario de grupo) y no una persona? A un
 * recurso no se lo puede impersonar aunque sea "del dominio": no es una cuenta de usuario.
 */
export function esRecursoDeCalendario(email: string): boolean {
  const e = email.toLowerCase();
  return e.endsWith("@group.calendar.google.com") || e.endsWith("@resource.calendar.google.com");
}

/**
 * PURA. `null` = no hay a quién impersonar (reunión 100% externa) — el llamador lo registra
 * como fallo CON procedencia, no lo sella como «sin contenido».
 */
export function elegirImpersonado(
  organizerEmail: string | null,
  participants: readonly string[],
): string | null {
  const org = organizerEmail?.trim().toLowerCase() || null;
  if (org && esDeNuestroEquipo(org) && !esRecursoDeCalendario(org)) return org;

  const internos = participants
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p && esDeNuestroEquipo(p) && !esRecursoDeCalendario(p))
    .sort();
  return internos[0] ?? null;
}
