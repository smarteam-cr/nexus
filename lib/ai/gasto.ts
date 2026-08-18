/**
 * lib/ai/gasto.ts — LEER EL LIBRO DEL MEDIDOR.
 *
 * `lib/ai/medidor.ts` escribe una fila por llamada; acá se agrega para poder mirarlo. La
 * agregación vive separada del cargador a propósito: es donde puede esconderse un error que nadie
 * ve —un total que no cuadra no se parece a nada, simplemente es un número plausible— así que se
 * escribe pura y se prueba entera sin base.
 *
 * ── LAS DOS HONESTIDADES QUE ESTE ARCHIVO SOSTIENE ───────────────────────────
 * ⚠ **Lo que no está tarifado se cuenta, no se suma como 0.** `costUsd` viene `null` cuando el
 * modelo no figura en `precios.ts`. Sumarlo como cero daría un total más bajo y perfectamente
 * creíble. Por eso cada período reporta `sinTarifa`: cuántas llamadas de ese total NO están
 * incluidas en el dinero. Si ese número no es cero, el costo es un piso, no una medición.
 *
 * ⚠ **«Hoy» es el día calendario de Costa Rica**, no de UTC. Una corrida de las 8 de la noche cae
 * en el día siguiente si se bucketea por UTC, y el total de hoy aparecería vacío hasta el mediodía.
 * Por eso el bucketeo pasa por `crDateParts` y no por `getDate()`.
 *
 * ── LO QUE NO HACE ───────────────────────────────────────────────────────────
 * No es contabilidad: el medidor pierde la fila si la base está caída (decisión escrita en
 * `medidor.ts`), así que este total se cruza contra la consola de Anthropic, no la reemplaza.
 */
import { crDateParts } from "@/lib/jobs/time";

/** Lo mínimo de una fila de `LlmCall` que la agregación necesita. */
export interface FilaDeGasto {
  at: Date;
  model: string;
  ok: boolean;
  costUsd: number | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  agentSlug: string | null;
  agentRunId: string | null;
  triggeredByEmail: string | null;
  origen: string | null;
}

export interface TotalesDeGasto {
  llamadas: number;
  fallidas: number;
  costoUsd: number;
  /** Llamadas cuyo modelo no tiene tarifa: NO están dentro de `costoUsd`. */
  sinTarifa: number;
  tokensEntrada: number;
  tokensSalida: number;
  tokensCacheLectura: number;
  tokensCacheEscritura: number;
  /** El corte que decide contra qué presupuesto se cobra (ver `contexto-de-corrida.ts`). */
  costoHumano: number;
  costoAutomatico: number;
}

export interface FilaPorAgente {
  /** El slug, o `null` cuando la llamada no quedó atribuida a ningún agente. */
  agentSlug: string | null;
  llamadas: number;
  fallidas: number;
  costoUsd: number;
  sinTarifa: number;
  tokensEntrada: number;
  tokensSalida: number;
}

export interface FilaDeCorrida {
  agentRunId: string;
  agentSlug: string | null;
  triggeredByEmail: string | null;
  llamadas: number;
  costoUsd: number;
  sinTarifa: number;
  /** La primera llamada de la corrida — sirve para ubicarla en el tiempo. */
  desde: Date;
}

export interface ResumenDeGasto {
  hoy: TotalesDeGasto;
  ultimos7: TotalesDeGasto;
  ultimos30: TotalesDeGasto;
  /** Desglose por agente sobre los últimos 30 días, de mayor a menor gasto. */
  porAgente: FilaPorAgente[];
  /** Las corridas más caras de los últimos 30 días. */
  corridasCaras: FilaDeCorrida[];
  /**
   * Cuánto del gasto de 30 días NO cuelga de ninguna corrida. ⚠ Es lo que impide leer la tabla de
   * corridas como si fuera el total: hoy la mayoría de los caminos no crea `AgentRun`.
   */
  costoSinCorrida: number;
  llamadasSinCorrida: number;
}

function totalesVacios(): TotalesDeGasto {
  return {
    llamadas: 0,
    fallidas: 0,
    costoUsd: 0,
    sinTarifa: 0,
    tokensEntrada: 0,
    tokensSalida: 0,
    tokensCacheLectura: 0,
    tokensCacheEscritura: 0,
    costoHumano: 0,
    costoAutomatico: 0,
  };
}

