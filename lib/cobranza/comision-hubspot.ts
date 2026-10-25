/**
 * lib/cobranza/comision-hubspot.ts — la comisión de HubSpot sale de HubSpot Partner (U25, 2026-10-25). PURO: cero
 * Prisma, cero red; la fecha de hoy entra por parámetro.
 *
 * ── DE DÓNDE SALE ────────────────────────────────────────────────────────────────────────────────────────────────
 * HubSpot no tiene API de comisiones: la liquidación del trimestre está en la app Commissions, solo para Super Admin,
 * y se sigue cargando a mano (es el monto REAL). Lo que sí da, por la copia de Partner, es la comisión proyectada de
 * cada cuenta (`hs_projected_commission`). Medido el 2026-10-24 en producción:
 *   · es MENSUAL: en las 44 cuentas con comisión es exactamente el 20 % del MRR vendido (`hs_sold_mrr`);
 *   · suma US$18.240 al mes; × 3 = 54.720, contra 50.430 que entraron el 15 de agosto.
 *
 * ── CÓMO SE ARMA EL TRIMESTRE ────────────────────────────────────────────────────────────────────────────────────
 * HubSpot paga el 15 de febrero, mayo, agosto y noviembre lo del trimestre que cerró 45 días antes (el 15 de noviembre
 * paga julio, agosto y septiembre). Cada cuenta aporta su comisión mensual por cada mes del trimestre en que la venta
 * ya existía: una venta que empezó el 30 de septiembre no pudo dejar comisión en julio. Con las cuentas de hoy, esa
 * regla reconstruye los tres pagos anteriores con menos de un 9 % de diferencia (feb +5,6 %, may −8,3 %, ago −6,6 %),
 * y × 3 sin prorratear daba un 8,5 % de más en noviembre. No se aplica el tope de 3 años de la regla de HubSpot: la
 * comisión proyectada ya es lo que HubSpot dice que va a pagar.
 *
 * ⚠ USD Y OTRAS MONEDAS NUNCA SE SUMAN (regla del módulo de cobranza). Hoy las 168 cuentas vienen en USD; una en
 * otra moneda queda aparte y no entra a la fila.
 * ⛔ INTERNO: la comisión por cuenta es dato de partner. Nunca va a un documento del cliente.
 */

/** Los meses de pago (0 = enero): febrero, mayo, agosto y noviembre. */
export const MESES_DE_PAGO_HUBSPOT = [1, 4, 7, 10] as const;
export const DIA_DE_PAGO_HUBSPOT = 15;
/** La moneda en que HubSpot liquida. */
export const MONEDA_HUBSPOT = "USD";
/** La clave del aliado HubSpot en `PartnerComercial.clave`. */
export const CLAVE_ALIADO_HUBSPOT = "hubspot";
/** Una copia de Partner más vieja que esto no arma el estimado: cubre un fin de semana largo (la copia corre L–V). */
export const DIAS_MAXIMOS_DE_LA_COPIA = 4;
/**
 * Cuánto puede bajar de un día para otro el estimado que arma Partner sin que una persona lo mire. Más que esto (o a
 * cero) suele ser un cambio de permisos o de formato en HubSpot, no comisión perdida: el job no lo escribe, la fila
 * se queda con el último monto y INV50 avisa a los días que no se puso al día.
 */
export const CAIDA_MAXIMA_SIN_REVISAR = 0.5;
/** Una fila de HubSpot cuenta para un pago si su fecha cae a menos de esto del día de pago (se movió al 13, al 30…). */
export const DIAS_DE_TOLERANCIA_DE_LA_FECHA = 45;

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const round2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, "0");

export interface PagoDeHubspot {
  /** AAAA-MM-DD: el día 15 del mes de pago. */
  fecha: string;
  /** Los tres meses que paga, AAAA-MM. */
  meses: [string, string, string];
  /** «jul–sep 2026». */
  trimestre: string;
}

