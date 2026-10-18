/**
 * lib/finanzas/lo-vendido.ts — lo vendido según las propuestas ganadas: cuánto es servicio, cuánto es licencia y el
 * margen de cada licencia (2026-10-18, «La siguiente serie», iniciativa 3, pasos 3 y 4). PURO: sin Prisma, sin red,
 * sin reloj. Lo carga lib/finanzas/lo-vendido-server.ts.
 *
 * Es el ÚNICO lector de la Inversión de una propuesta para Finanzas. Lo usan el punto de equilibrio y el script que
 * vuelve a leer las propuestas ganadas (scripts/recalcular-lo-vendido.ts). Las cuentas de dinero son las del motor de
 * la propuesta (`gruposDeInversion`, `montoDeLinea`, `margenDeLinea`): lo que lee Finanzas es lo que vio el cliente.
 *
 * ── QUÉ ENTRA AL PUNTO DE EQUILIBRIO ─────────────────────────────────────────
 * Una propuesta ganada se vuelve un contrato con licencias (`LicenciaDeContrato`, la misma forma que la carga a mano de
 * `LicenciaRevendida`) SOLO si trae el dato completo:
 *  · Smarteam factura al menos una licencia y de ninguna falta decir quién la factura (`quienFactura`);
 *  · cada licencia que factura Smarteam tiene su precio de lista, en la moneda de la propuesta y con la misma
 *    periodicidad que lo cobrado (los motores no convierten moneda);
 *  · ningún monto quedó sin poder leerse, la moneda es CRC o USD y el cliente tiene cuenta de cobro.
 * Si falta algo, `porQueNoEntra` lo dice con palabras y no se inventa nada: el contrato a mano, si hay, sigue rigiendo.
 *
 * ⚠ SUPUESTO declarado (pendiente de Elías): el contrato que sale de una propuesta rige `MESES_DEL_CONTRATO` meses
 * desde el cierre, y lo recurrente se cuenta por esos meses. La propuesta no dice cuánto dura el contrato; 12 es lo
 * habitual en las licencias de HubSpot.
 *
 * ⚠ Que entre al equilibrio NO cambia qué cuenta como ingreso: aplica la regla ya decidida (`SOLO_SERVICIO` o lo que
 * dirección elija en «Para decidir», lib/finanzas/licencias.ts), igual que un contrato cargado a mano.
 */
import { adoptarRecurrentes, adoptarShapeNuevo, esLineaActiva, esRecurrente, gruposDeInversion, montoDeLinea, type InversionData, type LineaInversion } from "@/lib/landing/inversion";
import { costoDeLinea, margenDeLinea, quienFacturaDe, type LineaConCosto, type MargenDeLinea, type QuienFactura } from "@/lib/landing/inversion-costo";
import { rigeEn, type LicenciaDeContrato } from "./licencias";

/** Los meses que rige el contrato que sale de una propuesta. SUPUESTO: ver el encabezado. */
export const MESES_DEL_CONTRATO = 12;

/** Las monedas con las que trabaja Cobranza (`CobranzaMoneda`): un contrato en otra no calza con ningún cobro. */
const MONEDAS_DE_COBRO = ["USD", "CRC"];

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface PropuestaGanada {
  businessCaseId: string;
  nombre: string;
  clientId: string;
  clienteNombre: string;
  /** La cuenta de cobro del cliente (`CuentaFinanciera`), o null si no tiene. */
  cuentaId: string | null;
  /** El nombre de la versión que se leyó («Propuesta 2»): la activa. */
  versionLeida: string | null;
  hubspotDealId: string;
  /** El día en que HubSpot dio el trato por ganado. `YYYY-MM-DD`. */
  fechaCierre: string;
  /** La moneda del trato en HubSpot: respaldo cuando la propuesta no dice en qué moneda está. */
  monedaDeLaVenta: string | null;
  /** El `data` crudo del bloque de la sección de inversión de esa versión (o null si no tiene). */
  inversion: unknown;
}

/** Lo que se cobra y lo que se paga de una línea, llevado a una sola base: por mes (lo recurrente) o una vez. */
interface Base {
  mensual: number;
  unico: number;
}
const cero = (): Base => ({ mensual: 0, unico: 0 });

export interface LicenciaVendida {
  concepto: string;
  hub: string | null;
  quienFactura: QuienFactura;
  recurrente: boolean;
  /** Lo que se le cobra al cliente (mensual equivalente, o una vez). null = no se pudo leer. */
  cobrado: Base | null;
  /** Lo que se le paga al proveedor, en la misma base. null = sin costo o no comparable. */
  costo: Base | null;
  /** cobrado − costo, solo cuando los dos son comparables. */
  margen: Base | null;
  estado: MargenDeLinea["estado"];
}

