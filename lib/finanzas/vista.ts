/**
 * lib/finanzas/vista.ts — la VISTA de Finanzas de cada persona (2026-10-03, docs/finanzas-rediseno-plan.md).
 *
 * Se entra a Finanzas igual que siempre, por el menú de la izquierda, pero el panel que se abre cambia según quién entra,
 * y cada uno llega a una pantalla hecha para su trabajo:
 *   · REGISTRA  — quien carga el día a día (Dinia). Entra a Pendientes.
 *   · SUPERVISA — quien revisa, decide y cierra el mes (Alex). Entra a Supervisión.
 *   · DIRECCION — quien solo mira el resultado. Entra al Punto de equilibrio.
 *
 * ⚠ La vista decide la ENTRADA (y, para quien registra, el menú), no los permisos: cada página y cada ruta siguen con su
 * propia guarda. Desde el 2026-10-08 un SUPER_ADMIN ve TODO el menú de Finanzas en cualquier vista (Elías: «los super
 * admins deberían poder ver todo»): antes Dirección se quedaba sin Planilla en el menú.
 *
 * PURO: sin Prisma ni Next. Lo leen el menú (cliente) y las páginas (servidor).
 */

export type VistaFinanzas = "REGISTRA" | "SUPERVISA" | "DIRECCION";

/** Lo que un SUPER_ADMIN puede elegir en Equipo. El resto del equipo no elige: registra. */
export const VISTAS_ELEGIBLES = ["SUPERVISA", "DIRECCION"] as const;
export type VistaElegible = (typeof VISTAS_ELEGIBLES)[number];

export const ETIQUETA_DE_VISTA: Record<VistaFinanzas, string> = {
  REGISTRA: "Registra",
  SUPERVISA: "Revisa y cierra el mes",
  DIRECCION: "Dirección: entra a los reportes",
};

/**
 * La vista de una persona. Un SUPER_ADMIN supervisa salvo que haya elegido Dirección; cualquier otro rol que llegue a
 * Finanzas registra. Un valor raro en la base (no debería pasar: hay un CHECK) se lee como el de por defecto.
 */
export function vistaFinanzasDe(p: { roleEnum: string | null | undefined; vistaFinanzas?: string | null }): VistaFinanzas {
  if (p.roleEnum !== "SUPER_ADMIN") return "REGISTRA";
  return p.vistaFinanzas === "DIRECCION" ? "DIRECCION" : "SUPERVISA";
}

/** La pantalla de entrada de cada vista: adonde lleva «Finanzas» en el menú. */
export const ENTRADA_DE_VISTA: Record<VistaFinanzas, string> = {
  REGISTRA: "/finanzas/pendientes",
  SUPERVISA: "/finanzas/supervision",
  DIRECCION: "/finanzas/equilibrio",
};
