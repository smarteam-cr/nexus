/**
 * lib/tareas/menu.ts — ¿se le muestra «Tareas» en el menú? SERVIDOR.
 *
 * Desde el 2026-10-16 (fase 0.1 de docs/nexus-sistema-de-trabajo-plan.md), a todo el equipo: cada equipo planifica su
 * semana en Tareas (Desarrollo incluido) y Customer Success ve lo que se le hace a cada cliente. Hasta ese día era un
 * piloto (Marketing, Ventas, Customer Success y quien ya tuviera algo). Dirección pasa por el gate.
 *
 * Corre en CADA navegación (AppShell): no consulta la base.
 */
import "server-only";

export async function entraATareas(tm: { email: string; area: string | null; roleEnum: string } | null): Promise<boolean> {
  return !!tm && tm.roleEnum !== "SUPER_ADMIN"; // dirección entra por el gate
}
