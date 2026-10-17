/**
 * lib/finanzas/licencias.ts — las licencias revendidas por contrato y cómo entran al punto de equilibrio (plan «Un solo
 * libro financiero», etapa «Servicio y licencia», 2026-10-17). PURO: sin Prisma, sin red, sin reloj.
 *
 * Un contrato que revende licencias (kölbi, Fundauna, el Ministerio de Economía, Global Supply…) factura dos cosas en la
 * misma factura: la licencia, que Smarteam le paga a un proveedor (HubSpot, Infobip), y el servicio de Smarteam. El
 * detalle de la factura no alcanza para separarlas (las de McCann dicen «pago de la herramienta HubSpot» y el anexo
 * dice que el 35 % es servicio), así que cada contrato se carga en Nexus (`LicenciaRevendida`): de cuánto es, cuánto es
 * servicio y cuánto se le paga al proveedor. Reemplaza la lista fija de kölbi de lib/finanzas/parte-de-servicio.ts.
 *
 * ── LAS DOS FORMAS DE CONTARLO ───────────────────────────────────────────────
 *  · SOLO_SERVICIO (Alex, 16-oct; la que rige hoy): de lo facturado a ese contrato cuenta solo la parte de servicio.
 *    La licencia ni entra como ingreso ni sale como gasto.
 *  · INGRESO_Y_COSTO (Marco, 16-oct, en la tarde): todo lo facturado cuenta como ingreso y lo que se le paga al
 *    proveedor sale como gasto de esa venta (rubro LICENCIA). Así se ve el margen real de la licencia (kölbi: se pagan
 *    unos US$70.000 por trimestre y se cobran unos US$82.000).
 * Lo decide dirección en el punto de equilibrio («Para decidir»), como lo de los aliados; mientras nadie decide, rige
 * `MODO_LICENCIAS_POR_DEFECTO`. ⚠ Con INGRESO_Y_COSTO, un contrato sin costo cargado cuenta el ingreso entero sin su
 * gasto: el reporte lo avisa contrato por contrato.
 */

export type ModoLicencias = "SOLO_SERVICIO" | "INGRESO_Y_COSTO";
export const MODOS_LICENCIAS: readonly ModoLicencias[] = ["SOLO_SERVICIO", "INGRESO_Y_COSTO"];

/** El que rige mientras dirección no decide: el que ya estaba aplicado a kölbi (decisión de Alex del 16-oct). */
export const MODO_LICENCIAS_POR_DEFECTO: ModoLicencias = "SOLO_SERVICIO";

export const PROVEEDORES_SUGERIDOS: readonly string[] = ["HubSpot", "Infobip", "Insider"];

