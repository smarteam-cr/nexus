/**
 * lib/google/enrich-retry.ts — LA POLÍTICA de escritura y reintento del enriquecimiento.
 * Pura: qué se escribe ante cada resultado, cuándo se reintenta y cuánto se espera son
 * tres tablas de test, no tres ramas escondidas entre llamadas a Google.
 *
 * ── EL INCIDENTE (2026-08-08) ────────────────────────────────────────────────
 * El enriquecimiento trataba TODO resultado como definitivo: un fallo de lectura se tragaba
 * en un catch mudo y la fila quedaba `enrichedAt` sellada PARA SIEMPRE. Dos corridas masivas
 * se quemaron así (17-may: 528/1100 · 7-jul: 47/73, contra 0-5 en días normales) y quedó
 * CERO rastro del error: la investigación tuvo que inferir las causas en vez de leerlas.
 *
 * La regla nueva, en una línea: **un fallo de lectura NUNCA sella; solo el éxito o el tope
 * de intentos sellan — y siempre con procedencia escrita.**
 */

/** Al 5º fallo se sella con procedencia: el tope impide el loop infinito que el sellado
 *  incondicional evitaba a lo bruto. */
export const MAX_ENRICH_ATTEMPTS = 5;

/** El resultado de LEER el material de una sesión — discriminado a propósito: el que escribe
 *  no puede confundir «falló la lectura» con «leí bien y no había nada». */
export type LecturaDoc =
  | {
      ok: true;
      transcript: string | null;
      summary: { overview: string } | null;
      /** Qué se vio y por qué se decidió — se persiste cuando no hay transcript. */
      diagnostico: { tabsVistos: string[]; motivo: string } | null;
    }
  | { ok: false; error: string; status: number | null };

/** Lo que se escribe en la fila. `transcript`/`summary` en `undefined` = NO tocar lo que hay. */
export interface DatosDeEscritura {
  transcript?: string;
  summary?: { overview: string };
  enrichedAt?: Date;
  enrichAttempts: number;
  enrichError: string | null;
}

/**
 * PURA. Resultado de lectura → qué escribir.
 *
 *  · ok=false        → attempts+1, error con {error,status,at}, y **SIN enrichedAt** — la
 *                      fila queda pendiente para el job de reintento. Salvo al tope: ahí se
 *                      sella CON la procedencia del último fallo.
 *  · ok=true         → se sella. attempts vuelve a 0. Si NO hubo transcript, el diagnóstico
 *                      del parser queda persistido (los nombres de pestañas dejan de vivir
 *                      solo en el stdout del VPS); si lo hubo, el error se limpia.
 */
export function datosDeEscritura(
  lectura: LecturaDoc,
  summaryFinal: { overview: string } | null,
  attemptsPrevios: number,
  now: Date,
): DatosDeEscritura {
  if (!lectura.ok) {
    /* Un fallo DETERMINÍSTICO no se reintenta: reintentar 5 veces algo que no puede cambiar
       solo (una reunión 100% externa sin interno que impersonar) infla la cola del job y
       produce head-of-line blocking sobre los fallos que SÍ valen la pena (auditoría
       2026-08-08). Se sella al primer intento, con su procedencia. */
    const definitivo = lectura.error === "sin_interno_para_impersonar";
    const attempts = definitivo ? MAX_ENRICH_ATTEMPTS : attemptsPrevios + 1;
    const procedencia = JSON.stringify({
      error: lectura.error.slice(0, 500),
      status: lectura.status,
      at: now.toISOString(),
      ...(attempts >= MAX_ENRICH_ATTEMPTS ? { selladoPorTope: true } : {}),
    });
    if (attempts >= MAX_ENRICH_ATTEMPTS) {
      return { enrichedAt: now, enrichAttempts: attempts, enrichError: procedencia };
    }
    return { enrichAttempts: attempts, enrichError: procedencia };
  }

  return {
    transcript: lectura.transcript ?? undefined,
    summary: summaryFinal ?? undefined,
    enrichedAt: now,
    enrichAttempts: 0,
    enrichError: lectura.transcript
      ? null
      : JSON.stringify({ diagnostico: lectura.diagnostico, at: now.toISOString() }),
  };
}

/**
 * PURA. ¿Le toca YA otro intento a una fila fallida? Espera exponencial: 2^attempts horas
 * desde el último fallo (2h, 4h, 8h, 16h). Sin `at` legible se reintenta de una — el lado
 * seguro de un error corrupto es intentar, no esperar para siempre.
 */
export function esReintentable(attempts: number, enrichError: string | null, now: Date): boolean {
  if (attempts < 1 || attempts >= MAX_ENRICH_ATTEMPTS) return false;
  let at: number | null = null;
  try {
    const parsed = JSON.parse(enrichError ?? "{}") as { at?: string };
    if (parsed.at) at = Date.parse(parsed.at);
  } catch {
    at = null;
  }
  if (at === null || Number.isNaN(at)) return true;
  const esperaMs = Math.pow(2, attempts) * 3_600_000;
  return now.getTime() - at >= esperaMs;
}

/**
 * PURA. Cuánto duerme el LOTE tras un batch con 429/5xx: 2^fallos segundos, tope 60s.
 * Es lo que faltaba el 17-may: DOC_BATCH=10 sin pausa contra una API que ya estaba
 * devolviendo cuota — cada batch quemaba 10 filas más.
 */
export function esperaBackoffMs(fallosConsecutivos: number): number {
  if (fallosConsecutivos <= 0) return 0;
  return Math.min(Math.pow(2, fallosConsecutivos) * 1_000, 60_000);
}

/** ¿El status amerita backoff del lote? (cuota o servidor caído — no un 403 puntual). */
export function esErrorDeCuota(status: number | null): boolean {
  return status === 429 || (status !== null && status >= 500);
}
