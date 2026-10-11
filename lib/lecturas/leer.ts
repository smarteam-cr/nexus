/**
 * lib/lecturas/leer.ts — leer las reuniones de la cola (memoria de la cuenta, etapa 2). SERVIDOR.
 *
 *   · `correrTandaDeSeguimiento` — lo que hace el job `seguimiento-reuniones` en cada tick: si está el SQL y queda
 *     presupuesto automático, toma 2 lecturas, las lee en paralelo con 420 s de tope cada una, después vincula a su
 *     proyecto las reuniones que la lectura no toma y, con `SEGUIMIENTO_HECHOS` prendida, reintenta hasta 2 reuniones
 *     cuyos hechos fallaron o que cambiaron de dueño (lib/seguimiento/hechos-server.ts).
 *   · `leerAhora` — el botón «Generar minuta» o «Leer esta reunión» (la ruta del post-proceso) y «Leer una reunión» de
 *     Tareas cuando la fila espera al seguimiento: toma la reunión y la lee ya, contra el presupuesto de quien la pidió.
 *     Con la bandera apagada o sin el SQL, el post-proceso viejo.
 *   · `procesarLectura` — lo común: lee, deja el resultado en la cola y corre lo que sigue en segundo plano.
 *
 * El tope CORTA la lectura (un AbortSignal llega al clasificador y a cada llamada a Claude, y la lectura no empieza a
 * escribir si se cortó). Hasta el 2026-10-10 solo cortaba la espera: la lectura seguía viva por detrás, la fila volvía a
 * la cola y a los 5 minutos otra pasada leía la misma reunión, o la encontraba con minuta y lo que sigue nunca corría.
 */
import "server-only";
import { conLaReunion } from "@/lib/ai/contexto-de-corrida";
import { quedaPresupuestoAutomatico } from "@/lib/ai/guardia-de-presupuesto";
import { leerReunionDeSeguimiento, type ResultadoDeLaLectura } from "@/lib/sessions/post-process";
import { vincularReunionesSinProyecto, type VinculoDelTick } from "@/lib/sessions/vincular-al-llegar";
import { reintentarHechos } from "@/lib/seguimiento/hechos-server";
import { REINTENTOS_DE_HECHOS_POR_TICK } from "@/lib/seguimiento/hechos/reglas";
import { reclamar, seguimientoDisponible, terminar, tomarParaLeer } from "./cola";
import { LECTURAS_POR_TICK, SEGUNDOS_DE_GRACIA, SEGUNDOS_POR_LECTURA, finDeLaLectura, seguimientoPrendido, type EstadoDeSeguimiento } from "./reglas";

/** Espera la promesa como mucho `ms`: después devuelve null (la promesa sigue; quien llama decide qué hacer con ella). */
async function comoMucho<T>(promesa: Promise<T>, ms: number): Promise<T | null> {
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const tope = new Promise<null>((resolver) => {
    reloj = setTimeout(() => resolver(null), ms);
  });
  try {
    return await Promise.race([promesa, tope]);
  } finally {
    if (reloj) clearTimeout(reloj);
  }
}

/** Corre lo que sigue a una lectura (avance, ficha, etapa, preventa), en segundo plano. Nunca lanza. */
function lanzarLoQueSigue(resultado: ResultadoDeLaLectura, sessionId: string): void {
  if (!resultado.despues) return;
  void resultado.despues().catch((e) => console.error(`[lecturas] lo que sigue a la lectura de ${sessionId} falló:`, e instanceof Error ? e.message : e));
}

export interface LecturaProcesada {
  sessionId: string;
  resultado: ResultadoDeLaLectura;
  estado: EstadoDeSeguimiento;
  /** false = volvió a la cola para otro intento. */
  final: boolean;
}

