/**
 * lib/cobranza/mercury/transporte.ts
 *
 * El puerto hacia Mercury: qué se le pide y cómo falla. PURO: no sabe de HTTP —eso es transporte-http.ts, el único
 * archivo del módulo que habla con la red (lo vigila guardas.test.ts)—, así que la copia y sus pruebas no dependen de
 * la API.
 *
 * ── QUÉ SE LE PIDE (medido el 2026-10-02 con el token de Elías) ────────────────────
 * - `/ar/invoices`  las facturas de la sección de facturas: 76, de la INV-1 a la INV-72, desde noviembre de 2025.
 * - `/ar/customers` sus clientes: 30, con la razón social como nombre.
 * - `/transactions` los movimientos de las tres cuentas (dos corrientes y una de ahorro): 514 en 2026.
 * ⛔ El token es de SOLO LECTURA (Settings › Tokens › «Read Only»): Mercury no deja escribir con él. No pide IP fija.
 * ⚠ Mercury lo BORRA solo si pasa 45 días sin usarse: la copia diaria lo mantiene vivo.
 */

/** Los movimientos se copian desde acá: lo anterior a la sección de facturas no tiene con qué cruzarse. */
export const MOVIMIENTOS_DESDE = "2025-01-01";

export interface MercuryTransport {
  /** Todas las facturas, de todas las páginas. */
  facturas(): Promise<Record<string, unknown>[]>;
  /** Todos los clientes, de todas las páginas. */
  clientes(): Promise<Record<string, unknown>[]>;
  /** Los movimientos de todas las cuentas creados desde `desde` (`YYYY-MM-DD`), de todas las páginas. */
  movimientos(desde: string): Promise<Record<string, unknown>[]>;
}

/**
 * Qué clase de fallo fue. Cada uno se arregla en otro lado, y el mensaje le tiene que decir a quien cobra a quién
 * llamar:
 * - `TOKEN`     Mercury no reconoce el token: lo revocaron, lo borró por 45 días sin uso, o está mal copiado.
 * - `PERMISO`   el token entra pero no puede leer eso (un token con permisos a medida que no incluye facturas).
 * - `LIMITE`    demasiadas llamadas seguidas: se reintenta más tarde.
 * - `RED`       no hubo respuesta, o Mercury respondió con un error suyo (5xx).
 * - `PROTOCOLO` hubo respuesta y no se entendió.
 */
export type MercuryFalloClase = "TOKEN" | "PERMISO" | "LIMITE" | "RED" | "PROTOCOLO";

export class MercuryError extends Error {
  readonly clase: MercuryFalloClase;
  constructor(clase: MercuryFalloClase, mensaje: string) {
    super(mensaje);
    this.name = "MercuryError";
    this.clase = clase;
  }
}

/** La clase de un error HTTP de Mercury. */
export function claseDeStatus(status: number): MercuryFalloClase {
  if (status === 401) return "TOKEN";
  if (status === 403) return "PERMISO";
  if (status === 429) return "LIMITE";
  if (status >= 500) return "RED";
  return "PROTOCOLO";
}

/** Lo que se le muestra a quien cobra cuando la copia falla. Sin jerga: lo lee Alex. */
export function explicarFallo(clase: MercuryFalloClase): string {
  switch (clase) {
    case "TOKEN":
      return "Mercury no reconoce el token de Nexus: puede que lo hayan revocado, que Mercury lo haya borrado por 45 días sin uso o que esté mal copiado. Hay que crear uno nuevo de solo lectura en Mercury (Settings › Tokens) y ponerlo en el servidor.";
    case "PERMISO":
      return "El token de Nexus entra a Mercury pero no puede leer las facturas o los movimientos. Tiene que ser «Read Only» completo.";
    case "LIMITE":
      return "Mercury pidió esperar: se hicieron demasiadas consultas seguidas. La copia siguiente lo vuelve a intentar.";
    case "RED":
      return "No se pudo llegar a Mercury, o Mercury respondió con un error suyo.";
    case "PROTOCOLO":
      return "Mercury respondió algo que no se pudo interpretar.";
  }
}

/** Reintentar tiene sentido: el problema no está en el token. */
export const esTransitorio = (clase: MercuryFalloClase | null) => clase === "RED" || clase === "LIMITE";
