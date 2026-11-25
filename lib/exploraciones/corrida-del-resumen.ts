/**
 * lib/exploraciones/corrida-del-resumen.ts — la corrida de «Armar el Resumen» / «Rehacer con IA», como la sigue la
 * pantalla (24 nov, TEC · AE). PURO y client-safe: sin base de datos ni React; el seguimiento recibe la red y el reloj.
 *
 * Hasta el 24 nov el botón esperaba la respuesta del POST mientras Nexus escribía (unos 3 minutos). Una llamada a la IA que
 * no volvió en 904 s dejó al navegador con un 504 de nginx (corta a los 600 s): la pantalla pareció cancelarse, sin decir
 * nada. Ahora el POST arranca la corrida y responde enseguida (202); la corrida sigue en el servidor y la pantalla la
 * consulta cada pocos segundos (GET …/escala/resumen) hasta que termina, con la fase REAL que escribe el servidor
 * (`FASES_DEL_RESUMEN`). Si se sale de la página y vuelve, la retoma. Si falla, lo dice en palabras simples.
 *
 * EL LATIDO (`updatedAt`): el servidor lo escribe al empezar cada llamada a la IA y en cada cambio de fase. Dos preguntas,
 * dos números (lib/agents/run-colgada.ts las separa a propósito):
 *   · ¿murió? — la regla de todo Nexus (`estaColgada`, 30 min sin latido): la pantalla dice que se interrumpió, igual que
 *     el centro de corridas;
 *   · ¿puedo arrancar otra? — `MINUTOS_SIN_LATIDO` (10): ninguna llamada dura más de `TOPES_DEL_RESUMEN.principal.totalMs`
 *     (6 min), así que una corrida viva siempre late antes. Sin latido por más de eso está DETENIDA: el candado del
 *     servidor ya deja otra y la pantalla ofrece «Volver a intentar».
 */
import { estaColgada, MOTIVO_COLGADA } from "@/lib/agents/run-colgada";

/** La corrida del Resumen, como la ve la pantalla. */
export interface CorridaDelResumen {
  id: string;
  estado: "RUNNING" | "DONE" | "ERROR";
  /** En qué va, escrito por el servidor (`FASES_DEL_RESUMEN`). */
  fase: string | null;
  empezo: string;
  termino: string | null;
  /** Por qué no terminó, en palabras simples. */
  error: string | null;
  /** Lo que Nexus escribió y no pasó la verificación (al terminar bien). */
  descartados: string[];
  segundos: number | null;
  /** Dice que corre pero no late hace más de MINUTOS_SIN_LATIDO: se puede arrancar otra. Opcional: solo si es así. */
  detenida?: true;
}

/**
 * Los topes de cada llamada a la IA del Resumen (lib/ai/llamada-con-tope.ts; los usa el servidor). Con streaming, una
 * llamada sin ninguna señal en `sinSenalMs` está colgada; ninguna dura más de `totalMs`; se intenta una vez más. La
 * principal (las reuniones enteras, 16 mil tokens de salida) tarda de 125 a 205 s cuando anda bien (13 corridas desde el
 * 21 nov); las de arreglo, segundos.
 */
export const TOPES_DEL_RESUMEN = {
  principal: { sinSenalMs: 150_000, totalMs: 6 * 60_000, intentos: 2 },
  arreglo: { sinSenalMs: 90_000, totalMs: 3 * 60_000, intentos: 2 },
} as const;

/** Sin un latido por más de esto, la corrida está detenida: el servidor deja arrancar otra. Más que la llamada más larga. */
export const MINUTOS_SIN_LATIDO = 10;

/** Lo que la corrida va escribiendo como su fase: lo lee la pantalla tal cual. */
export const FASES_DEL_RESUMEN = {
  leyendo: (reuniones: number, notas: number) =>
    `Leyendo ${reuniones === 1 ? "1 reunión" : `${reuniones} reuniones`}${notas ? ` y ${notas === 1 ? "1 nota del equipo" : `${notas} notas del equipo`}` : ""}…`,
  escribiendo: "Escribiendo el Resumen…",
  escribiendoOtraVez: "La primera respuesta no se pudo leer: escribiéndolo otra vez…",
  revisando: "Revisando las cifras, las citas y lo que ya se resolvió…",
  otraVez: "La IA no respondía: probando otra vez…",
  guardando: "Guardando el Resumen…",
} as const;