function pagoDe(anio: number, mesDePago: number): PagoDeHubspot {
  const meses = [4, 3, 2].map((atras) => {
    const d = new Date(Date.UTC(anio, mesDePago - atras, 1));
    return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() };
  });
  // Los trimestres son de calendario: los tres meses son del mismo año (el de febrero paga oct–dic del anterior).
  const [a, , c] = meses;
  const trimestre = `${MESES_CORTOS[a.mes]}–${MESES_CORTOS[c.mes]} ${c.anio}`;
  return {
    fecha: `${anio}-${pad(mesDePago + 1)}-${pad(DIA_DE_PAGO_HUBSPOT)}`,
    meses: meses.map((m) => `${m.anio}-${pad(m.mes + 1)}`) as [string, string, string],
    trimestre,
  };
}

/** El próximo pago de HubSpot desde `hoyISO` (AAAA-MM-DD), contando el de hoy. */
export function proximoPagoDeHubspot(hoyISO: string): PagoDeHubspot {
  const anio = Number(hoyISO.slice(0, 4));
  for (const a of [anio, anio + 1]) {
    for (const m of MESES_DE_PAGO_HUBSPOT) {
      const p = pagoDe(a, m);
      if (p.fecha >= hoyISO) return p;
    }
  }
  throw new Error(`sin pago de HubSpot después de ${hoyISO}`);
}

/** El pago de una fecha que ES día de pago (15 de feb/may/ago/nov). null si no lo es. */
export function pagoDeLaFecha(fechaISO: string): PagoDeHubspot | null {
  const anio = Number(fechaISO.slice(0, 4));
  const mes = Number(fechaISO.slice(5, 7)) - 1;
  const dia = Number(fechaISO.slice(8, 10));
  if (dia !== DIA_DE_PAGO_HUBSPOT || !(MESES_DE_PAGO_HUBSPOT as readonly number[]).includes(mes)) return null;
  return pagoDe(anio, mes);
}

/** Una cuenta de la copia de Partner, con lo justo para estimar. */
export interface CuentaConComision {
  /** id del registro `partner_clients`. */
  id: string;
  nombre: string;
  clientId: string | null;
  /** La comisión que HubSpot proyecta al MES. */
  comisionMensual: number | null;
  /** null se lee como USD: es la moneda de los 168 registros medidos. */
  moneda: string | null;
  gestionada: boolean | null;
  /** AAAA-MM-DD: el inicio de la relación vendida. null = no se sabe, cuentan los tres meses. */
  ventaDesde: string | null;
}

/** Cuántos meses del trimestre cuentan para una venta: los que terminan después de que empezó. */
export function mesesQueCuentan(ventaDesde: string | null, meses: readonly string[]): number {
  if (!ventaDesde) return meses.length;
  return meses.filter((m) => {
    const [a, mm] = m.split("-").map(Number);
    const finDelMes = new Date(Date.UTC(a, mm, 1)).toISOString().slice(0, 10); // el 1 del mes siguiente
    return ventaDesde < finDelMes;
  }).length;
}

export interface AporteDeCuenta {
  id: string;
  nombre: string;
  clientId: string | null;
  gestionada: boolean | null;
  ventaDesde: string | null;
  comisionMensual: number;
  meses: number;
  aporte: number;
}

export interface EstimadoDeHubspot {
  pago: PagoDeHubspot;
  moneda: typeof MONEDA_HUBSPOT;
  /** La suma de la comisión mensual de hoy (lo que HubSpot proyecta este mes). */
  mensual: number;
  /** El estimado del trimestre: lo que va a la fila. */
  total: number;
  /** Las cuentas que aportan, de mayor a menor. */
  cuentas: AporteDeCuenta[];
  /** Comisiones en otra moneda: no se suman ni van a la fila. */
  otrasMonedas: Array<{ moneda: string; mensual: number; cuentas: number }>;
}

