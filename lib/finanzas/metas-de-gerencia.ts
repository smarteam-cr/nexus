/**
 * lib/finanzas/metas-de-gerencia.ts — las metas de gerencia que dan plata y cómo mide Nexus su avance. PURO.
 *
 * Pedido de la reunión de gerencia (2026-11-13): el nivel Elite de HubSpot, el bono del 15 % de HubSpot por ventas
 * nuevas y el bono de ingresos recurrentes se revisaban a mano. Cada meta dice CÓMO se mide (`medida`) y Nexus lee el
 * avance de lo que ya sabe; lo que HubSpot no expone (el requisito exacto, el período, el corte) lo carga dirección.
 * Decisión: docs/DECISIONS.md › «Las metas de gerencia con HubSpot».
 *
 * Dos formas de medir, y la pantalla las dice distinto:
 *  · NIVEL     — cuánto hay HOY (el MRR gestionado, el MRR de los servicios recurrentes). El período no se usa.
 *  · ACUMULADO — cuánto se juntó DENTRO del período (las ventas nuevas de septiembre a diciembre).
 *
 * Todo en dólares. Lo que llega en otra moneda no se convierte acá: se cuenta y se dice aparte.
 * Lo carga lib/finanzas/metas-de-gerencia-server.ts; sin Prisma, sin red, sin reloj. Sin zod a propósito: lo importa la
 * pantalla (cliente), y el esquema de lo que se escribe vive en metas-de-gerencia-esquema.ts.
 */
import { fmtMonto, miles } from "@/lib/cs/formato";

export const MEDIDAS = [
  "mrr_gestionado_partner",
  "mrr_negocios_partner",
  "mrr_vendido_nuevo_partner",
  "mrr_servicios_recurrentes",
  "ventas_ganadas",
  "manual",
] as const;
export type Medida = (typeof MEDIDAS)[number];

export type FormaDeMedir = "nivel" | "acumulado";

export interface DefinicionDeMedida {
  etiqueta: string;
  forma: FormaDeMedir;
  /** Qué mide, en una o dos frases para gerencia. */
  queMide: string;
  /** De dónde sale el número. */
  deDondeSale: string;
}

export const DEFINICION_DE_MEDIDA: Record<Medida, DefinicionDeMedida> = {
  mrr_gestionado_partner: {
    etiqueta: "MRR gestionado en HubSpot",
    forma: "nivel",
    queMide:
      "Cuánto pagan al mes en HubSpot las cuentas que Smarteam gestiona. En una cuenta compartida con otro partner cuenta solo la parte de Smarteam.",
    deDondeSale: "La última copia diaria de HubSpot Partner (el MRR gestionado de cada cuenta).",
  },
  mrr_negocios_partner: {
    etiqueta: "MRR de negocios del plan de partner",
    forma: "acumulado",
    queMide:
      "El MRR de licencias que HubSpot le reconoce a Smarteam en los negocios que trajo o ayudó a cerrar, en los meses del período.",
    deDondeSale: "El avance que calcula HubSpot en sus metas «Partner Mutual Action Plan», mes por mes (negocios traídos y asistidos).",
  },
  mrr_vendido_nuevo_partner: {
    etiqueta: "MRR vendido de cuentas nuevas",
    forma: "acumulado",
    queMide: "El MRR vendido de las cuentas cuya venta con Smarteam empezó dentro del período.",
    deDondeSale: "La última copia diaria de HubSpot Partner: el MRR vendido y el día en que empezó la venta.",
  },
  mrr_servicios_recurrentes: {
    etiqueta: "MRR de servicios recurrentes",
    forma: "nivel",
    queMide:
      "Lo que Smarteam tiene para cobrar este mes por sus servicios recurrentes activos (continuidad web y CRM, soporte, conectores). No incluye licencias de HubSpot ni implementaciones.",
    deDondeSale: "Los cobros del mes en curso de los servicios recurrentes activos de Cobranza, en cualquier estado (programado, por cobrar o cobrado).",
  },
  ventas_ganadas: {
    etiqueta: "Ventas ganadas",
    forma: "acumulado",
    queMide: "La suma de los negocios ganados en el período, en los pipelines de venta de Smarteam.",
    deDondeSale: "Los negocios ganados que Nexus copia de HubSpot.",
  },
  manual: {
    etiqueta: "Avance escrito a mano",
    forma: "nivel",
    queMide: "Lo que alguien anotó, con su fecha, para lo que Nexus no puede leer.",
    deDondeSale: "Lo escrito en esta meta.",
  },
};

