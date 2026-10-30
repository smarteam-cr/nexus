/**
 * lib/cs/prioridad-de-cuenta.ts — las cuentas que la CSL marca como prioritarias (más seguimiento). PURO (2026-10-29).
 *
 * Pedido de Elías del 29 oct: «que Alex y los super admins puedan marcar manualmente, desde el listado y adentro, qué
 * cuentas son prioritarias o necesitan más seguimiento. Por ejemplo, las que tienen SmartLoop, las de ticket grande o
 * las que tienen interlocutores difíciles».
 *
 * · La marca la ponen y la quitan quienes tienen `customerSuccess.marcarPrioridad` (la CSL y los super admin), con un
 *   motivo corto y, si quieren, una línea más.
 * · NO cambia el color: el color dice cómo va la cuenta y lo calcula Nexus. La marca ORDENA: dentro del mismo color, la
 *   prioritaria va primero (en «A quién llamar», en las alertas y en la Cartera). Una prioritaria en riesgo va antes que
 *   una no prioritaria en riesgo.
 * · Vive en `PrioridadDeCuenta`, append-only como `CorreccionDeSalud`: cada cambio es una fila y la marca de hoy es el
 *   último evento. Queda quién la puso y cuándo.
 */

export const MOTIVOS_DE_PRIORIDAD = ["smartloop", "ticket-grande", "interlocutores-dificiles", "otro"] as const;
export type MotivoDePrioridad = (typeof MOTIVOS_DE_PRIORIDAD)[number];

export const NOMBRE_DEL_MOTIVO: Record<MotivoDePrioridad, string> = {
  smartloop: "SmartLoop",
  "ticket-grande": "Ticket grande",
  "interlocutores-dificiles": "Interlocutores difíciles",
  otro: "Otro motivo",
};

/** El largo de la línea opcional. */
export const LARGO_DE_LA_NOTA_DE_PRIORIDAD = 140;

export const TIPOS_DE_PRIORIDAD = ["marcar", "quitar"] as const;
export type TipoDePrioridad = (typeof TIPOS_DE_PRIORIDAD)[number];

/** Una fila de `PrioridadDeCuenta`, ya leída. */
export interface EventoDePrioridad {
  id: string;
  tipo: TipoDePrioridad;
  motivo: string | null;
  nota: string | null;
  porEmail: string;
  porNombre: string | null;
  /** ISO. */
  en: string;
}

export interface PrioridadGuardada {
  motivo: MotivoDePrioridad;
  nota: string | null;
  porEmail: string;
  porNombre: string | null;
  /** ISO. */
  en: string;
}

export function esMotivoDePrioridad(m: string | null | undefined): m is MotivoDePrioridad {
  return !!m && (MOTIVOS_DE_PRIORIDAD as readonly string[]).includes(m);
}

/** La marca de hoy: el último evento (pueden venir en cualquier orden). null = no es prioritaria. */
export function prioridadDesdeEventos(eventos: readonly EventoDePrioridad[]): PrioridadGuardada | null {
  const orden = [...eventos].sort((a, b) => a.en.localeCompare(b.en) || a.id.localeCompare(b.id));
  let hoy: PrioridadGuardada | null = null;
  for (const e of orden) {
    if (e.tipo === "quitar") hoy = null;
    else if (e.tipo === "marcar" && esMotivoDePrioridad(e.motivo)) {
      hoy = { motivo: e.motivo, nota: e.nota?.trim() || null, porEmail: e.porEmail, porNombre: e.porNombre, en: e.en };
    }
  }
  return hoy;
}

/** Cómo se dice el motivo: «SmartLoop», «Ticket grande · renueva 3 hubs», «Otro motivo: el sponsor se va». */
export function motivoEnPalabras(p: Pick<PrioridadGuardada, "motivo" | "nota">): string {
  if (p.motivo === "otro") return p.nota ? p.nota : NOMBRE_DEL_MOTIVO.otro;
  return p.nota ? `${NOMBRE_DEL_MOTIVO[p.motivo]} · ${p.nota}` : NOMBRE_DEL_MOTIVO[p.motivo];
}

/** Quién la marcó, en palabras: el nombre, o el correo si no hay nombre. */
export function quienLaMarco(p: Pick<PrioridadGuardada, "porNombre" | "porEmail">): string {
  return p.porNombre?.trim() || p.porEmail;
}

/** Para ordenar: la prioritaria primero (0), las demás después (1). */
export function rangoDePrioridad(c: { prioritaria?: unknown }): number {
  return c.prioritaria ? 0 : 1;
}

/** Lo que muestra una fila de la cartera: el motivo en palabras y quién la marcó. */
export interface PrioridadVisible {
  motivo: MotivoDePrioridad;
  nota: string | null;
  enPalabras: string;
  quien: string;
}

export function prioridadVisible(p: PrioridadGuardada | null | undefined): PrioridadVisible | null {
  return p ? { motivo: p.motivo, nota: p.nota, enPalabras: motivoEnPalabras(p), quien: quienLaMarco(p) } : null;
}
