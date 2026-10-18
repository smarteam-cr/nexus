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

/** Lo que se escribe en la fila. `transcript`/`summary` en `undefined` = NO tocar lo que hay; `transcript: null` = vaciarla. */
export interface DatosDeEscritura {
  transcript?: string | null;
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
  /** `vaciarTranscripcion`: el documento del EVENTO trae solo notas y la transcripción guardada es de otra reunión. */
  opts: { esperarMaterial?: boolean; vaciarTranscripcion?: boolean } = {},
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

  /* «Leí bien y no había NADA» en una reunión que terminó hace poco no es definitivo (2026-10-17): Gemini escribe el
     documento minutos después de que termina la reunión, y la transcripción de Meet se crea al final. Antes se sellaba
     al primer intento, una hora después del INICIO: toda reunión de una hora o más se leía mientras seguía en curso, y
     sin un documento nuevo en el evento no se volvía a mirar nunca. Mientras dure la espera (`debeEsperarMaterial`),
     cuenta como un intento y vuelve en 2, 4, 8 y 16 horas; al tope se sella con su diagnóstico, como siempre. */
  if (opts.esperarMaterial && !lectura.transcript && !summaryFinal && attemptsPrevios + 1 < MAX_ENRICH_ATTEMPTS) {
    return {
      enrichAttempts: attemptsPrevios + 1,
      enrichError: JSON.stringify({ diagnostico: lectura.diagnostico, esperandoMaterial: true, at: now.toISOString() }),
    };
  }

  return {
    // Sin transcripción en lo leído, la guardada no se toca, salvo que sea de OTRA reunión (`vaciarTranscripcion`).
    transcript: lectura.transcript ?? (opts.vaciarTranscripcion ? null : undefined),
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

/* ── Cuándo se lee una reunión (2026-10-17) ─────────────────────────────────────────────────── */

/** Cuánto se espera después del FIN de la reunión antes de leerla: Gemini y Meet escriben sus archivos al terminar. */
export const MARGEN_TRAS_EL_FIN_MS = 20 * 60_000;

/** Una reunión de más de esto (un evento de día completo con Meet) se mide como si durara esto. */
const DURACION_MAXIMA_MIN = 8 * 60;

/** Mientras la reunión terminó hace menos de esto, «no había nada» no sella: el material puede estar por llegar. */
export const VENTANA_DE_ESPERA_MS = 48 * 3_600_000;

/** PURA. Cuándo terminó la reunión: el inicio más su duración (0 si no se sabe; un día completo, 8 horas). */
export function finDeLaReunion(s: { date: Date; duration: number | null | undefined }): Date {
  const minutos = Math.min(Math.max(s.duration ?? 0, 0), DURACION_MAXIMA_MIN);
  return new Date(s.date.getTime() + minutos * 60_000);
}

/**
 * PURA. ¿Ya se puede leer? Cuando pasaron `margen` minutos desde el FIN (no desde el inicio: hasta el 2026-10-17 se leía
 * una hora después del inicio, y una reunión de una hora se leía antes de que existiera su transcripción).
 */
export function listaParaLeer(s: { date: Date; duration: number | null | undefined }, now: Date, margen = MARGEN_TRAS_EL_FIN_MS): boolean {
  return now.getTime() >= finDeLaReunion(s).getTime() + margen;
}

/** PURA. ¿Todavía puede llegar el material? Terminó hace menos de `VENTANA_DE_ESPERA_MS`. */
export function debeEsperarMaterial(s: { date: Date; duration: number | null | undefined }, now: Date): boolean {
  return now.getTime() - finDeLaReunion(s).getTime() < VENTANA_DE_ESPERA_MS;
}

/** PURA. ¿El error de un intento fue de «todavía no había nada» (y no de una lectura que falló)? */
export function estaEsperandoMaterial(enrichError: string | null): boolean {
  try {
    return (JSON.parse(enrichError ?? "{}") as { esperandoMaterial?: unknown }).esperandoMaterial === true;
  } catch {
    return false;
  }
}

/**
 * PURA. ¿Con este resultado conviene probar con OTRA cuenta del equipo invitada a la reunión? Una cuenta borrada (401,
 * invalid_grant), sin acceso al documento (403 o 404: las notas de Gemini pueden estar compartidas solo con quien las
 * tomó, o con su organizador) o, al buscar en Drive, sin nada en ESA cuenta (las notas que tomó otro invitado quedan en
 * su Drive). Antes solo se probaba la siguiente ante una cuenta borrada: un 403 se reintentaba 5 veces con la misma.
 */
export function probarOtraCuenta(l: LecturaDoc, buscandoEnDrive: boolean): boolean {
  if (!l.ok) return l.status === 401 || l.status === 403 || l.status === 404 || /invalid_grant|unauthorized_client/i.test(l.error);
  return buscandoEnDrive && !l.transcript && !l.summary;
}
