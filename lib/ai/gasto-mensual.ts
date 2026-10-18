/**
 * lib/ai/gasto-mensual.ts — EL GASTO EN CLAUDE MES A MES. PURO: recibe las filas que la base ya agregó
 * (lib/ai/gasto-mensual-server.ts) y arma lo que muestra /integrations/gasto-ia › «Por mes».
 *
 * ── POR QUÉ LA BASE AGREGA Y ESTO SOLO ARMA ──────────────────────────────────
 * La pantalla de 30 días leía hasta 20.000 filas y sumaba en memoria: con un año de historia eso es un piso que miente
 * en silencio. Acá llegan sumas por mes (y por modelo, por proceso, por día, por cliente): no hay tope que alcanzar.
 * Lo que sigue siendo cuenta de Nexus —qué proceso es cada agente, cuánto ahorró la caché con la tarifa de cada modelo,
 * qué días pasaron el tope— vive acá, para poder probarlo entero sin base.
 *
 * ⚠ Es una medición con la tarifa publicada (lib/ai/precios.ts), no la factura: la factura se anota aparte y se compara
 * («Factura»). Lo que no tiene tarifa se cuenta en `sinTarifa` y NO suma 0 al costo.
 */
import { ahorroDeLaCache } from "./precios";
import { procesoDeLaLlamada, PROCESO_POR_CLAVE, type ClaveDeProceso } from "@/lib/uso/ia";
import type { LimitesDePresupuesto } from "./presupuesto";

/* ── Las filas que llegan de la base ──────────────────────────────────────── */

/** Un mes (hora de Costa Rica), un modelo y si fue por lote. */
export interface FilaMesModelo {
  mes: string;
  model: string;
  lote: boolean;
  llamadas: number;
  fallidas: number;
  sinTarifa: number;
  costo: number;
  costoHumano: number;
  tokensEntrada: number;
  tokensSalida: number;
  tokensCacheLectura: number;
  tokensCacheEscritura: number;
}

/** Un mes y un agente, con dos marcas del `origen` para los que no tienen agente (ver `procesoDeLaLlamada`). */
export interface FilaMesAgente {
  mes: string;
  agentSlug: string | null;
  esAvance: boolean;
  esLectura: boolean;
  costo: number;
  llamadas: number;
  /** Corridas distintas (`agentRunId`) de ese agente en el mes. */
  corridas: number;
}

/** Un día (Costa Rica) con lo gastado de cada clase. */
export interface FilaDia {
  dia: string;
  costoHumano: number;
  costoAutomatico: number;
}

/** Las llamadas que disparó la lectura de una reunión (`origen = "reunion:<id> › …"`), por mes. */
export interface FilaMesReuniones {
  mes: string;
  reuniones: number;
  costo: number;
}

/** Un mes y una empresa (la de la llamada, la de su corrida o la dueña de su reunión). */
export interface FilaMesCliente {
  mes: string;
  clientId: string;
  nombre: string;
  costo: number;
  llamadas: number;
}

/* ── Lo que se arma ───────────────────────────────────────────────────────── */

export interface ProcesoDelMes {
  clave: ClaveDeProceso;
  nombre: string;
  costo: number;
  llamadas: number;
  corridas: number;
}

export interface MesDeGasto {
  mes: string;
  costo: number;
  llamadas: number;
  fallidas: number;
  sinTarifa: number;
  costoHumano: number;
  costoAutomatico: number;
  /** Lo que ahorró la caché (puede ser negativo: escribir sin leer es un recargo). */
  ahorroCache: number;
  /** Lo que ahorró la API Batch: lo pagado por lote es la mitad, así que el ahorro es igual a lo pagado. */
  ahorroLote: number;
  costoPorLote: number;
  tokensEntrada: number;
  tokensSalida: number;
  tokensCacheLectura: number;
  tokensCacheEscritura: number;
  /** Qué parte de la entrada salió de la caché (0–1). */
  parteDeLaCache: number;
  procesos: ProcesoDelMes[];
  reuniones: number;
  costoDeReuniones: number;
  /** Lo que costó cada reunión leída (todo lo que su lectura disparó), o null si no se leyó ninguna. */
  costoPorReunion: number | null;
  diasSobreElTope: { automatico: number; humano: number };
  diaMasCaro: { dia: string; costo: number } | null;
  clientes: { clientId: string; nombre: string; costo: number; llamadas: number }[];
}

