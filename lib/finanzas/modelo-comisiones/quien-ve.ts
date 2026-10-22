/**
 * lib/finanzas/modelo-comisiones/quien-ve.ts — quién entra a Comisiones y qué ve de la simulación (2026-10-21). PURO.
 *
 * «Cómo funciona» es igual para todo el equipo comercial. La simulación lleva lo que vendió y ganaría cada persona: es
 * privado, como un salario, así que el servidor la carga solo con lo de quien mira (./cargar.ts). Super Admin ve todo,
 * también los techos. DECISIONS «El modelo de comisiones cerrado con Marco».
 */

/** Los roles comerciales que entran, además de Super Admin. */
export const ROLES_QUE_VEN_COMISIONES = ["VENTAS", "CSE", "CSL"] as const;

/** Los roles de Customer Success: una venta cuyo dueño tiene uno de estos es de Customer Success. */
export const ROLES_DE_CUSTOMER_SUCCESS = ["CSE", "CSL"] as const;

export type AlcanceDeComisiones =
  /** Super Admin: todas las personas, el área de Customer Success y los techos. */
  | { tipo: "todo" }
  /** Una persona del equipo comercial: solo lo suyo (y lo que necesita su bono, si lidera). */
  | { tipo: "persona"; teamMemberId: string; rol: string };

/** Qué ve quien mira, o null si no entra. `esSuperAdmin` es el gate de Costos (`isCostosRole`). */
export function alcanceDeComisiones(rol: string | null | undefined, teamMemberId: string, esSuperAdmin: boolean): AlcanceDeComisiones | null {
  if (esSuperAdmin) return { tipo: "todo" };
  if (rol && (ROLES_QUE_VEN_COMISIONES as readonly string[]).includes(rol)) return { tipo: "persona", teamMemberId, rol };
  return null;
}