/** Un contrato con licencias, como lo lee el punto de equilibrio y la pantalla. */
export interface LicenciaDeContrato {
  id: string;
  cuentaId: string;
  cuentaNombre: string;
  moneda: string;
  montoContrato: number;
  montoServicio: number;
  proveedor: string;
  costoMonto: number | null;
  costoMoneda: string | null;
  costoCadaMeses: number | null;
  /** `YYYY-MM-DD` o null. */
  desde: string | null;
  hasta: string | null;
  fuente: string;
  notas: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** La fracción de lo facturado que es servicio de Smarteam (0 a 1). */
export function parteDeServicioDe(l: Pick<LicenciaDeContrato, "montoContrato" | "montoServicio">): number {
  if (!(l.montoContrato > 0)) return 1;
  return Math.min(1, Math.max(0, l.montoServicio / l.montoContrato));
}

/** Si el contrato rige en ese mes (`YYYY-MM`): desde y hasta se comparan por mes, inclusive. */
export function rigeEn(l: Pick<LicenciaDeContrato, "desde" | "hasta">, periodo: string): boolean {
  if (l.desde && periodo < l.desde.slice(0, 7)) return false;
  if (l.hasta && periodo > l.hasta.slice(0, 7)) return false;
  return true;
}

/**
 * La parte de servicio de un cobro de esa cuenta, moneda y mes. 1 = no hay licencias conocidas: todo es servicio.
 * Si dos contratos vivos chocaran (la base lo impide con un índice único), manda el primero.
 */
export function parteDeServicio(licencias: readonly LicenciaDeContrato[], cuentaId: string, moneda: string, periodo: string): number {
  const l = licencias.find((x) => x.cuentaId === cuentaId && x.moneda === moneda && rigeEn(x, periodo));
  return l ? parteDeServicioDe(l) : 1;
}

/** Lo que se le paga al proveedor en un mes: el costo repartido en los meses que cubre. null = sin costo cargado. */
export function costoMensual(l: Pick<LicenciaDeContrato, "costoMonto" | "costoCadaMeses">): number | null {
  if (l.costoMonto === null || !l.costoCadaMeses || l.costoCadaMeses < 1) return null;
  return round2(l.costoMonto / l.costoCadaMeses);
}

export interface EgresoDeLicencia {
  periodo: string;
  concepto: string;
  conceptoClave: string;
  monto: number;
  moneda: string;
}

/**
 * El costo de las licencias mes a mes, para el rubro LICENCIA del punto de equilibrio (solo con INGRESO_Y_COSTO). Un
 * contrato sin costo no da egreso: lo dice `resumenDeLicencias`. ⚠ Es un ESTIMADO repartido parejo: el pago real al
 * proveedor (trimestral, anual) cae en un solo mes y se mira en Mercury.
 */
export function egresosDeLicencias(licencias: readonly LicenciaDeContrato[], periodos: readonly string[]): EgresoDeLicencia[] {
  const out: EgresoDeLicencia[] = [];
  for (const l of licencias) {
    const mensual = costoMensual(l);
    if (mensual === null || mensual <= 0 || !l.costoMoneda) continue;
    for (const periodo of periodos) {
      if (!rigeEn(l, periodo)) continue;
      out.push({
        periodo,
        concepto: `Licencias ${l.proveedor} · ${l.cuentaNombre}`,
        conceptoClave: `licencia-${l.id}`,
        monto: mensual,
        moneda: l.costoMoneda,
      });
    }
  }
  return out;
}

export interface ResumenDeLicencia {
  id: string;
  cuentaNombre: string;
  moneda: string;
  proveedor: string;
  /** Porcentaje de servicio, con un decimal (16,5). */
  pctServicio: number;
  costoMensual: number | null;
  costoMoneda: string | null;
  fuente: string;
}

export function resumenDeLicencias(licencias: readonly LicenciaDeContrato[]): ResumenDeLicencia[] {
  return licencias
    .map((l) => ({
      id: l.id,
      cuentaNombre: l.cuentaNombre,
      moneda: l.moneda,
      proveedor: l.proveedor,
      pctServicio: Math.round(parteDeServicioDe(l) * 1000) / 10,
      costoMensual: costoMensual(l),
      costoMoneda: l.costoMoneda,
      fuente: l.fuente,
    }))
    .sort((a, b) => a.cuentaNombre.localeCompare(b.cuentaNombre, "es") || a.moneda.localeCompare(b.moneda));
}

/* ── Lo que se puede guardar ─────────────────────────────────────────────────────── */

export interface DatosDeLicencia {
  cuentaId: string;
  moneda: string;
  montoContrato: number;
  montoServicio: number;
  proveedor: string;
  costoMonto: number | null;
  costoMoneda: string | null;
  costoCadaMeses: number | null;
  desde: string | null;
  hasta: string | null;
  fuente: string;
  notas: string | null;
}

/**
 * Lo que no puede pasar, dicho para una persona. Vacío = se puede guardar. Las mismas reglas que los CHECK del SQL, para
 * que el formulario lo diga antes de llegar a la base.
 */
export function problemasDeLicencia(d: DatosDeLicencia): string[] {
  const out: string[] = [];
  if (!(d.montoContrato > 0)) out.push("El monto del contrato tiene que ser mayor que cero.");
  if (d.montoServicio < 0) out.push("La parte de servicio no puede ser negativa.");
  if (d.montoServicio > d.montoContrato) out.push("La parte de servicio no puede ser mayor que el contrato.");
  const conCosto = [d.costoMonto, d.costoMoneda, d.costoCadaMeses].filter((x) => x !== null && x !== "").length;
  if (conCosto > 0 && conCosto < 3) out.push("El costo va completo: cuánto, en qué moneda y cada cuántos meses.");
  if (d.costoMonto !== null && d.costoMonto < 0) out.push("El costo no puede ser negativo.");
  if (d.costoCadaMeses !== null && (d.costoCadaMeses < 1 || d.costoCadaMeses > 36)) out.push("Cada cuántos meses: de 1 a 36.");
  if (d.desde && d.hasta && d.desde > d.hasta) out.push("«Desde» va antes de «hasta».");
  if (!d.fuente.trim()) out.push("Di de dónde salen los números (el anexo, la propuesta).");
  return out;
}
