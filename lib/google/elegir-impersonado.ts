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
import { esDeNuestroEquipo, esRecursoDeCalendario } from "@/lib/sessions/dominio-propio";

/**
 * ¿Es un RECURSO de Google Calendar (sala, calendario de grupo) y no una persona? A un
 * recurso no se lo puede impersonar aunque sea "del dominio": no es una cuenta de usuario.
 *
 * ⚠ La lista de dominios se MUDÓ a `lib/sessions/dominio-propio.ts` (2026-08-15): la atribución
 * de sesiones necesita el mismo criterio, y dos listas que dicen lo mismo se separan solas. Se
 * re-exporta desde acá porque este archivo era su casa y sus consumidores la importan por acá.
 */
export { esRecursoDeCalendario };

/**
 * PURA. TODOS los candidatos impersonables, en orden determinista: el organizador (si es
 * nuestro) primero, después los participantes internos por orden alfabético, sin repetidos.
 *
 * ── POR QUÉ UNA LISTA Y NO SOLO EL PRIMERO (auditoría 2026-08-08) ────────────
 * `esDeNuestroEquipo` es un check de DOMINIO: un ex-empleado @smarteamcr.com con la cuenta
 * borrada sigue contando como «impersonable». Si es el primero de la lista, la impersonación
 * falla con invalid_grant en TODOS los intentos —es determinista— y la fila se sella por tope
 * aunque otro invitado interno ACTIVO podía leer el mismo doc. El llamador itera la lista
 * ante un fallo de auth; el orden fijo conserva la idempotencia.
 */
export function candidatosImpersonables(
  organizerEmail: string | null,
  participants: readonly string[],
): string[] {
  const out: string[] = [];
  const org = organizerEmail?.trim().toLowerCase() || null;
  if (org && esDeNuestroEquipo(org) && !esRecursoDeCalendario(org)) out.push(org);

  const internos = participants
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p && esDeNuestroEquipo(p) && !esRecursoDeCalendario(p))
    .sort();
  for (const p of internos) if (!out.includes(p)) out.push(p);
  return out;
}

/**
 * PURA. El primer candidato, o `null` = no hay a quién impersonar (reunión 100% externa) —
 * el llamador lo registra como fallo definitivo CON procedencia, no como «sin contenido».
 */
export function elegirImpersonado(
  organizerEmail: string | null,
  participants: readonly string[],
): string | null {
  return candidatosImpersonables(organizerEmail, participants)[0] ?? null;
}