const vacio = (mes: string): MesDeGasto => ({
  mes,
  costo: 0,
  llamadas: 0,
  fallidas: 0,
  sinTarifa: 0,
  costoHumano: 0,
  costoAutomatico: 0,
  ahorroCache: 0,
  ahorroLote: 0,
  costoPorLote: 0,
  tokensEntrada: 0,
  tokensSalida: 0,
  tokensCacheLectura: 0,
  tokensCacheEscritura: 0,
  parteDeLaCache: 0,
  procesos: [],
  reuniones: 0,
  costoDeReuniones: 0,
  costoPorReunion: null,
  diasSobreElTope: { automatico: 0, humano: 0 },
  diaMasCaro: null,
  clientes: [],
});

/** El mes de un día «AAAA-MM-DD». */
const mesDelDia = (dia: string) => dia.slice(0, 7);

/** El proceso de una fila agrupada: se le da un `origen` de mentira con las dos marcas que mira `procesoDeLaLlamada`. */
export function procesoDeLaFila(f: Pick<FilaMesAgente, "agentSlug" | "esAvance" | "esLectura">): ClaveDeProceso {
  const origen = f.esAvance ? "avance" : f.esLectura ? "sessions/post-process" : null;
  return procesoDeLaLlamada({ agentSlug: f.agentSlug, origen });
}

/** ¿Un día pasó el tope de su clase? Igual que `evaluarPresupuesto`: llegar al tope ya es pasarlo. */
export function diaSobreElTope(d: FilaDia, limites: Pick<LimitesDePresupuesto, "automatico" | "humano">): { automatico: boolean; humano: boolean } {
  return { automatico: d.costoAutomatico >= limites.automatico, humano: d.costoHumano >= limites.humano };
}

/**
 * Arma los meses, del más viejo al más nuevo. Un mes aparece si tiene alguna llamada. Los clientes van de más a menos
 * costo (los primeros `topClientes`).
 */
export function resumirMeses(
  e: {
    modelos: readonly FilaMesModelo[];
    agentes: readonly FilaMesAgente[];
    dias: readonly FilaDia[];
    reuniones: readonly FilaMesReuniones[];
    clientes: readonly FilaMesCliente[];
  },
  limites: Pick<LimitesDePresupuesto, "automatico" | "humano">,
  opciones?: { topClientes?: number },
): MesDeGasto[] {
  const top = opciones?.topClientes ?? 10;
  const meses = new Map<string, MesDeGasto>();
  const mes = (m: string) => {
    let x = meses.get(m);
    if (!x) {
      x = vacio(m);
      meses.set(m, x);
    }
    return x;
  };

  for (const f of e.modelos) {
    const m = mes(f.mes);
    m.costo += f.costo;
    m.llamadas += f.llamadas;
    m.fallidas += f.fallidas;
    m.sinTarifa += f.sinTarifa;
    m.costoHumano += f.costoHumano;
    m.costoAutomatico += f.costo - f.costoHumano;
    m.tokensEntrada += f.tokensEntrada;
    m.tokensSalida += f.tokensSalida;
    m.tokensCacheLectura += f.tokensCacheLectura;
    m.tokensCacheEscritura += f.tokensCacheEscritura;
    m.ahorroCache += ahorroDeLaCache(f.model, { cacheReadTokens: f.tokensCacheLectura, cacheCreationTokens: f.tokensCacheEscritura }, { lote: f.lote }) ?? 0;
    if (f.lote) {
      m.costoPorLote += f.costo;
      m.ahorroLote += f.costo;
    }
  }

  const procesos = new Map<string, Map<ClaveDeProceso, ProcesoDelMes>>();
  for (const f of e.agentes) {
    const clave = procesoDeLaFila(f);
    mes(f.mes);
    const delMes = procesos.get(f.mes) ?? new Map<ClaveDeProceso, ProcesoDelMes>();
    procesos.set(f.mes, delMes);
    const p = delMes.get(clave) ?? { clave, nombre: PROCESO_POR_CLAVE.get(clave)?.nombre ?? clave, costo: 0, llamadas: 0, corridas: 0 };
    p.costo += f.costo;
    p.llamadas += f.llamadas;
    p.corridas += f.corridas;
    delMes.set(clave, p);
  }

  for (const f of e.reuniones) {
    const m = mes(f.mes);
    m.reuniones += f.reuniones;
    m.costoDeReuniones += f.costo;
  }

  for (const d of e.dias) {
    const m = mes(mesDelDia(d.dia));
    const sobre = diaSobreElTope(d, limites);
    if (sobre.automatico) m.diasSobreElTope.automatico++;
    if (sobre.humano) m.diasSobreElTope.humano++;
    const total = d.costoHumano + d.costoAutomatico;
    if (!m.diaMasCaro || total > m.diaMasCaro.costo) m.diaMasCaro = { dia: d.dia, costo: total };
  }

  const clientes = new Map<string, FilaMesCliente[]>();
  for (const c of e.clientes) {
    mes(c.mes);
    const l = clientes.get(c.mes) ?? [];
    l.push(c);
    clientes.set(c.mes, l);
  }

  for (const m of meses.values()) {
    const entradaTotal = m.tokensEntrada + m.tokensCacheLectura + m.tokensCacheEscritura;
    m.parteDeLaCache = entradaTotal > 0 ? m.tokensCacheLectura / entradaTotal : 0;
    m.costoPorReunion = m.reuniones > 0 ? m.costoDeReuniones / m.reuniones : null;
    m.procesos = [...(procesos.get(m.mes)?.values() ?? [])].sort((a, b) => b.costo - a.costo || b.llamadas - a.llamadas);
    m.clientes = (clientes.get(m.mes) ?? [])
      .map(({ clientId, nombre, costo, llamadas }) => ({ clientId, nombre, costo, llamadas }))
      .sort((a, b) => b.costo - a.costo)
      .slice(0, top);
  }

  return [...meses.values()].sort((a, b) => a.mes.localeCompare(b.mes));
}

