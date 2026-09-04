/**
 * lib/auth/enmascarar-correo.ts — UN CORREO EN UN LOG ES UN DATO PERSONAL.
 *
 * A-15 (auditoría 2026-09-03): el callback de auth escribía el correo completo de cada intento
 * fallido de entrar (fuera de dominio, sin AppUser, desactivado). Los logs viajan a Docker, a
 * quien haga `docker logs` y a cualquier agregador que se conecte mañana. Lo que hace útil un
 * log de intento fallido es el DOMINIO y una pista para correlacionar —la primera letra—, no la
 * identidad entera de alguien que quizás ni es del equipo.
 */
export function enmascararCorreo(correo: string): string {
  const at = correo.indexOf("@");
  if (at <= 0) return "***";
  return `${correo[0]}***@${correo.slice(at + 1)}`;
}