export const ERROR_SIN_RESPUESTA = "La IA no respondió, ni al volver a intentarlo. No se cambió nada: vuelve a intentarlo en unos minutos.";
const ERROR_SIN_MOTIVO = "No se pudo armar el Resumen. No se cambió nada: vuelve a intentarlo.";

/** La fila de `AgentRun` que hace falta para armar la corrida (lo que selecciona el servidor). */
export interface FilaDeLaCorridaDelResumen {
  id: string;
  status: string;
  currentPhase: string | null;
  createdAt: Date;
  updatedAt: Date;
  output: string | null;
}

/** ¿Dice que corre pero no late hace más de MINUTOS_SIN_LATIDO? (mira el latido, nunca cuándo empezó) */
export function sinLatido(f: Pick<FilaDeLaCorridaDelResumen, "status" | "updatedAt">, ahora = new Date()): boolean {
  return f.status === "RUNNING" && ahora.getTime() - f.updatedAt.getTime() > MINUTOS_SIN_LATIDO * 60_000;
}

function salidaDe(output: string | null): { error?: unknown; descartados?: unknown } {
  if (!output) return {};
  try {
    const j = JSON.parse(output) as unknown;
    return j && typeof j === "object" ? (j as { error?: unknown; descartados?: unknown }) : {};
  } catch {
    return {};
  }
}

/** La fila, como la ve la pantalla. Una que murió sin escribir su final se informa como lo que es (la regla de Nexus). */
export function corridaDesdeLaFila(f: FilaDeLaCorridaDelResumen, ahora = new Date()): CorridaDelResumen {
  const base = { id: f.id, empezo: f.createdAt.toISOString(), fase: null, descartados: [] as string[] };
  if (estaColgada(f, ahora)) return { ...base, estado: "ERROR", termino: f.updatedAt.toISOString(), error: MOTIVO_COLGADA, segundos: null };
  if (f.status !== "DONE" && f.status !== "ERROR")
    return { ...base, estado: "RUNNING", fase: f.currentPhase, termino: null, error: null, segundos: null, ...(sinLatido(f, ahora) ? { detenida: true as const } : {}) };
  const s = salidaDe(f.output);
  const segundos = Math.max(0, Math.round((f.updatedAt.getTime() - f.createdAt.getTime()) / 1000));
  const descartados = Array.isArray(s.descartados) ? s.descartados.filter((x): x is string => typeof x === "string").slice(0, 200) : [];
  if (f.status === "DONE") return { ...base, estado: "DONE", termino: f.updatedAt.toISOString(), error: null, descartados, segundos };
  return { ...base, estado: "ERROR", termino: f.updatedAt.toISOString(), error: typeof s.error === "string" && s.error.trim() ? s.error : ERROR_SIN_MOTIVO, segundos };
}