/**
 * Lee una fila que ya está `leyendo`, deja su resultado y lanza lo que sigue. NUNCA lanza.
 *
 * A los `SEGUNDOS_POR_LECTURA` se CORTA la lectura (AbortSignal) y se espera que termine lo que estaba escribiendo
 * (`SEGUNDOS_DE_GRACIA`). Si ni así termina —algo que no escucha el corte—, la fila queda `leyendo` (no vuelve a la cola:
 * otra pasada la leería en paralelo) y la rescata la regla de colgada a los 15 minutos; cuando la lectura por fin
 * termina, deja su resultado y corre lo que sigue igual.
 */
export async function procesarLectura(lecturaId: string, sessionId: string, opts: { force?: boolean; pedidaPorEmail?: string | null } = {}): Promise<LecturaProcesada> {
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), SEGUNDOS_POR_LECTURA * 1_000);
  const lectura = leerReunionDeSeguimiento(sessionId, { ...opts, lecturaId, signal: corte.signal }).catch(
    (e): ResultadoDeLaLectura => ({ status: "error", sessionId, reason: e instanceof Error ? e.message : String(e) }),
  );
  const aTiempo = await comoMucho(lectura, (SEGUNDOS_POR_LECTURA + SEGUNDOS_DE_GRACIA) * 1_000);
  clearTimeout(reloj);
  if (aTiempo === null) {
    console.error(`[lecturas] la lectura de ${sessionId} no terminó ni ${SEGUNDOS_DE_GRACIA} s después del corte: queda «leyendo» hasta que termine o la rescate la regla de colgada`);
    void lectura
      .then(async (tarde) => {
        const fin = finDeLaLectura(tarde);
        // Solo un resultado bueno: un error tardío no puede devolver a la cola una fila que ya se volvió a tomar.
        if (fin.estado !== "error") await terminar(lecturaId, fin, new Date());
        lanzarLoQueSigue(tarde, sessionId);
      })
      .catch((e) => console.error(`[lecturas] no se pudo dejar el resultado tardío de ${sessionId}:`, e instanceof Error ? e.message : e));
    return {
      sessionId,
      resultado: { status: "error", sessionId, reason: `La lectura no terminó en ${SEGUNDOS_POR_LECTURA + SEGUNDOS_DE_GRACIA} s.` },
      estado: "leyendo",
      final: false,
    };
  }
  const resultado = aTiempo;
  let fin: { estado: EstadoDeSeguimiento; final: boolean };
  try {
    fin = await terminar(lecturaId, finDeLaLectura(resultado), new Date());
  } catch (e) {
    console.error(`[lecturas] no se pudo dejar el resultado de la lectura ${lecturaId}:`, e instanceof Error ? e.message : e);
    fin = { estado: "leyendo", final: false };
  }
  // Lo que sigue (avance, ficha, etapa, preventa), en segundo plano: no traba el scheduler ni la respuesta del botón.
  lanzarLoQueSigue(resultado, sessionId);
  if (resultado.status === "error") console.error(`[lecturas] la lectura de ${sessionId} falló (${fin.final ? "queda en error" : "se reintenta"}): ${resultado.reason}`);
  return { sessionId, resultado, estado: fin.estado, final: fin.final };
}

export type ResultadoDeLeerAhora = ResultadoDeLaLectura | { status: "ocupada"; sessionId: string; reason: string };

/**
 * Lee YA una reunión, pedida por una persona (o por el nombre de siempre, `postProcessSession`). Toma la fila de la
 * cola (409 en la ruta si alguien la está leyendo) y la lee con `pedidaPorEmail`, que cobra contra el presupuesto
 * humano. Con `SEGUIMIENTO_REUNIONES_ENABLED=0` o sin las columnas del SQL, el post-proceso viejo, tal cual.
 */
