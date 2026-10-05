/**
 * lib/recorridos/filtro.ts — qué recorridos y qué pasos le tocan a cada persona.
 *
 * Dos capas por rol (el recorrido y cada paso) y una tercera que decide el navegador: si lo que
 * señala un paso no está a la vista, el paso no sale (`pasosALaVista`, en el proveedor).
 *
 * Dirección (SUPER_ADMIN) ve todos los recorridos y todos sus pasos: es quien los revisa, y un
 * recorrido solo para Ventas o Finanzas tiene que poder abrirlo sin cambiar de rol.
 */
import type { TeamRole } from "@prisma/client";
import { RECORRIDOS } from "./registro";
import type { PasoDelRecorrido, Recorrido } from "./tipos";

const VE_TODO: ReadonlySet<TeamRole> = new Set<TeamRole>(["SUPER_ADMIN"]);

/** Sin rol (sin TeamMember) no hay recorridos: son para el equipo interno. */
export function recorridosDelRol(rol: TeamRole | null, todos: readonly Recorrido[] = RECORRIDOS): Recorrido[] {
  if (!rol) return [];
  if (VE_TODO.has(rol)) return [...todos];
  return todos.filter((r) => r.roles === "todos" || r.roles.includes(rol));
}

export function pasosDelRol(recorrido: Recorrido, rol: TeamRole | null): PasoDelRecorrido[] {
  if (!rol) return [];
  if (VE_TODO.has(rol)) return [...recorrido.pasos];
  return recorrido.pasos.filter((p) => !p.roles || p.roles.includes(rol));
}

/**
 * El recorrido de lo que se está mirando: el que declaró la pieza abierta (`pantalla`) o, si no
 * hay, el de la dirección que no depende de una pieza.
 */
export function recorridoActual(pathname: string, pantalla: string | null, recorridos: readonly Recorrido[]): Recorrido | null {
  if (pantalla) {
    const dePantalla = recorridos.find((r) => r.id === pantalla && r.ruta.test(pathname));
    if (dePantalla) return dePantalla;
  }
  return recorridos.find((r) => !r.porPantalla && r.ruta.test(pathname)) ?? null;
}

/** El recorrido de la pantalla actual, si la ruta calza con alguno del rol (sin mirar piezas). */
export function recorridoDeLaRuta(pathname: string, recorridos: readonly Recorrido[]): Recorrido | null {
  return recorridoActual(pathname, null, recorridos);
}