export interface LoVendidoDePropuesta {
  businessCaseId: string;
  nombre: string;
  clienteNombre: string;
  clientId: string;
  cuentaId: string | null;
  versionLeida: string | null;
  hubspotDealId: string;
  fechaCierre: string;
  /** La moneda con que se leyó, o null si ni la propuesta ni HubSpot la dicen. */
  moneda: string | null;
  monedaDe: "propuesta" | "hubspot" | null;
  /** Servicios de Smarteam, por mes (lo recurrente) y una vez. */
  servicios: Base;
  licencias: LicenciaVendida[];
  /** Lo que se le cobra al cliente por las licencias que FACTURA Smarteam (las del proveedor directo no son de Smarteam). */
  licenciasFacturadas: Base;
  /** Lo que se le paga al proveedor por esas licencias (solo las que traen costo comparable). */
  costoLicencias: Base;
  margenLicencias: Base;
  cobertura: {
    lineasDeLicencia: number;
    conCosto: number;
    factura: { smarteam: number; proveedor: number; sinDecir: number };
    /** Líneas (de cualquier grupo) con algo escrito que no se pudo leer. */
    pendientes: number;
    /** Hubo montos en rango: se tomó el piso. */
    conRango: boolean;
    /** La sección está vacía o la versión no tiene inversión. */
    sinInversion: boolean;
  };
  /** El contrato para el punto de equilibrio, o null con el porqué en `porQueNoEntra`. */
  contrato: LicenciaDeContrato | null;
  porQueNoEntra: string | null;
}

/** Lleva el importe de una línea a la base común. Usa el piso de un rango. */
function baseDeLinea(l: LineaInversion, moneda: string, contrato: "mensual" | "anual"): { base: Base | null; rango: boolean } {
  const m = montoDeLinea(l, moneda, contrato);
  if (!m.rango || m.sucio) return { base: null, rango: false };
  const b = cero();
  const v = m.rango.min;
  if (esRecurrente(l)) b.mensual = contrato === "anual" ? v / 12 : v;
  else b.unico = v;
  return { base: b, rango: m.rango.min !== m.rango.max };
}

function costoEnBase(l: LineaConCosto, moneda: string): Base | null {
  const c = costoDeLinea(l, moneda);
  if (!c || c === "sucio") return null;
  const b = cero();
  if (c.cada === "unica") b.unico = c.monto;
  else b.mensual = c.cada === "anual" ? c.monto / 12 : c.monto;
  return b;
}

const sumar = (a: Base, b: Base | null): Base => (b ? { mensual: a.mensual + b.mensual, unico: a.unico + b.unico } : a);
const redondear = (b: Base): Base => ({ mensual: r2(b.mensual), unico: r2(b.unico) });
/** Lo que vale una base en todo el contrato. */
const enElContrato = (b: Base) => r2(b.unico + b.mensual * MESES_DEL_CONTRATO);

