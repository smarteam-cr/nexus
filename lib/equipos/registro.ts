/**
 * lib/equipos/registro.ts — EL registro de los equipos de Smarteam (etapa 4c de docs/mi-dia-plan.md). PURO y
 * client-safe.
 *
 * Hasta el 2026-10-16 cada módulo tenía su definición: los equipos del siguiente paso (lib/siguiente-paso/reglas.ts),
 * los sprints de Tareas (lib/tareas/equipos.ts, por área) y lo que mostraba «Para ti» según el rol. Acá cada equipo
 * declara, en una entrada:
 *   · quién es parte de él (los roles de permiso);
 *   · su sprint de Tareas (la clave de lib/tareas/equipos.ts; el sprint sigue saliendo del ÁREA de cada persona);
 *   · qué siguiente paso lleva (o ninguno);
 *   · cuál es su cartera en «Para ti»;
 *   · qué ve en «Para ti» (la agenda del día con «Preparar», el resumen antes de cada reunión).
 *
 * Sumar un equipo (Dev, Marketing, Finanzas: etapa 7) es sumar o completar su entrada, no construir pantallas. Dirección
 * (SUPER_ADMIN) no es un equipo: escribe cualquier siguiente paso y ve lo de los equipos que tienen datos para él.
 */
import type { ClaveDeEquipoFijo } from "@/lib/tareas/equipos";
import type { EquipoDelSiguientePaso } from "@/lib/siguiente-paso/propiedades";

export type ClaveDeEquipo = "ventas" | "cs" | "dev" | "marketing" | "finanzas";

/** La cartera de un equipo en «Para ti»: de dónde salen las empresas que lleva cada persona. */
export type CarteraDelEquipo =
  /** Las empresas donde es dueño en HubSpot y donde tiene un negocio abierto (lib/ventas/negocios). */
  | "ventas"
  /** Las cuentas de los proyectos donde es el CSE encargado (lib/para-ti/alcance-server.ts). */
  | "cse"
  /** Todavía no tiene cartera en «Para ti». */
  | null;

export interface EquipoDeNexus {
  clave: ClaveDeEquipo;
  nombre: string;
  /** Los roles de permiso (`TeamRole`) que son parte del equipo. */
  roles: readonly string[];
  /** Su sprint de Tareas. */
  sprint: ClaveDeEquipoFijo | null;
  /** El siguiente paso que lleva en empresas, negocios y proyectos (lib/siguiente-paso). */
  siguientePaso: EquipoDelSiguientePaso | null;
  cartera: CarteraDelEquipo;
  paraTi: {
    /** La agenda del día, con la empresa de cada reunión y «Preparar». */
    agenda: boolean;
  };
}

export const EQUIPOS_DE_NEXUS: readonly EquipoDeNexus[] = [
  { clave: "ventas", nombre: "Ventas", roles: ["VENTAS"], sprint: "ventas", siguientePaso: "ventas", cartera: "ventas", paraTi: { agenda: true } },
  { clave: "cs", nombre: "Customer Success", roles: ["CSE", "CSL"], sprint: "cs", siguientePaso: "cs", cartera: "cse", paraTi: { agenda: true } },
  // Dev, Marketing y Finanzas: la etapa 7 completa su cartera y lo que ven. Hoy, su siguiente paso (Dev) y su sprint.
  { clave: "dev", nombre: "Desarrollo", roles: ["DEV"], sprint: "desarrollo", siguientePaso: "dev", cartera: null, paraTi: { agenda: true } },
  { clave: "marketing", nombre: "Marketing", roles: ["MARKETING"], sprint: "marketing", siguientePaso: null, cartera: null, paraTi: { agenda: false } },
  { clave: "finanzas", nombre: "Finanzas", roles: ["ADMIN"], sprint: "admin", siguientePaso: null, cartera: null, paraTi: { agenda: false } },
];

const DIRECCION = "SUPER_ADMIN";

/** El equipo de un rol. Dirección no es un equipo: null. */
export function equipoDeRol(rol: string | null | undefined): EquipoDeNexus | null {
  if (!rol || rol === DIRECCION) return null;
  return EQUIPOS_DE_NEXUS.find((e) => e.roles.includes(rol)) ?? null;
}

/** Los siguientes pasos que escribe un rol: el de su equipo; dirección, todos (Marco vende). */
export function siguientesPasosDelRol(rol: string | null | undefined): EquipoDelSiguientePaso[] {
  if (rol === DIRECCION) return EQUIPOS_DE_NEXUS.flatMap((e) => (e.siguientePaso ? [e.siguientePaso] : []));
  const e = equipoDeRol(rol);
  return e?.siguientePaso ? [e.siguientePaso] : [];
}

/** ¿Ve la agenda del día en «Para ti»? La de su equipo; dirección, sí. */
export function veLaAgenda(rol: string | null | undefined): boolean {
  return rol === DIRECCION || !!equipoDeRol(rol)?.paraTi.agenda;
}
