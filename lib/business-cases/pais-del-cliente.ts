/**
 * lib/business-cases/pais-del-cliente.ts — ¿el cliente de esta propuesta es de Costa Rica? PURO.
 *
 * Lo pregunta el control del IVA de la Inversión (lib/landing/iva.ts): el 13% es de Costa Rica, así
 * que el control se ofrece cuando el cliente es de ahí. Nexus no guarda el país en la ficha; lo
 * saben tres lugares, y se miran en este orden:
 *  1. La cuenta de cobro (`CuentaFinanciera.tipo`): NACIONAL o INTERNACIONAL. Es Finanzas quien
 *     factura con IVA, así que su palabra va primero. ⚠ Solo si la cuenta se configuró: `tipo`
 *     nace NACIONAL por defecto, y una cuenta en el default de fábrica (PENDIENTE_DATOS, sin
 *     procedencia ni firma) no sabe nada del cliente.
 *  2. HubSpot, por la copia de Partner (`ClientPartnerSnapshot.country`).
 *  3. Lo que anotó la preventa (`contenido.medicion.pais`: lo escribe Ventas o se copia del
 *     país de la empresa en HubSpot al preparar).
 * Si ninguno lo dice, `costaRica` es null: Ventas puede elegir el IVA igual y la pantalla avisa
 * que no se sabe.
 */

export interface FuentesDelPais {
  cuenta?: {
    tipo: string;
    estadoCuenta?: string | null;
    fuente?: string | null;
    estadoActualizadoPor?: string | null;
  } | null;
  hubspot?: string | null;
  preventa?: string | null;
}

export interface PaisDelCliente {
  /** true = Costa Rica · false = otro país · null = no se sabe. */
  costaRica: boolean | null;
  /** De dónde salió, para decirlo en el aviso. null cuando no se sabe. */
  fuente: "cuenta" | "hubspot" | "preventa" | null;
  /** El país como lo dice la fuente, si lo dice con palabras ("Guatemala"). */
  pais: string | null;
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** "Costa Rica", "costa rica", "CR", "CRI", "Costa Rica (San José)" → true. Vacío → null. */
export function esCostaRica(texto: string | null | undefined): boolean | null {
  const t = sinTildes((texto ?? "").trim()).toLowerCase();
  if (!t) return null;
  if (t === "cr" || t === "cri") return true;
  return /\bcosta\s*rica\b/.test(t);
}

/** ¿La cuenta de cobro la configuró alguien, o está en el default de fábrica? */
function cuentaConfigurada(c: NonNullable<FuentesDelPais["cuenta"]>): boolean {
  return (
    (c.estadoCuenta ?? "PENDIENTE_DATOS") !== "PENDIENTE_DATOS" ||
    !!(c.fuente ?? "").trim() ||
    !!(c.estadoActualizadoPor ?? "").trim()
  );
}

export function paisDelCliente(f: FuentesDelPais): PaisDelCliente {
  if (f.cuenta && cuentaConfigurada(f.cuenta)) {
    if (f.cuenta.tipo === "NACIONAL") return { costaRica: true, fuente: "cuenta", pais: "Costa Rica" };
    if (f.cuenta.tipo === "INTERNACIONAL") return { costaRica: false, fuente: "cuenta", pais: null };
  }
  for (const fuente of ["hubspot", "preventa"] as const) {
    const texto = (f[fuente] ?? "").trim();
    const cr = esCostaRica(texto);
    if (cr !== null) return { costaRica: cr, fuente, pais: cr ? "Costa Rica" : texto.slice(0, 80) };
  }
  return { costaRica: null, fuente: null, pais: null };
}

/** Cómo se nombra cada fuente en el aviso del editor. */
export const NOMBRE_DE_LA_FUENTE: Record<NonNullable<PaisDelCliente["fuente"]>, string> = {
  cuenta: "la cuenta de cobro",
  hubspot: "HubSpot",
  preventa: "la preventa",
};