function sumarMeses(periodo: string, n: number): string {
  const [y, m] = periodo.split("-").map(Number);
  const total = y! * 12 + (m! - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

function ultimoDiaDe(periodo: string): string {
  const [y, m] = periodo.split("-").map(Number);
  const dias = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return `${periodo}-${String(dias).padStart(2, "0")}`;
}

function proveedorDe(ls: readonly LicenciaVendida[]): string {
  const conHub = ls.filter((l) => l.hub).length;
  if (conHub === ls.length) return "HubSpot";
  if (conHub === 0) return ls[0]?.concepto.trim() || "Proveedor";
  return "HubSpot y otros";
}

/** Lee UNA propuesta ganada. */
export function leerLoVendido(p: PropuestaGanada): LoVendidoDePropuesta {
  const crudo = (p.inversion && typeof p.inversion === "object" ? p.inversion : {}) as InversionData;
  // La misma proyección del render: el shape viejo de HubSpot y el card de recurrentes se leen como tabla.
  const d = adoptarRecurrentes(adoptarShapeNuevo(crudo));
  const declarada = (d.moneda ?? "").trim().toUpperCase();
  const deducida = gruposDeInversion(d).moneda;
  const monedaVenta = (p.monedaDeLaVenta ?? "").trim().toUpperCase();
  const moneda = deducida || monedaVenta || null;
  const monedaDe: LoVendidoDePropuesta["monedaDe"] = declarada || deducida ? "propuesta" : monedaVenta ? "hubspot" : null;
  // Con la moneda resuelta, se vuelve a leer: así un monto en otra moneda queda sucio en vez de sumarse.
  const g = gruposDeInversion(moneda && !declarada ? { ...d, moneda } : d);
  const m = moneda ?? "";

  let pendientes = g.pendientesTotales;
  let conRango = false;
  let servicios = cero();
  for (const l of g.servicios.lineas) {
    if (!esLineaActiva(l)) continue;
    const { base, rango } = baseDeLinea(l, m, g.contrato);
    servicios = sumar(servicios, base);
    conRango ||= rango;
  }

  const licencias: LicenciaVendida[] = [];
  let licenciasFacturadas = cero();
  let costoLicencias = cero();
  let margenLicencias = cero();
  for (const l of g.licencias.lineas as LineaConCosto[]) {
    if (!esLineaActiva(l)) continue;
    const { base, rango } = baseDeLinea(l, m, g.contrato);
    conRango ||= rango;
    const quien = quienFacturaDe(l);
    const mg = margenDeLinea(l, m, g.contrato);
    const costo = mg.estado === "ok" ? costoEnBase(l, m) : null;
    const margen = base && costo ? { mensual: base.mensual - costo.mensual, unico: base.unico - costo.unico } : null;
    licencias.push({
      concepto: (l.concepto ?? "").trim(),
      hub: (l.hub ?? "").trim() || null,
      quienFactura: quien,
      recurrente: esRecurrente(l),
      cobrado: base ? redondear(base) : null,
      costo: costo ? redondear(costo) : null,
      margen: margen ? redondear(margen) : null,
      estado: mg.estado,
    });
    if (quien === "smarteam") {
      licenciasFacturadas = sumar(licenciasFacturadas, base);
      costoLicencias = sumar(costoLicencias, costo);
      margenLicencias = sumar(margenLicencias, margen);
    }
  }
  if (g.licencias.lineas.some((l) => esLineaActiva(l) && costoDeLinea(l as LineaConCosto, m) === "sucio")) pendientes++;

  const factura = {
    smarteam: licencias.filter((l) => l.quienFactura === "smarteam").length,
    proveedor: licencias.filter((l) => l.quienFactura === "proveedor").length,
    sinDecir: licencias.filter((l) => l.quienFactura === null).length,
  };
  const sinInversion = !g.servicios.lineas.some(esLineaActiva) && !licencias.length;

  const base: Omit<LoVendidoDePropuesta, "contrato" | "porQueNoEntra"> = {
    businessCaseId: p.businessCaseId,
    nombre: p.nombre,
    clienteNombre: p.clienteNombre,
    clientId: p.clientId,
    cuentaId: p.cuentaId,
    versionLeida: p.versionLeida,
    hubspotDealId: p.hubspotDealId,
    fechaCierre: p.fechaCierre,
    moneda,
    monedaDe,
    servicios: redondear(servicios),
    licencias,
    licenciasFacturadas: redondear(licenciasFacturadas),
    costoLicencias: redondear(costoLicencias),
    margenLicencias: redondear(margenLicencias),
    cobertura: {
      lineasDeLicencia: licencias.length,
      conCosto: licencias.filter((l) => l.estado !== "sin-costo").length,
      factura,
      pendientes,
      conRango,
      sinInversion,
    },
  };
  const porQueNoEntra = motivoParaNoEntrar(base);
  return { ...base, porQueNoEntra, contrato: porQueNoEntra ? null : contratoDe(base) };
}

/** Por qué una propuesta ganada no se vuelve un contrato para el equilibrio, o null si entra. */
function motivoParaNoEntrar(v: Omit<LoVendidoDePropuesta, "contrato" | "porQueNoEntra">): string | null {
  const c = v.cobertura;
  if (c.sinInversion) return "La propuesta no tiene montos en la Inversión.";
  if (!c.lineasDeLicencia) return "No vende licencias: todo es servicio, no hay nada que separar.";
  if (!v.moneda) return "Ni la propuesta ni el trato de HubSpot dicen en qué moneda está.";
  if (!MONEDAS_DE_COBRO.includes(v.moneda)) return `Está en ${v.moneda}: Cobranza solo factura en USD y CRC.`;
  if (c.factura.sinDecir) {
    const cuantas = c.factura.sinDecir === 1 ? "una licencia" : `${c.factura.sinDecir} licencias`;
    const sinLista = v.licencias.filter((l) => l.quienFactura === null && l.estado === "sin-costo").length;
    return `Falta decir quién factura ${cuantas}${sinLista ? " y su precio de lista" : ""}: no se adivina.`;
  }
  if (!c.factura.smarteam) return "El cliente le paga las licencias directo al proveedor: no pasan por Smarteam.";
  const deSmarteam = v.licencias.filter((l) => l.quienFactura === "smarteam");
  const sinCosto = deSmarteam.filter((l) => l.estado === "sin-costo").length;
  if (sinCosto) return `${sinCosto === 1 ? "Una licencia" : `${sinCosto} licencias`} sin el precio de lista del proveedor: no se inventa.`;
  const noComparables = deSmarteam.filter((l) => l.estado !== "ok");
  if (noComparables.length) {
    const e = noComparables[0]!.estado;
    const porque: Record<string, string> = {
      "costo-ilegible": "un precio de lista que no se pudo leer",
      "sin-precio": "una licencia sin lo que se le cobra al cliente",
      "monedas-distintas": "un costo en otra moneda (no se convierte)",
      "periodicidad-distinta": "un costo que no se paga cada lo mismo que se cobra",
    };
    return `Hay ${porque[e] ?? "una licencia que no se puede comparar"}.`;
  }
  if (c.pendientes) return `${c.pendientes === 1 ? "Un monto" : `${c.pendientes} montos`} de la propuesta no se pudieron leer.`;
  if (!v.cuentaId) return "El cliente no tiene cuenta de cobro: no hay cobros contra los que aplicarlo.";
  if (enElContrato(sumar(v.servicios, v.licenciasFacturadas)) <= 0) return "Lo vendido suma cero.";
  return null;
}

function contratoDe(v: Omit<LoVendidoDePropuesta, "contrato" | "porQueNoEntra">): LicenciaDeContrato {
  const periodo = v.fechaCierre.slice(0, 7);
  const facturadas = v.licencias.filter((l) => l.quienFactura === "smarteam");
  return {
    id: `propuesta:${v.businessCaseId}`,
    cuentaId: v.cuentaId!,
    cuentaNombre: v.clienteNombre,
    moneda: v.moneda!,
    montoContrato: enElContrato(sumar(v.servicios, v.licenciasFacturadas)),
    montoServicio: enElContrato(v.servicios),
    proveedor: proveedorDe(facturadas),
    costoMonto: enElContrato(v.costoLicencias),
    costoMoneda: v.moneda!,
    costoCadaMeses: MESES_DEL_CONTRATO,
    desde: v.fechaCierre,
    hasta: ultimoDiaDe(sumarMeses(periodo, MESES_DEL_CONTRATO - 1)),
    fuente: `Propuesta «${v.nombre}» · ganada el ${v.fechaCierre}`,
    notas: v.versionLeida ? `Se leyó «${v.versionLeida}».` : null,
  };
}

/**
 * Los contratos de la carga a mano más los de las propuestas. Los de las propuestas van PRIMERO (y el más reciente
 * antes): `parteDeServicio` y `egresosDeLicencias` toman el primer contrato que rige en ese mes para esa cuenta y
 * moneda, así que en los meses que cubre una propuesta con el dato, manda la propuesta, y fuera de ellos sigue la carga
 * a mano. Reemplaza sin borrar nada.
 */
export function combinarLicencias(
  manuales: readonly LicenciaDeContrato[],
  dePropuestas: readonly LicenciaDeContrato[],
): LicenciaDeContrato[] {
  const propuestas = [...dePropuestas].sort((a, b) => (b.desde ?? "").localeCompare(a.desde ?? "") || a.id.localeCompare(b.id));
  return [...propuestas, ...manuales];
}

/** Los contratos que salen de una lista de propuestas leídas. */
export function contratosDeLasPropuestas(vendidas: readonly LoVendidoDePropuesta[]): LicenciaDeContrato[] {
  return vendidas.map((v) => v.contrato).filter((c): c is LicenciaDeContrato => c !== null);
}

/** El resumen para la pantalla del punto de equilibrio: cuántas propuestas ganadas, cuántas entran y por qué no. */
export interface ResumenDeLoVendido {
  ganadas: number;
  conLicencias: number;
  entran: number;
  propuestas: Array<{
    businessCaseId: string;
    nombre: string;
    clienteNombre: string;
    fechaCierre: string;
    moneda: string | null;
    servicioEnElContrato: number;
    licenciasEnElContrato: number;
    margenEnElContrato: number | null;
    entra: boolean;
    porQueNoEntra: string | null;
  }>;
}

export function resumenDeLoVendido(vendidas: readonly LoVendidoDePropuesta[]): ResumenDeLoVendido {
  return {
    ganadas: vendidas.length,
    conLicencias: vendidas.filter((v) => v.cobertura.lineasDeLicencia > 0).length,
    entran: vendidas.filter((v) => v.contrato).length,
    propuestas: vendidas
      .map((v) => ({
        businessCaseId: v.businessCaseId,
        nombre: v.nombre,
        clienteNombre: v.clienteNombre,
        fechaCierre: v.fechaCierre,
        moneda: v.moneda,
        servicioEnElContrato: enElContrato(v.servicios),
        licenciasEnElContrato: enElContrato(
          v.licencias.reduce((a, l) => sumar(a, l.cobrado), cero()),
        ),
        margenEnElContrato: v.licencias.some((l) => l.quienFactura === "smarteam" && l.margen)
          ? enElContrato(v.margenLicencias)
          : null,
        entra: !!v.contrato,
        porQueNoEntra: v.porQueNoEntra,
      }))
      .sort((a, b) => b.fechaCierre.localeCompare(a.fechaCierre) || a.nombre.localeCompare(b.nombre, "es")),
  };
}

/* ── El recálculo retroactivo: qué cambia en los ingresos por mes ─────────────────────── */

/** Un cobro ya imputado como en el equilibrio: COBRADO o POR_COBRAR, en el mes en que cuenta. */
export interface CobroImputado {
  cuentaId: string;
  moneda: string;
  /** El período del cobro: el que decide qué contrato rige (igual que el equilibrio). */
  periodoDelCobro: string;
  /** El mes en que entra al reporte (`tipoIngresoDeCobro`). */
  periodo: string;
  monto: number;
}

export interface CambioDeMes {
  cuentaId: string;
  moneda: string;
  periodo: string;
  facturado: number;
  servicioAntes: number;
  servicioDespues: number;
  licenciaAntes: number;
  licenciaDespues: number;
  /** El contrato que rige ahora en ese mes (id), o null si todo es servicio. */
  contratoDespues: string | null;
}

/** La parte de servicio con el primer contrato que rige (la misma regla que `parteDeServicio`). */
function parteCon(licencias: readonly LicenciaDeContrato[], cuentaId: string, moneda: string, periodo: string): { parte: number; id: string | null } {
  const l = licencias.find((x) => x.cuentaId === cuentaId && x.moneda === moneda && rigeEn(x, periodo));
  if (!l || !(l.montoContrato > 0)) return { parte: 1, id: l?.id ?? null };
  return { parte: Math.min(1, Math.max(0, l.montoServicio / l.montoContrato)), id: l.id };
}

/**
 * Qué cambia, mes a mes y por cuenta y moneda, entre leer las licencias de una forma (`antes`, la carga a mano) y de
 * otra (`despues`, combinada con las propuestas). Cuenta lo FACTURADO (cobrado o por cobrar) como lo imputa el
 * equilibrio con `SOLO_SERVICIO`: servicio = facturado × parte de servicio; licencia = el resto. No convierte moneda:
 * cada fila es de una sola. Devuelve solo los meses donde algo cambia.
 */
export function cambiosEnIngresos(
  cobros: readonly CobroImputado[],
  antes: readonly LicenciaDeContrato[],
  despues: readonly LicenciaDeContrato[],
): CambioDeMes[] {
  const filas = new Map<string, CambioDeMes>();
  for (const c of cobros) {
    const a = parteCon(antes, c.cuentaId, c.moneda, c.periodoDelCobro);
    const d = parteCon(despues, c.cuentaId, c.moneda, c.periodoDelCobro);
    const k = `${c.cuentaId}|${c.moneda}|${c.periodo}`;
    const f = filas.get(k) ?? {
      cuentaId: c.cuentaId, moneda: c.moneda, periodo: c.periodo,
      facturado: 0, servicioAntes: 0, servicioDespues: 0, licenciaAntes: 0, licenciaDespues: 0,
      contratoDespues: null,
    };
    const sa = r2(c.monto * a.parte);
    const sd = r2(c.monto * d.parte);
    f.facturado = r2(f.facturado + c.monto);
    f.servicioAntes = r2(f.servicioAntes + sa);
    f.servicioDespues = r2(f.servicioDespues + sd);
    f.licenciaAntes = r2(f.licenciaAntes + c.monto - sa);
    f.licenciaDespues = r2(f.licenciaDespues + c.monto - sd);
    f.contratoDespues = d.id ?? f.contratoDespues;
    filas.set(k, f);
  }
  return [...filas.values()]
    .filter((f) => f.servicioAntes !== f.servicioDespues)
    .sort((x, y) => x.cuentaId.localeCompare(y.cuentaId) || x.moneda.localeCompare(y.moneda) || x.periodo.localeCompare(y.periodo));
}
