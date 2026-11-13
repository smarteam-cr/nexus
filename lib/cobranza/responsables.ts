/**
 * lib/cobranza/responsables.ts — QUIÉN responde por cada cosa de cobranza que espera a una persona (2026-11-13). PURO y
 * CLIENT-SAFE.
 *
 * ── POR QUÉ ─────────────────────────────────────────────────────────────────────
 * Una lista sin dueño no se cierra nunca (la regla 2 de lib/finanzas/inconsistencias.ts). «Ventas ganadas que no están en
 * cobranza» decía QUÉ faltaba y que lo resolvía «Cobranza», un área: nadie en particular. Desde el 15 de noviembre
 * María José Zamora asume cobros, pagos y facturación (Elías, 2026-11-13), así que es la responsable por defecto; cada
 * venta se puede reasignar a otra persona. El paso a producción de un conector o de un servicio recurrente lo confirma
 * Alejandro Salas (Solution Architect) salvo que la tabla del proyecto diga otra persona.
 *
 * ── NULL ES «EL DE SIEMPRE» ─────────────────────────────────────────────────────
 * En la base, un responsable vacío significa el por defecto, y el por defecto vive SOLO acá. Si mañana cobra otra
 * persona, se cambia una línea y no se reescriben filas; lo que alguien reasignó a mano se queda como está.
 */

export interface PersonaResponsable {
  email: string;
  nombre: string;
}

/** Quien cobra, factura y registra pagos por defecto (desde el 2026-11-15). */
export const RESPONSABLE_DE_COBRO: PersonaResponsable = { email: "mzamora@smarteamcr.com", nombre: "María José Zamora" };

/** Quien confirma por defecto que un conector o un servicio recurrente pasó a producción. */
export const CONFIRMA_PRODUCCION: PersonaResponsable = { email: "asalas@smarteamcr.com", nombre: "Alejandro Salas" };

const normal = (e: string | null | undefined): string | null => {
  const t = (e ?? "").trim().toLowerCase();
  return t.includes("@") ? t : null;
};

/** El correo de quien persigue el cobro de una venta: el suyo, o el por defecto. */
export function responsableDeLaVenta(v: { responsableCobroEmail: string | null }): string {
  return normal(v.responsableCobroEmail) ?? RESPONSABLE_DE_COBRO.email;
}

/** Los dos responsables de un proyecto (la fila de `CobroDelProyecto`, o ninguna). */
export function responsablesDelProyecto(fila: { confirmaProduccionEmail: string | null; cobraEmail: string | null } | null): {
  confirma: string;
  cobra: string;
} {
  return {
    confirma: normal(fila?.confirmaProduccionEmail) ?? CONFIRMA_PRODUCCION.email,
    cobra: normal(fila?.cobraEmail) ?? RESPONSABLE_DE_COBRO.email,
  };
}

/**
 * Lo que se guarda: el correo, o null si es el por defecto (así cambiar el por defecto no deja filas pegadas al viejo).
 * `porDefecto` es el correo por defecto de ESE campo.
 */
export function paraGuardar(email: string | null | undefined, porDefecto: string): string | null {
  const e = normal(email);
  return e === null || e === porDefecto.toLowerCase() ? null : e;
}

/** El nombre para pintar: el del equipo si se conoce, si no el correo. */
export function nombreDe(email: string, nombres: ReadonlyMap<string, string>): string {
  const e = email.toLowerCase();
  if (e === RESPONSABLE_DE_COBRO.email) return nombres.get(e) ?? RESPONSABLE_DE_COBRO.nombre;
  if (e === CONFIRMA_PRODUCCION.email) return nombres.get(e) ?? CONFIRMA_PRODUCCION.nombre;
  return nombres.get(e) ?? email;
}
