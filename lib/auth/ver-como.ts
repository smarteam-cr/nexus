/**
 * lib/auth/ver-como.ts — «Ver como otra persona» (2026-10-13). PURO: lo leen el middleware (edge), la cadena de
 * identidad y la pantalla.
 *
 * Pedido de Elías: «que los super admins, desde producción, puedan ver como "otro usuario"… para testear cómo ve
 * otro usuario las cosas». Un SUPER_ADMIN elige a alguien en Equipo y Nexus le muestra TODO como lo ve esa persona:
 * su menú, sus permisos, sus clientes, su «Para ti» y sus tareas. Es la misma identidad, no una imitación: la elige
 * `requireUser` (lib/auth/supabase.ts), de donde sale todo lo demás.
 *
 * ⛔ SOLO LECTURA, y lo hace cumplir el middleware: con la cookie puesta, ningún POST/PUT/PATCH/DELETE pasa (salvo
 * salir). Así nada se escribe a nombre de la otra persona: ni un «leído» en su «Para ti», ni una corrida de IA, ni un
 * cambio de etapa. La cookie sola no da nada: `requireUser` la honra solo si quien tiene la sesión es SUPER_ADMIN.
 */

/** La cookie con el id del TeamMember que se está mirando. */
export const COOKIE_VER_COMO = "nexus-ver-como";

/** La única ruta que acepta escrituras mientras se mira como otra persona: entrar y salir. */
export const RUTA_VER_COMO = "/api/ver-como";

/** Cuánto dura una vista sin volver a pedirla (4 h): si alguien se olvida, vuelve solo a su usuario. */
export const DURACION_VER_COMO_SEGUNDOS = 4 * 60 * 60;

const METODOS_DE_LECTURA = new Set(["GET", "HEAD", "OPTIONS"]);

/** ¿El middleware corta este pedido? Solo con la cookie puesta, solo si escribe, y nunca la ruta de salir. */
export function bloqueaEscritura(metodo: string, ruta: string, conCookie: boolean): boolean {
  if (!conCookie) return false;
  if (METODOS_DE_LECTURA.has(metodo.toUpperCase())) return false;
  return !(ruta === RUTA_VER_COMO || ruta.startsWith(`${RUTA_VER_COMO}/`));
}

/** El mensaje del 403 que devuelve el middleware. */
export const MENSAJE_SOLO_LECTURA =
  "Estás viendo Nexus como otra persona: es solo lectura. Vuelve a tu usuario para hacer cambios.";

interface Persona {
  id: string;
  roleEnum: string;
  deactivatedAt: Date | string | null;
}

/**
 * ¿`real` puede mirar como `objetivo`? Solo un SUPER_ADMIN activo, a otra persona activa del equipo que no sea
 * SUPER_ADMIN (mirar como otro admin no muestra nada distinto y confunde quién es quién). Devuelve el motivo si no.
 */
export function motivoParaNoVerComo(
  real: Persona | null | undefined,
  objetivo: (Persona & { kind?: string | null }) | null | undefined,
): string | null {
  if (!real || real.roleEnum !== "SUPER_ADMIN" || real.deactivatedAt) return "Solo un Super Admin puede ver como otra persona.";
  if (!objetivo) return "Esa persona no existe o todavía no entró nunca a Nexus.";
  if (objetivo.kind && objetivo.kind !== "INTERNAL") return "Solo se puede ver como alguien del equipo.";
  if (objetivo.id === real.id) return "Ya eres tú.";
  if (objetivo.deactivatedAt) return "Esa persona ya no está en el equipo.";
  if (objetivo.roleEnum === "SUPER_ADMIN") return "Otro Super Admin ve lo mismo que tú.";
  return null;
}