/** El estimado del trimestre de un pago, con las cuentas de la copia de Partner. */
export function estimarComisionDeHubspot(cuentas: readonly CuentaConComision[], pago: PagoDeHubspot): EstimadoDeHubspot {
  const aportes: AporteDeCuenta[] = [];
  const otras = new Map<string, { mensual: number; cuentas: number }>();
  let mensual = 0;
  for (const c of cuentas) {
    if (c.comisionMensual === null || !(c.comisionMensual > 0)) continue;
    const moneda = (c.moneda ?? MONEDA_HUBSPOT).toUpperCase();
    if (moneda !== MONEDA_HUBSPOT) {
      const o = otras.get(moneda) ?? { mensual: 0, cuentas: 0 };
      o.mensual = round2(o.mensual + c.comisionMensual);
      o.cuentas += 1;
      otras.set(moneda, o);
      continue;
    }
    mensual += c.comisionMensual;
    const meses = mesesQueCuentan(c.ventaDesde, pago.meses);
    aportes.push({
      id: c.id,
      nombre: c.nombre,
      clientId: c.clientId,
      gestionada: c.gestionada,
      ventaDesde: c.ventaDesde,
      comisionMensual: round2(c.comisionMensual),
      meses,
      aporte: round2(c.comisionMensual * meses),
    });
  }
  aportes.sort((a, b) => b.aporte - a.aporte || b.comisionMensual - a.comisionMensual || a.nombre.localeCompare(b.nombre));
  return {
    pago,
    moneda: MONEDA_HUBSPOT,
    mensual: round2(mensual),
    total: round2(aportes.reduce((s, a) => s + a.aporte, 0)),
    cuentas: aportes,
    otrasMonedas: [...otras.entries()].map(([moneda, o]) => ({ moneda, ...o })).sort((a, b) => a.moneda.localeCompare(b.moneda)),
  };
}

/** La fila de `ComisionPartner` de HubSpot para un pago, con lo justo para decidir. */
export interface FilaDeHubspot {
  id: string;
  estado: string;
  moneda: string;
  monto: number;
  montoEsProyeccion: boolean;
  montoDesdePartner: boolean;
}

export type DecisionDeLaFila =
  | { accion: "crear" }
  | { accion: "actualizar"; tomaLaManual: boolean }
  | { accion: "nada"; motivo: string };

/**
 * Qué hacer con la fila de HubSpot de un pago. La regla conservadora: el estimado de Partner solo escribe donde nadie
 * afirmó otra cosa.
 *   · Sin fila → se crea, estimada y por cobrar.
 *   · Cobrada, o con el monto real de la factura → no se toca: ese número lo confirmó alguien.
 *   · Estimada que armó Partner → se pone al día.
 *   · Estimada que escribió una persona → no se toca, salvo `tomarLaManual` (el script con `--apply`, una vez:
 *     es como se reemplazan los US$51.000 de noviembre). Una edición a mano del monto apaga `montoDesdePartner`.
 *   · Partner en cero, o una caída de más de la mitad → el job no escribe (`CAIDA_MAXIMA_SIN_REVISAR`); el script, que
 *     una persona corre después de ver el simulacro, sí escribe la caída, pero nunca el cero.
 *   · En otra moneda → no se toca.
 *   · Más de una fila para el mismo pago → no se toca ninguna: no se sabe cuál es.
 */
export function decidirFilaDeHubspot(
  filas: readonly FilaDeHubspot[],
  estimado: Pick<EstimadoDeHubspot, "total">,
  opciones: { tomarLaManual?: boolean } = {},
): DecisionDeLaFila {
  if (filas.length > 1) {
    return { accion: "nada", motivo: `hay ${filas.length} comisiones de HubSpot para ese pago: deja una sola` };
  }
  const fila = filas[0];
  if (!(estimado.total > 0)) {
    return { accion: "nada", motivo: "Partner no da comisión para ese trimestre: no se anota ni se baja a cero sola" };
  }
  if (!fila) return { accion: "crear" };
  if (fila.estado === "COBRADO") return { accion: "nada", motivo: "ya está cobrada" };
  if (!fila.montoEsProyeccion) return { accion: "nada", motivo: "ya tiene el monto real de la factura de HubSpot" };
  if (fila.moneda !== MONEDA_HUBSPOT) return { accion: "nada", motivo: `está anotada en ${fila.moneda}, no en ${MONEDA_HUBSPOT}` };
  if (opciones.tomarLaManual) return { accion: "actualizar", tomaLaManual: !fila.montoDesdePartner };
  if (fila.montoDesdePartner) {
    if (estimado.total < fila.monto * (1 - CAIDA_MAXIMA_SIN_REVISAR)) {
      return {
        accion: "nada",
        motivo:
          `bajaría de ${fila.monto} a ${estimado.total} (más del ${CAIDA_MAXIMA_SIN_REVISAR * 100} %): revisa la copia de Partner y, ` +
          "si está bien, corre scripts/comisiones-hubspot-estimado.ts --apply",
      };
    }
    return { accion: "actualizar", tomaLaManual: false };
  }
  return {
    accion: "nada",
    motivo: "el estimado lo escribió una persona: para que lo arme Partner, corre scripts/comisiones-hubspot-estimado.ts --apply",
  };
}