export async function leerAhora(sessionId: string, opts: { force?: boolean; pedidaPorEmail?: string | null } = {}): Promise<ResultadoDeLeerAhora> {
  if (!seguimientoPrendido(process.env) || !(await seguimientoDisponible())) {
    const { postProcessSessionViejo } = await import("@/lib/sessions/post-process-viejo");
    return conLaReunion(sessionId, () => postProcessSessionViejo(sessionId, { force: opts.force }));
  }
  const t = await tomarParaLeer(sessionId);
  if (!t.tomada) {
    if (t.motivo === "ocupada") return { status: "ocupada", sessionId, reason: "Ya se está leyendo esta reunión. Prueba en unos minutos." };
    if (t.motivo === "no_es_cliente") return { status: "omitida", sessionId, reason: "La reunión no es de un cliente ni de un prospecto (o no tiene dueño): el seguimiento no la lee." };
    if (t.motivo === "puertas_adentro") return { status: "omitida", sessionId, reason: "Es una reunión de puertas adentro (solo estuvo el equipo): la lee Tareas, no el seguimiento." };
    return { status: "error", sessionId, reason: "La reunión no existe o todavía no ocurrió." };
  }
  // `t.sessionId` es la original si la pedida es la copia de otra (la misma reunión en dos series): se lee una vez.
  return (await procesarLectura(t.lecturaId, t.sessionId, opts)).resultado;
}

export interface TandaDeSeguimiento {
  /** No tomó nada (sin el SQL, sin presupuesto o sin nada en la cola): el scheduler no anota la corrida. */
  sinTurno: boolean;
  motivo?: "sin_sql" | "sin_presupuesto" | "nada";
  leidas: LecturaProcesada[];
  /**
   * Las que fallaron (o se colgaron) por tercera vez y quedaron en `error` en este tick: el job lanza con ellas
   * (semáforo rojo + Sentry).
   */
  erroresFinales: { sessionId: string; error: string }[];
  vinculo: VinculoDelTick | null;
  /** Las reuniones cuyos hechos se reintentaron en este tick (memoria de la cuenta, etapa 6). */
  hechosReintentados?: number;
}

export async function correrTandaDeSeguimiento(ahora = new Date()): Promise<TandaDeSeguimiento> {
  const vacia = (motivo: TandaDeSeguimiento["motivo"]): TandaDeSeguimiento => ({ sinTurno: true, motivo, leidas: [], erroresFinales: [], vinculo: null });
  if (!(await seguimientoDisponible())) return vacia("sin_sql");
  // Sin presupuesto automático no se arranca la tanda (aunque la guardia esté solo en aviso): mejor no leer que cortar
  // una lectura a la mitad. Lo que espera, espera en la cola.
  if (!(await quedaPresupuestoAutomatico(ahora))) {
    console.log("[lecturas] sin presupuesto automático hoy: la lectura de reuniones no toma nada");
    return vacia("sin_presupuesto");
  }
  const { tomadas, enError } = await reclamar(LECTURAS_POR_TICK, ahora);
  const leidas = await Promise.all(tomadas.map((t) => procesarLectura(t.id, t.sessionId)));
  const vinculo = await vincularReunionesSinProyecto(10, ahora).catch((e) => {
    console.error("[lecturas] el vínculo de las reuniones sin proyecto falló:", e instanceof Error ? e.message : e);
    return null;
  });
  // Memoria de la cuenta, etapa 6: los hechos que fallaron (o de una reunión que cambió de dueño) se reintentan acá, contra
  // el mismo presupuesto automático. Con `SEGUIMIENTO_HECHOS` apagada o sin su SQL no hace nada.
  const hechos = await reintentarHechos(REINTENTOS_DE_HECHOS_POR_TICK, ahora);
  const erroresFinales = [
    ...enError,
    ...leidas.filter((l) => l.estado === "error" && l.final).map((l) => ({ sessionId: l.sessionId, error: l.resultado.reason ?? "sin detalle" })),
  ];
  const hizoAlgo = leidas.length > 0 || enError.length > 0 || (vinculo?.revisadas ?? 0) > 0 || hechos.reintentadas.length > 0;
  return { sinTurno: !hizoAlgo, motivo: hizoAlgo ? undefined : "nada", leidas, erroresFinales, vinculo, hechosReintentados: hechos.reintentadas.length };
}