/** «1 min 20 s», «45 s». */
export function cuantoLleva(desde: string, ahora = Date.now()): string {
  const s = Math.max(0, Math.round((ahora - Date.parse(desde)) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return s % 60 ? `${m} min ${s % 60} s` : `${m} min`;
}

// ── Lo que dice el aviso de arriba del Resumen ──────────────────────────────────

export type AvisoDelResumen =
  | { tipo: "corriendo"; fase: string; desde: string | null }
  | { tipo: "sin-saber" }
  | { tipo: "detenida" }
  | { tipo: "falta"; fallo: string | null }
  | { tipo: "fallo"; id: string; error: string }
  /** `ubicar`: alguna de esas notas tampoco la leyó «Ubicar» y puede cambiar un nivel: el paso es volver a ubicar. */
  | { tipo: "nuevas"; titulo: string; ubicar?: true }
  | null;

/**
 * Qué dice el aviso de arriba del Resumen (PaginaDeLaEscala › `AvisoDelResumen`), en este orden: corriendo (la fase y desde
 * cuándo; mientras arranca, la corrida de la foto es la de antes y no da ni fase ni reloj), no se sabe en qué va (la red
 * se cortó), detenida (no late: ofrecer otra), falta armarlo (con el último fallo, si lo hubo), el fallo de rehacerlo (solo
 * si es de DESPUÉS del Resumen que hay y nadie lo cerró) y las notas nuevas que no leyó.
 * `ubicarPrimero` (25 nov): alguna de esas notas nuevas tampoco la leyó «Ubicar» (completar-el-diagnostico.ts ›
 * `notasSinUbicar`). Una nota puede fijar un nivel, así que el aviso ofrece primero volver a ubicar y, cuando «Ubicar» ya
 * las leyó, rehacer el Resumen: un solo botón por vez, en ese orden.
 */
export function queDiceElAviso(o: {
  resumenEn: string | null;
  corrida: CorridaDelResumen | null;
  lanzando: boolean;
  sinSaber: boolean;
  nuevas: string | null;
  cerrado: string | null;
  ubicarPrimero?: boolean;
}): AvisoDelResumen {
  const { corrida: c } = o;
  const viva = c?.estado === "RUNNING" && !c.detenida ? c : null;
  if (o.lanzando || (viva && !o.sinSaber)) return { tipo: "corriendo", fase: viva?.fase ?? "Empezando…", desde: viva?.empezo ?? null };
  if (c?.estado === "RUNNING" && o.sinSaber) return { tipo: "sin-saber" };
  if (c?.estado === "RUNNING" && c.detenida) return { tipo: "detenida" };
  const despuesDelResumen = !!c && (!o.resumenEn || Date.parse(c.termino ?? c.empezo) > Date.parse(o.resumenEn));
  const fallo = c?.estado === "ERROR" && c.id !== o.cerrado && despuesDelResumen ? c : null;
  if (!o.resumenEn) return { tipo: "falta", fallo: fallo?.error ?? null };
  if (fallo) return { tipo: "fallo", id: fallo.id, error: fallo.error ?? ERROR_SIN_MOTIVO };
  if (!o.nuevas) return null;
  return o.ubicarPrimero ? { tipo: "nuevas", titulo: o.nuevas, ubicar: true } : { tipo: "nuevas", titulo: o.nuevas };
}

// ── El seguimiento (sin React: se prueba con la red y el reloj simulados) ─────

/** La corrida que armó el Resumen que hay (la última que terminó bien): desde cuándo leyó. */
export interface CorridaTerminada {
  id: string;
  empezo: string;
}

export interface FotoDelResumen {
  /** La última corrida del Resumen de esta exploración (null: nunca se armó o todavía no se consultó). */
  corrida: CorridaDelResumen | null;
  /** La última que terminó bien (para saber desde cuándo leyó el Resumen que hay). */
  terminada: CorridaTerminada | null;
  /** Se está pidiendo que arranque. */
  lanzando: boolean;
  /** Se dejó de consultar sin saber cómo terminó (la red se cortó un buen rato): la pantalla ofrece «Volver a mirar». */
  sinSaber: boolean;
}

/** `ajena`: se siguió una corrida que ya corría (otra pestaña, otra persona): lo pedido después no entró en ella. */
export type ResultadoDeArmar = { ok: true; corrida: CorridaDelResumen; ajena: boolean } | { ok: false; error: string; corrida?: CorridaDelResumen };

/** Lo que responde la ruta: el GET siempre con `corrida`; el POST con `corrida` si arrancó o si ya había una (409). */
export interface RespuestaDeLaRuta {
  status: number;
  corrida?: CorridaDelResumen | null;
  terminada?: CorridaTerminada | null;
  error?: string;
}

export interface RedDelResumen {
  /** GET …/escala/resumen. */
  consultar: () => Promise<RespuestaDeLaRuta>;
  /** POST …/escala/resumen. */
  arrancar: () => Promise<RespuestaDeLaRuta>;
  esperar: (ms: number) => Promise<void>;
}

/** Cada cuánto se consulta y por cuánto como mucho (400 × 3 s = 20 min: más que una corrida con reintentos). */
const CADA_MS = 3000;
const VUELTAS = 400;
/** Cuántas consultas seguidas pueden fallar (20 × 3 s = 1 min: lo que dura un deploy) antes de dejar de mirar. */
const FALLOS_SEGUIDOS = 20;
export const ERROR_SIN_SABER = "No pudimos saber si el Resumen terminó. Vuelve a mirar en un rato.";
export const ERROR_DETENIDA = `Nexus no da señales hace más de ${MINUTOS_SIN_LATIDO} minutos: puede haberse interrumpido. Vuelve a intentarlo.`;

export interface SeguimientoDelResumen {
  foto: () => FotoDelResumen;
  suscribir: (oyente: () => void) => () => void;
  /** Consulta la última corrida y, si corre, la sigue hasta que termina. */
  mirar: () => Promise<void>;
  /** Arranca una (o sigue la que ya corre) y espera a que termine. */
  armar: () => Promise<ResultadoDeArmar>;
}

const ok = (r: RespuestaDeLaRuta) => r.status >= 200 && r.status < 300 && r.corrida !== undefined;

export function crearSeguimientoDelResumen(red: RedDelResumen): SeguimientoDelResumen {
  let foto: FotoDelResumen = { corrida: null, terminada: null, lanzando: false, sinSaber: false };
  const oyentes = new Set<() => void>();
  const poner = (cambio: Partial<FotoDelResumen>) => {
    foto = { ...foto, ...cambio };
    for (const o of oyentes) o();
  };
  const ponerLaRespuesta = (r: RespuestaDeLaRuta) =>
    poner({ corrida: r.corrida ?? null, sinSaber: false, ...(r.terminada !== undefined ? { terminada: r.terminada } : {}) });
  const sigueCorriendo = (c: CorridaDelResumen | null) => c?.estado === "RUNNING" && !c.detenida;
  /** El seguimiento de la corrida viva: uno solo, aunque lo pidan la página y la cuenta regresiva a la vez. */
  let siguiendo: Promise<CorridaDelResumen | null> | null = null;
  /** Un pedido de armar en curso: otro que llegue mientras tanto espera el mismo resultado (no manda otro POST). */
  let armando: Promise<ResultadoDeArmar> | null = null;

  /** Consulta hasta que la corrida termina o se detiene. Si la red no deja saberlo, la foto lo dice (`sinSaber`). */
  const seguir = (): Promise<CorridaDelResumen | null> => {
    if (siguiendo) return siguiendo;
    siguiendo = (async () => {
      let fallos = 0;
      for (let i = 0; i < VUELTAS; i++) {
        if (!sigueCorriendo(foto.corrida)) return foto.corrida;
        await red.esperar(CADA_MS);
        try {
          const r = await red.consultar();
          if (ok(r)) {
            fallos = 0;
            ponerLaRespuesta(r);
            continue;
          }
        } catch {
          // La red se cortó un momento (un deploy): se sigue mirando.
        }
        if (++fallos >= FALLOS_SEGUIDOS) break;
      }
      // Ni terminó ni se pudo saber: la foto deja de decir «corriendo» y la pantalla ofrece volver a mirar.
      poner({ sinSaber: true });
      return null;
    })().finally(() => {
      siguiendo = null;
    });
    return siguiendo;
  };

  const armarUnaVez = async (): Promise<ResultadoDeArmar> => {
    // Una que corre de verdad (late, y se sabe en qué va) se sigue; una detenida o de la que no se sabe, no: se pide otra.
    let corrida: CorridaDelResumen | null = sigueCorriendo(foto.corrida) && !foto.sinSaber ? foto.corrida : null;
    let ajena = !!corrida;
    if (!corrida) {
      poner({ lanzando: true });
      try {
        const r = await red.arrancar();
        // 409 con la corrida: ya había una (otra pestaña, la cuenta regresiva de una nota): se sigue esa.
        if (r.corrida && (r.status === 202 || r.status === 200 || r.status === 409)) {
          corrida = r.corrida;
          ajena = r.status === 409;
        } else return { ok: false, error: r.error ?? "No se pudo armar el Resumen." };
      } catch {
        return { ok: false, error: "No se pudo pedir el Resumen: revisa tu conexión y vuelve a intentarlo." };
      } finally {
        poner({ lanzando: false });
      }
      poner({ corrida, sinSaber: false });
    }
    const final = await seguir();
    if (final?.estado === "DONE") return { ok: true, corrida: final, ajena };
    if (final?.estado === "RUNNING" && final.detenida) return { ok: false, error: ERROR_DETENIDA, corrida: final };
    return { ok: false, error: final?.error ?? ERROR_SIN_SABER, ...(final ? { corrida: final } : {}) };
  };

  return {
    foto: () => foto,
    suscribir: (o) => {
      oyentes.add(o);
      return () => oyentes.delete(o);
    },
    mirar: async () => {
      try {
        const r = await red.consultar();
        if (ok(r)) ponerLaRespuesta(r);
      } catch {
        return;
      }
      if (sigueCorriendo(foto.corrida)) await seguir();
    },
    armar: () => {
      /* Quien se suma a un pedido en curso (la cuenta regresiva de una nota guardada mientras corre el «Rehacer con IA» de
         esta misma pestaña) recibe la corrida como AJENA: empezó antes de su pedido y no leyó lo nuevo (segunda revisión
         del 24 nov). */
      if (armando) return armando.then((r) => (r.ok ? { ...r, ajena: true } : r));
      armando = armarUnaVez().finally(() => {
        armando = null;
      });
      return armando;
    },
  };
}