function acumular(t: TotalesDeGasto, f: FilaDeGasto): void {
  t.llamadas += 1;
  if (!f.ok) t.fallidas += 1;
  t.tokensEntrada += f.inputTokens;
  t.tokensSalida += f.outputTokens;
  t.tokensCacheLectura += f.cacheReadTokens;
  t.tokensCacheEscritura += f.cacheCreationTokens;

  if (f.costUsd === null) {
    t.sinTarifa += 1;
    return;
  }
  t.costoUsd += f.costUsd;
  // El default es «automático»: una llamada sin quién la disparó se cobra al presupuesto
  // que frena, igual que en `claseDeGasto`. Ver el porqué en contexto-de-corrida.ts.
  if (f.triggeredByEmail) t.costoHumano += f.costUsd;
  else t.costoAutomatico += f.costUsd;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Agrega las filas en los tres períodos y los dos desgloses.
 *
 * `ahora` se recibe y no se toma de adentro: sin eso el bucketeo de «hoy» no se puede probar.
 */
export function resumirGasto(
  filas: readonly FilaDeGasto[],
  ahora: Date,
  opciones?: { topCorridas?: number },
): ResumenDeGasto {
  const topCorridas = opciones?.topCorridas ?? 20;
  const claveDeHoy = crDateParts(ahora).dateKey;
  const desde7 = ahora.getTime() - 7 * DIA_MS;
  const desde30 = ahora.getTime() - 30 * DIA_MS;

  const hoy = totalesVacios();
  const ultimos7 = totalesVacios();
  const ultimos30 = totalesVacios();

  const porAgente = new Map<string, FilaPorAgente>();
  const corridas = new Map<string, FilaDeCorrida>();
  let costoSinCorrida = 0;
  let llamadasSinCorrida = 0;

  for (const f of filas) {
    const ms = f.at.getTime();
    if (crDateParts(f.at).dateKey === claveDeHoy) acumular(hoy, f);
    if (ms >= desde7) acumular(ultimos7, f);
    if (ms < desde30) continue;

    acumular(ultimos30, f);

    // ── Por agente ────────────────────────────────────────────────────────────
    const claveAgente = f.agentSlug ?? "";
    let a = porAgente.get(claveAgente);
    if (!a) {
      a = {
        agentSlug: f.agentSlug ?? null,
        llamadas: 0,
        fallidas: 0,
        costoUsd: 0,
        sinTarifa: 0,
        tokensEntrada: 0,
        tokensSalida: 0,
      };
      porAgente.set(claveAgente, a);
    }
    a.llamadas += 1;
    if (!f.ok) a.fallidas += 1;
    a.tokensEntrada += f.inputTokens;
    a.tokensSalida += f.outputTokens;
    if (f.costUsd === null) a.sinTarifa += 1;
    else a.costoUsd += f.costUsd;

    // ── Por corrida ───────────────────────────────────────────────────────────
    if (!f.agentRunId) {
      llamadasSinCorrida += 1;
      costoSinCorrida += f.costUsd ?? 0;
      continue;
    }
    let c = corridas.get(f.agentRunId);
    if (!c) {
      c = {
        agentRunId: f.agentRunId,
        agentSlug: f.agentSlug ?? null,
        triggeredByEmail: f.triggeredByEmail ?? null,
        llamadas: 0,
        costoUsd: 0,
        sinTarifa: 0,
        desde: f.at,
      };
      corridas.set(f.agentRunId, c);
    }
    c.llamadas += 1;
    if (f.costUsd === null) c.sinTarifa += 1;
    else c.costoUsd += f.costUsd;
    if (f.at < c.desde) c.desde = f.at;
    // La primera fila que traiga atribución la fija: dentro de una corrida el agente es el mismo,
    // pero las llamadas anidadas pueden no haber quedado envueltas.
    c.agentSlug ??= f.agentSlug ?? null;
    c.triggeredByEmail ??= f.triggeredByEmail ?? null;
  }

  return {
    hoy,
    ultimos7,
    ultimos30,
    porAgente: [...porAgente.values()].sort((x, y) => y.costoUsd - x.costoUsd),
    corridasCaras: [...corridas.values()].sort((x, y) => y.costoUsd - x.costoUsd).slice(0, topCorridas),
    costoSinCorrida,
    llamadasSinCorrida,
  };
}
