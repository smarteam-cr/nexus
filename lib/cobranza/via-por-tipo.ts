/**
 * lib/cobranza/via-por-tipo.ts
 *
 * Por dónde factura una cuenta NUEVA según su clasificación. PURO.
 *
 * ── POR QUÉ EXISTE (revisión con Alex, 2026-09-29) ──────────────────────────────
 * Al crear una cuenta ya se dice si el cliente es nacional o internacional, y ese dato no se usaba para nada: la
 * vía de cobro nacía SIEMPRE en Odoo. Medido el 2026-09-04, 16 cuentas internacionales decían «Odoo» sin haber
 * facturado nunca ahí, y por eso aparecían en «Emparejar» esperando un cliente de Odoo que no iban a tener; hubo que
 * sacarlas una por una con «Está en Mercury».
 *
 * Ahora la clasificación propone la vía: nacional → Odoo (se empareja con su cliente de Odoo), internacional →
 * Mercury (no se empareja: Nexus no tiene copia de Mercury).
 *
 * ⚠ ES LA PROPUESTA, NO UNA REGLA. La vía sigue siendo un dato de cada cuenta, editable: hay nacionales que facturan
 * por Mercury (DISTELSA, Clínica Oceánica) y la facturación internacional puede pasar a Odoo. El día que pase, se
 * cambia UNA línea de esta tabla para las cuentas nuevas, y las que ya existen se mueven con «Deshacer» en «En
 * Mercury» o desde su ficha: vuelven solas a «Emparejar». Nada más del sistema mira el tipo para decidir la
 * plataforma: todo lo demás lee la vía.
 */
import type { COBRANZA_VIAS_COBRO } from "./schema";

export type ViaDeCobro = (typeof COBRANZA_VIAS_COBRO)[number];

/** La vía que se propone para cada clasificación. */
export const VIA_POR_TIPO: Readonly<Record<string, ViaDeCobro>> = {
  NACIONAL: "ODOO",
  INTERNACIONAL: "MERCURY",
};

/** La vía que se le propone a una cuenta de ese tipo. Un tipo desconocido cae en Odoo, el valor de la base. */
export function viaSegunTipo(tipo: string | null | undefined): ViaDeCobro {
  return (tipo ? VIA_POR_TIPO[tipo] : undefined) ?? "ODOO";
}

/**
 * La vía con que nace una cuenta: la que eligió la persona, y si no eligió ninguna, la de su clasificación.
 * ⛔ Nunca pisa una elección: `INTERNACIONAL` con vía `ODOO` elegida a mano nace en Odoo.
 */
export function viaDeLaCuentaNueva(tipo: string | null | undefined, elegida: ViaDeCobro | null | undefined): ViaDeCobro {
  return elegida ?? viaSegunTipo(tipo);
}