/**
 * El mes en curso proyectado a fin de mes, al ritmo de lo que va: lo gastado ÷ días transcurridos × días del mes. Se
 * muestra al lado del total del mes, nunca en su lugar: el 3 de octubre, tres días no dicen mucho de un mes.
 */
export function finDeMesAlRitmo(costoDelMes: number, hoy: { dia: number; diasDelMes: number }): number {
  if (hoy.dia <= 0) return costoDelMes;
  return (costoDelMes / hoy.dia) * hoy.diasDelMes;
}

/** Los días que tiene un mes «AAAA-MM». */
export function diasDelMes(mes: string): number {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

/* ── La factura ───────────────────────────────────────────────────────────── */

export interface ComparacionConLaFactura {
  mes: string;
  medido: number;
  facturado: number | null;
  /** facturado − medido, o null sin factura. */
  diferencia: number | null;
  /** La diferencia sobre lo facturado (−1 a 1…), o null. */
  parte: number | null;
  /** Más del 10 % de diferencia (y más de US$5): hay que mirar los precios o filas perdidas. */
  revisar: boolean;
}

/** Cuánto se tolera entre lo medido y la factura antes de pedir que se mire. */
export const TOLERANCIA_FACTURA = { parte: 0.1, usd: 5 } as const;

/** Compara cada mes medido con su factura anotada. Un mes con factura y sin medición aparece igual (medido 0). */
export function compararConLaFactura(meses: readonly { mes: string; costo: number }[], facturas: readonly { mes: string; montoUsd: number }[]): ComparacionConLaFactura[] {
  const porMes = new Map(facturas.map((f) => [f.mes, f.montoUsd]));
  const todos = new Set([...meses.map((m) => m.mes), ...facturas.map((f) => f.mes)]);
  const medidoPorMes = new Map(meses.map((m) => [m.mes, m.costo]));
  return [...todos]
    .sort()
    .map((mes) => {
      const medido = medidoPorMes.get(mes) ?? 0;
      const facturado = porMes.get(mes) ?? null;
      const diferencia = facturado === null ? null : facturado - medido;
      const parte = facturado === null || facturado === 0 ? null : diferencia! / facturado;
      const revisar = diferencia !== null && Math.abs(diferencia) > TOLERANCIA_FACTURA.usd && (parte === null || Math.abs(parte) > TOLERANCIA_FACTURA.parte);
      return { mes, medido, facturado, diferencia, parte, revisar };
    });
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «2026-10» → «oct 2026». Igual en el servidor y en el navegador (sin `toLocaleString`). */
export const nombreDelMes = (mes: string) => `${MESES_CORTOS[Number(mes.slice(5, 7)) - 1] ?? mes} ${mes.slice(0, 4)}`;