/** Una clave que el código no conoce (una base más nueva que el código) se lee como «a mano»: nunca rompe la página. */
export function medidaDe(texto: string): Medida {
  return (MEDIDAS as readonly string[]).includes(texto) ? (texto as Medida) : "manual";
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const enRango = (dia: string, desde: string, hasta: string) => dia >= desde && dia <= hasta;

// ── Lo que Nexus lee de cada fuente ────────────────────────────────────────────────────────────────────────────────

export interface Lectura {
  /** El avance, en dólares. null = no hay con qué medirlo (y `aviso` dice por qué). */
  valor: number | null;
  /** El día del dato («2026-11-12»): la copia de Partner, la última sincronización, hoy. */
  al: string | null;
  /** Líneas cortas que explican de qué está hecho el número. */
  detalle: string[];
  aviso: string | null;
}

/** Una cuenta de la última copia de HubSpot Partner. */
export interface CuentaDePartner {
  gestionada: boolean | null;
  mrrGestionado: number | null;
  mrrVendido: number | null;
  /** «2026-09-14», o null. */
  ventaDesde: string | null;
  comisionMensual: number | null;
}

const usd = (n: number) => fmtMonto(n, "USD");
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function leerMrrGestionado(cuentas: readonly CuentaDePartner[], ultimaCopia: string | null): Lectura {
  if (!ultimaCopia) return { valor: null, al: null, detalle: [], aviso: "No hay copia de HubSpot Partner." };
  const gestionadas = cuentas.filter((c) => c.gestionada !== false && (c.mrrGestionado ?? 0) > 0);
  const valor = r2(gestionadas.reduce((a, c) => a + (c.mrrGestionado ?? 0), 0));
  return { valor, al: ultimaCopia, detalle: [`${plural(gestionadas.length, "cuenta gestionada", "cuentas gestionadas")}.`], aviso: null };
}

export function leerMrrVendidoNuevo(cuentas: readonly CuentaDePartner[], ultimaCopia: string | null, desde: string, hasta: string): Lectura {
  if (!ultimaCopia) return { valor: null, al: null, detalle: [], aviso: "No hay copia de HubSpot Partner." };
  const nuevas = cuentas.filter((c) => c.ventaDesde && enRango(c.ventaDesde, desde, hasta) && (c.mrrVendido ?? 0) > 0);
  const valor = r2(nuevas.reduce((a, c) => a + (c.mrrVendido ?? 0), 0));
  return { valor, al: ultimaCopia, detalle: [`${plural(nuevas.length, "cuenta nueva", "cuentas nuevas")} en el período.`], aviso: null };
}

/** La comisión que HubSpot proyecta HOY, al mes (el 20 % del MRR vendido, medido el 2026-10-24). Contexto de Elite. */
export function comisionMensualDeHubspot(cuentas: readonly CuentaDePartner[]): number {
  return r2(cuentas.reduce((a, c) => a + (c.comisionMensual ?? 0), 0));
}

/** Los tipos del plan de partner que son MRR de negocios: los que Smarteam trajo y los que ayudó a cerrar. */
export const TIPOS_DEL_PLAN_DE_PARTNER = { sourced_deal_mrr: "traídos por Smarteam", assisted_deal_mrr: "asistidos" } as const;
export type TipoDelPlanDePartner = keyof typeof TIPOS_DEL_PLAN_DE_PARTNER;

/** Un tramo mensual de las metas «Partner Mutual Action Plan» de HubSpot. */
export interface TramoDelPlanDePartner {
  tipo: TipoDelPlanDePartner;
  /** «2026-09». */
  mes: string;
  /** Lo que HubSpot propone para ese mes. */
  monto: number;
  /** Lo que HubSpot dice que se lleva. null = HubSpot no lo calculó. */
  avance: number | null;
}

/** Cuenta un tramo si su MES cae dentro del período: HubSpot mide por mes completo. */
export function leerPlanDePartner(tramos: readonly TramoDelPlanDePartner[], sincronizado: string | null, desde: string, hasta: string): Lectura {
  const dentro = tramos.filter((t) => t.mes >= desde.slice(0, 7) && t.mes <= hasta.slice(0, 7));
  if (dentro.length === 0) {
    return { valor: null, al: sincronizado, detalle: [], aviso: "HubSpot no tiene metas del plan de partner para esos meses." };
  }
  const porTipo = (tipo: TipoDelPlanDePartner) => r2(dentro.filter((t) => t.tipo === tipo).reduce((a, t) => a + (t.avance ?? 0), 0));
  const valor = r2(dentro.reduce((a, t) => a + (t.avance ?? 0), 0));
  const propone = r2(dentro.reduce((a, t) => a + t.monto, 0));
  const meses = new Set(dentro.map((t) => t.mes)).size;
  return {
    valor,
    al: sincronizado,
    detalle: [
      `${usd(porTipo("sourced_deal_mrr"))} ${TIPOS_DEL_PLAN_DE_PARTNER.sourced_deal_mrr} · ${usd(porTipo("assisted_deal_mrr"))} ${TIPOS_DEL_PLAN_DE_PARTNER.assisted_deal_mrr}.`,
      `Para esos ${plural(meses, "mes", "meses")}, la meta propia de HubSpot suma ${usd(propone)}.`,
    ],
    aviso: null,
  };
}

/** Un servicio recurrente ACTIVO de Cobranza, con lo que tiene para cobrar en el mes. */
export interface ServicioRecurrente {
  /** Los cobros del mes del servicio (cualquier estado: programado, por cobrar, cobrado). */
  cobrosDelMes: { monto: number; moneda: string }[];
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/**
 * El MRR de los servicios recurrentes: lo que Cobranza tiene para cobrar ESTE MES por los servicios recurrentes activos.
 *
 * ⚠ Se leen los COBROS y no `ServicioContratado.montoTotal`: medido el 2026-11-13, en un recurrente con duración ese
 * campo es el total del contrato (3.600 = 12 cuotas de 300; 2.820 = 3 de 940) y en uno abierto es el mes. Sumarlo
 * daba US$8.819 al mes; los cobros de noviembre suman 1.114.
 */
export function leerServiciosRecurrentes(servicios: readonly ServicioRecurrente[], hoy: string): Lectura {
  let usdDelMes = 0;
  let conCobro = 0;
  let sinCobro = 0;
  const otraMoneda = new Map<string, number>();
  for (const s of servicios) {
    if (s.cobrosDelMes.length === 0) {
      sinCobro++;
      continue;
    }
    conCobro++;
    for (const c of s.cobrosDelMes) {
      if (c.moneda === "USD") usdDelMes += c.monto;
      else otraMoneda.set(c.moneda, (otraMoneda.get(c.moneda) ?? 0) + c.monto);
    }
  }
  const mes = MESES[Number(hoy.slice(5, 7)) - 1];
  const detalle = [`${plural(conCobro, "servicio recurrente activo cobra", "servicios recurrentes activos cobran")} en ${mes}.`];
  if (sinCobro > 0) {
    detalle.push(`Sin cobro en ${mes}, y por eso afuera: ${plural(sinCobro, "servicio recurrente activo", "servicios recurrentes activos")}.`);
  }
  for (const [moneda, monto] of otraMoneda) {
    detalle.push(`${moneda === "CRC" ? `₡${miles(monto)}` : `${moneda} ${miles(monto)}`} en ${moneda === "CRC" ? "colones" : moneda}, sin convertir: no está sumado.`);
  }
  return { valor: r2(usdDelMes), al: hoy, detalle, aviso: null };
}

/** Un negocio ganado en un pipeline de venta propia. */
export interface VentaParaLaMeta {
  /** «2026-09-30». */
  cierre: string;
  monto: number | null;
  moneda: string;
}

export function leerVentasGanadas(ventas: readonly VentaParaLaMeta[], sincronizado: string | null, desde: string, hasta: string): Lectura {
  const dentro = ventas.filter((v) => enRango(v.cierre, desde, hasta));
  const enUsd = dentro.filter((v) => v.moneda === "USD" && v.monto !== null);
  const sinMonto = dentro.filter((v) => v.monto === null).length;
  const otra = dentro.filter((v) => v.moneda !== "USD" && v.monto !== null).length;
  const detalle = [`${plural(enUsd.length, "negocio ganado", "negocios ganados")} en dólares.`];
  if (otra > 0) detalle.push(`${plural(otra, "negocio", "negocios")} en otra moneda: no están sumados.`);
  if (sinMonto > 0) detalle.push(`${plural(sinMonto, "negocio no tiene", "negocios no tienen")} monto en HubSpot.`);
  return { valor: r2(enUsd.reduce((a, v) => a + (v.monto ?? 0), 0)), al: sincronizado, detalle, aviso: null };
}

export function leerAvanceManual(monto: number | null, al: string | null): Lectura {
  if (monto === null) return { valor: null, al: null, detalle: [], aviso: "Nadie escribió el avance todavía." };
  return { valor: r2(monto), al, detalle: [], aviso: al ? null : "El avance no dice a qué día corresponde." };
}

// ── Cómo va la meta ────────────────────────────────────────────────────────────────────────────────────────────────

export interface MetaParaElEstado {
  objetivoUsd: number | null;
  forma: FormaDeMedir;
  desde: string | null;
  hasta: string | null;
  corteEn: string | null;
}

export interface EstadoDeLaMeta {
  /** El avance sobre el objetivo (0,82 = 82 %). null sin objetivo o sin avance. */
  pct: number | null;
  /** Lo que falta para el objetivo; 0 si ya se cumplió. */
  falta: number | null;
  cumplida: boolean;
  /** Días que faltan al corte (negativo: ya pasó). */
  diasAlCorte: number | null;
  /** En una meta acumulada, cuánto del período ya pasó (0..1). */
  tiempoPct: number | null;
}

const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export function estadoDeLaMeta(meta: MetaParaElEstado, valor: number | null, hoy: string): EstadoDeLaMeta {
  const objetivo = meta.objetivoUsd;
  const pct = objetivo && valor !== null ? valor / objetivo : null;
  const falta = objetivo && valor !== null ? r2(Math.max(0, objetivo - valor)) : null;
  let tiempoPct: number | null = null;
  if (meta.forma === "acumulado" && meta.desde && meta.hasta) {
    const total = diasEntre(meta.desde, meta.hasta) + 1;
    const pasados = Math.min(total, Math.max(0, diasEntre(meta.desde, hoy) + 1));
    tiempoPct = total > 0 ? pasados / total : null;
  }
  return {
    pct,
    falta,
    cumplida: falta === 0,
    diasAlCorte: meta.corteEn ? diasEntre(hoy, meta.corteEn) : null,
    tiempoPct,
  };
}

// ── Lo que se escribe ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Un monto escrito a mano, en dólares. «32.588», «32,588» y «32588» son lo mismo (miles con punto o coma); los centavos
 * son el final de uno o dos dígitos: «126.119,87» y «126119.87». null si no se entiende o está vacío.
 */
export function leerMontoEscrito(texto: string): number | null {
  const t = texto.trim().replace(/\s|US\$|\$/g, "");
  if (!t) return null;
  const centavos = /^(.*?)[.,](\d{1,2})$/.exec(t);
  const entero = (centavos ? centavos[1] : t).replace(/[.,]/g, "");
  if (!/^\d+$/.test(entero)) return null;
  return Number(centavos ? `${entero}.${centavos[2]}` : entero);
}