/** Lo que se guarda en `ComisionPartner.detalleDePartner`. */
export interface DetalleDePartner {
  calculadoEn: string;
  trimestre: string;
  meses: string[];
  mensual: number;
  /** El estimado por cuenta: id del registro, nombre, meses que cuentan, comisión al mes y aporte. */
  cuentas: Array<{ id: string; nombre: string; clientId: string | null; meses: number; mensual: number; aporte: number }>;
}

export function detalleDelEstimado(estimado: EstimadoDeHubspot, ahora: Date): DetalleDePartner {
  return {
    calculadoEn: ahora.toISOString(),
    trimestre: estimado.pago.trimestre,
    meses: [...estimado.pago.meses],
    mensual: estimado.mensual,
    cuentas: estimado.cuentas.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      clientId: c.clientId,
      meses: c.meses,
      mensual: c.comisionMensual,
      aporte: c.aporte,
    })),
  };
}

/** Un pago de HubSpot que ya entró, para comprobar la regla. */
export interface PagoCobrado {
  fecha: string;
  monto: number;
  estado: string;
  moneda: string;
}

export interface Comprobacion {
  fecha: string;
  trimestre: string;
  cobrado: number;
  /** Lo que la regla habría estimado para ese pago con las cuentas de HOY. */
  estimadoConLasDeHoy: number;
  /** (estimado − cobrado) / cobrado, en %, con un decimal. */
  diferenciaPct: number;
}

/**
 * La comprobación de la regla contra el último pago de HubSpot que entró: cuánto habría estimado Nexus para ese
 * trimestre con las cuentas de hoy. Sesgada (las cuentas que se fueron ya no están y las comisiones cambiaron), pero
 * es la única comparación posible: HubSpot no guarda la comisión proyectada de meses pasados, y la copia la guarda
 * semana a semana recién desde U29. null = todavía no entró ningún pago de HubSpot en día de pago.
 */
export function comprobarContraElUltimoPago(
  cuentas: readonly CuentaConComision[],
  pagos: readonly PagoCobrado[],
): Comprobacion | null {
  const ultimo = pagos
    .filter((p) => p.estado === "COBRADO" && p.moneda === MONEDA_HUBSPOT && p.monto > 0 && pagoDeLaFecha(p.fecha))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .at(-1);
  if (!ultimo) return null;
  const pago = pagoDeLaFecha(ultimo.fecha)!;
  const estimado = estimarComisionDeHubspot(cuentas, pago).total;
  return {
    fecha: ultimo.fecha,
    trimestre: pago.trimestre,
    cobrado: ultimo.monto,
    estimadoConLasDeHoy: estimado,
    diferenciaPct: Math.round(((estimado - ultimo.monto) / ultimo.monto) * 1000) / 10,
  };
}

/** ¿La copia de Partner es lo bastante reciente para armar el estimado? */
export function copiaFresca(ultimaCopia: Date | null, ahora: Date): boolean {
  if (!ultimaCopia) return false;
  return ahora.getTime() - ultimaCopia.getTime() <= DIAS_MAXIMOS_DE_LA_COPIA * 86400000;
}
