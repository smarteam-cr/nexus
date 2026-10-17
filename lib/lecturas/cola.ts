/**
 * lib/lecturas/cola.ts — la COLA de la lectura de seguimiento de cada reunión (memoria de la cuenta, etapa 2). SERVIDOR.
 *
 * Pieza 1 del circuito (DECISIONS «La memoria de la cuenta…»): una sola entrada. La cola es la MISMA fila
 * `LecturaDeReunion` que usa Tareas (`sessionId` es único: una fila, una pasada, dos salidas), con el estado del
 * seguimiento en sus columnas `seguimiento*`. Este archivo es el segundo escritor de la tabla (declarado en
 * lib/tareas/guardas.test.ts) y SOLO escribe esas columnas: una fila nueva la crea lib/tareas/lectura.ts
 * (`crearFilaDelSeguimiento`), y la salida de Tareas —`estado`, `resumen`, las propuestas— la siguen escribiendo
 * lib/tareas/lectura.ts y mutaciones.ts. Un escaneo de la guarda lo vigila.
 *
 * Una reunión de puertas adentro (todos los que estuvieron son de la casa) no entra a la cola aunque su dueño sea un
 * cliente: lo dicho sin el cliente no se le atribuye (la lee Tareas). Una reunión que ya se leyó tampoco vuelve a
 * entrar si le cambian el dueño: lo que dejó para el dueño anterior se corrige a mano (INV42 e INV46 lo muestran).
 *
 *   · `encolarSeguimiento` — la deja en la cola (un upsert barato, nunca lanza). La llaman el enriquecimiento de Meet
 *     (en vez de disparar el post-proceso y olvidarse) y el cambio de dueño de una reunión.
 *   · `reclamar` — el job toma de a una, con un update condicional: dos ticks no leen la misma. Antes rescata las
 *     colgadas (más de 15 minutos leyendo).
 *   · `tomarParaLeer` — el botón «Generar minuta» de una reunión (la ruta del post-proceso): la toma ya, o dice que
 *     se está leyendo.
 *   · `terminar` — deja el resultado: lista, sin texto, copia, omitida, o un error que se reintenta a los 5 y a los 30
 *     minutos y a la tercera queda en `error`.
 *
 * Mientras falte el SQL (scripts/sql/2026-10-10-lectura-de-seguimiento.sql), `seguimientoDisponible()` da false: el
 * job no toma nada y el enriquecimiento vuelve al post-proceso viejo. Nada revienta.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getReunionesParaTareas, type ReunionParaTareas } from "@/lib/sessions/reuniones-para-tareas";
import { MIN_RECUERDO } from "@/lib/sessions/reunion-a-mano";
import { esDePuertasAdentro } from "@/lib/sessions/reuniones-para-seguimiento";
import { crearFilaDelSeguimiento, soltarLaFilaDelSeguimiento } from "@/lib/tareas/lectura";
import { hechosPrendidos } from "@/lib/seguimiento/hechos/reglas";
import { ESTADOS_QUE_SE_ENCOLAN, MAX_INTENTOS, MINUTOS_COLGADA, esperaDelIntento, motivoParaNoEncolar, rutaDeLaLectura, type EstadoDeSeguimiento } from "./reglas";

/* ── ¿Está el SQL? ─────────────────────────────────────────────────────────────────── */

export const COLUMNAS_DEL_SEGUIMIENTO = ["seguimientoEstado", "seguimientoDesde", "seguimientoIntentos", "seguimientoLeidaAt", "seguimientoError"] as const;

/** Sin las columnas, se vuelve a mirar como mucho cada 30 s: correr el SQL lo pone en verde solo, sin reiniciar. */
const REMIRAR_MS = 30_000;
let mirado: { ok: boolean; en: number } | null = null;
let mirando: Promise<boolean> | null = null;

/**
 * ¿El cliente de Prisma conoce las columnas Y la base las tiene? En verde no se vuelve a preguntar en toda la vida del
 * proceso (el esquema solo crece), y nunca hay dos consultas en vuelo. Si la consulta falla, false sin guardarlo: sin
 * poder mirar, no se escribe en la cola (el molde es `tareasDisponible`, lib/tareas/servidor.ts).
 */
export async function seguimientoDisponible(): Promise<boolean> {
  const campos = (Prisma as unknown as Record<string, Record<string, string> | undefined>).LecturaDeReunionScalarFieldEnum ?? {};
  if (!COLUMNAS_DEL_SEGUIMIENTO.every((c) => c in campos)) return false;
  if (mirado?.ok) return true;
  if (mirado && performance.now() - mirado.en < REMIRAR_MS) return false;
  mirando ??= (async () => {
    try {
      const filas = await prisma.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'LecturaDeReunion' AND column_name = ANY(${[...COLUMNAS_DEL_SEGUIMIENTO]}::text[])`;
      const ok = Number(filas[0]?.n ?? 0) === COLUMNAS_DEL_SEGUIMIENTO.length;
      mirado = { ok, en: performance.now() };
      return ok;
    } catch {
      return false;
    } finally {
      mirando = null;
    }
  })();
  return mirando;
}

/** Para los tests: olvida lo mirado. */
export function olvidarSeguimientoMirado(): void {
  mirado = null;
  mirando = null;
}

/* ── La reunión, por el chokepoint ─────────────────────────────────────────────────── */

/** Quien lee para la cola: el sistema (ve todas). Solo pide la reunión por id; el dueño lo decide `resolvedClientId`. */
const SISTEMA = { email: "sistema", esSuperAdmin: true, clientes: { todos: true, ids: new Set<string>(), porId: new Map<string, { kind: string; nombre: string }>() } };

/**
 * La reunión (ya ocurrida), el tipo de la empresa dueña y si es de puertas adentro (todos los que estuvieron son de la
 * casa, con la misma regla de la tarjeta). null si no existe o todavía no ocurrió.
 */
async function reunionYEmpresa(sessionId: string): Promise<{ reunion: ReunionParaTareas; kind: string | null; puertasAdentro: boolean } | null> {
  const [reunion] = await getReunionesParaTareas({ quien: SISTEMA, ids: [sessionId] });
  if (!reunion) return null;
  const empresa = reunion.duenoClienteId ? await prisma.client.findUnique({ where: { id: reunion.duenoClienteId }, select: { kind: true } }) : null;
  const puertasAdentro = await esDePuertasAdentro({ participants: reunion.participantes, organizerEmail: reunion.organizador });
  return { reunion, kind: empresa?.kind ?? null, puertasAdentro };
}

const esP2002 = (e: unknown) => (e as { code?: string } | null)?.code === "P2002";

/* ── Encolar ───────────────────────────────────────────────────────────────────────── */

export type ResultadoDeEncolar = { encolada: boolean; lecturaId?: string; motivo?: string };

/**
 * Deja la lectura de seguimiento de esta reunión en la cola, si corresponde (`debeEncolar`: de un cliente o un
 * prospecto, no de puertas adentro, ya ocurrida, de 14 días o menos y con transcripción; con `SEGUIMIENTO_HECHOS`
 * prendida, también con solo notas de Gemini). Si la fila no existe la crea
 * lib/tareas/lectura.ts (`crearFilaDelSeguimiento`). Si existe, la pasa a `en_espera` solo desde null, sin texto, error
 * u omitida: nunca una lista, una copia ni una que se está leyendo. `sinCorteDeFrescura`: una persona pidió esa reunión
 * puntual (scripts/encolar-lecturas-pendientes.ts). NUNCA lanza.
 */
export async function encolarSeguimiento(
  sessionId: string,
  ahora = new Date(),
  profundidad = 0,
  opciones: { sinCorteDeFrescura?: boolean; porTextoNuevo?: boolean } = {},
): Promise<ResultadoDeEncolar> {
  try {
    if (!(await seguimientoDisponible())) return { encolada: false, motivo: "sin_sql" };
    const leida = await reunionYEmpresa(sessionId);
    if (!leida) return { encolada: false, motivo: "no_ocurrio" };
    const motivo = motivoParaNoEncolar(
      {
        kind: leida.kind,
        puertasAdentro: leida.puertasAdentro,
        fecha: leida.reunion.inicio,
        largoTranscript: leida.reunion.largoTranscript,
        largoNotas: leida.reunion.notas?.trim().length ?? 0,
        ahora,
      },
      // Con la lectura de hechos prendida, una reunión con solo notas también entra (memoria de la cuenta, etapa 6). Lo
      // que alguien recuerda de una reunión agregada a mano entra siempre, con su propio piso: se lee entero.
      leida.reunion.aMano === "recuerdo"
        ? { sinCorteDeFrescura: opciones.sinCorteDeFrescura, leerSoloNotas: true, minNotas: MIN_RECUERDO }
        : { sinCorteDeFrescura: opciones.sinCorteDeFrescura, leerSoloNotas: hechosPrendidos(process.env) },
    );
    if (motivo) return { encolada: false, motivo };
    return await ponerEnLaCola(leida.reunion, ahora, profundidad, opciones.porTextoNuevo ? ESTADOS_POR_TEXTO_NUEVO : ESTADOS_QUE_SE_ENCOLAN);
  } catch (e) {
    console.error(`[lecturas] no se pudo encolar la reunión ${sessionId}:`, e instanceof Error ? e.message : e);
    return { encolada: false, motivo: "error" };
  }
}

/**
 * Cuando el texto de una reunión ya leída CAMBIÓ (llegó el documento correcto después de uno ajeno) y lo que dejó la
 * lectura anterior ya se limpió (lib/sessions/reanalizar.ts), la fila vuelve a la cola aunque esté `lista`. Nunca una
 * copia ni una que se está leyendo.
 */
const ESTADOS_POR_TEXTO_NUEVO: readonly EstadoDeSeguimiento[] = [...ESTADOS_QUE_SE_ENCOLAN, "lista"];

/**
 * Vuelve a encolar una reunión cuyo texto cambió, también si su lectura estaba `lista`. Solo la llama
 * lib/sessions/reanalizar.ts DESPUÉS de borrar la minuta en borrador (si no, la lectura respondería «ya tiene minuta»).
 * Mismas reglas que `encolarSeguimiento` (de un cliente o un prospecto, fresca, con texto). NUNCA lanza.
 */
export async function reencolarPorTextoNuevo(sessionId: string, ahora = new Date()): Promise<ResultadoDeEncolar> {
  return encolarSeguimiento(sessionId, ahora, 0, { porTextoNuevo: true });
}

/**
 * El texto guardado de la reunión era de OTRA reunión y se vació (scripts/limpiar-analisis-de-otra-reunion.ts): su
 * lectura `lista` pasa a `sin_texto`, así cuando el enriquecimiento traiga el texto correcto la cola la vuelve a tomar.
 * Solo las columnas `seguimiento*`. Devuelve si cambió.
 */
export async function marcarParaReleer(sessionId: string, ahora = new Date()): Promise<boolean> {
  if (!(await seguimientoDisponible())) return false;
  const r = await prisma.lecturaDeReunion.updateMany({
    where: { sessionId, seguimientoEstado: "lista" },
    data: {
      seguimientoEstado: "sin_texto",
      seguimientoDesde: null,
      seguimientoLeidaAt: ahora,
      seguimientoError: "El texto guardado era de otra reunión; se vuelve a leer cuando llegue el suyo.",
    },
  });
  return r.count > 0;
}

async function ponerEnLaCola(
  reunion: ReunionParaTareas,
  ahora: Date,
  profundidad: number,
  desde: readonly EstadoDeSeguimiento[] = ESTADOS_QUE_SE_ENCOLAN,
): Promise<ResultadoDeEncolar> {
  const ya = await prisma.lecturaDeReunion.findUnique({ where: { sessionId: reunion.id }, select: { id: true, estado: true, copiaDeId: true, seguimientoEstado: true } });
  if (ya) return reencolar(ya, ahora, profundidad, desde);

  // La misma reunión en dos filas (dos series del calendario): se lee una vez, la otra queda como copia.
  const gemela = reunion.huellaTexto
    ? await prisma.lecturaDeReunion.findFirst({ where: { huellaTexto: reunion.huellaTexto, estado: { not: "copia" } }, select: { id: true, sessionId: true } })
    : null;
  try {
    const l = await crearFilaDelSeguimiento(reunion, { gemelaId: gemela?.id ?? null, seguimiento: "en_espera", ahora });
    // La gemela es la que se lee: si el seguimiento no la tiene, se encola esa (un nivel, nunca en cadena).
    if (gemela?.sessionId && profundidad === 0) await encolarSeguimiento(gemela.sessionId, ahora, 1);
    return gemela ? { encolada: false, lecturaId: l.id, motivo: "copia" } : { encolada: true, lecturaId: l.id };
  } catch (e) {
    if (!esP2002(e)) throw e;
    // Otro la creó entre la lectura y la escritura: se trata como existente.
    const otra = await prisma.lecturaDeReunion.findUnique({ where: { sessionId: reunion.id }, select: { id: true, estado: true, copiaDeId: true, seguimientoEstado: true } });
    if (!otra) throw e;
    return reencolar(otra, ahora, profundidad, desde);
  }
}

async function reencolar(
  ya: { id: string; estado: string; copiaDeId: string | null; seguimientoEstado: string | null },
  ahora: Date,
  profundidad: number,
  desde: readonly EstadoDeSeguimiento[] = ESTADOS_QUE_SE_ENCOLAN,
): Promise<ResultadoDeEncolar> {
  // Una copia de Tareas es copia también para el seguimiento: se lee la original.
  if (ya.estado === "copia" && ya.copiaDeId) {
    await prisma.lecturaDeReunion.updateMany({
      where: { id: ya.id, OR: [{ seguimientoEstado: null }, { seguimientoEstado: { in: [...ESTADOS_QUE_SE_ENCOLAN] } }] },
      data: { seguimientoEstado: "copia", seguimientoDesde: null, seguimientoLeidaAt: ahora, seguimientoError: null },
    });
    const original = await prisma.lecturaDeReunion.findUnique({ where: { id: ya.copiaDeId }, select: { sessionId: true } });
    if (original?.sessionId && profundidad === 0) await encolarSeguimiento(original.sessionId, ahora, 1);
    return { encolada: false, lecturaId: ya.id, motivo: "copia" };
  }
  const r = await prisma.lecturaDeReunion.updateMany({
    where: { id: ya.id, OR: [{ seguimientoEstado: null }, { seguimientoEstado: { in: [...desde] } }] },
    data: { seguimientoEstado: "en_espera", seguimientoDesde: ahora, seguimientoIntentos: 0, seguimientoError: null },
  });
  return r.count > 0 ? { encolada: true, lecturaId: ya.id } : { encolada: false, lecturaId: ya.id, motivo: `ya_${ya.seguimientoEstado ?? "en_cola"}` };
}

/* ── Tomar ─────────────────────────────────────────────────────────────────────────── */

export interface LecturaTomada {
  id: string;
  sessionId: string;
  intentos: number;
}

const colgadaDesde = (ahora: Date) => new Date(+ahora - MINUTOS_COLGADA * 60_000);
const LEYENDO_COLGADA = (ahora: Date): Prisma.LecturaDeReunionWhereInput => ({
  seguimientoEstado: "leyendo",
  OR: [{ seguimientoDesde: null }, { seguimientoDesde: { lt: colgadaDesde(ahora) } }],
});

export interface LoQueSeReclamo {
  tomadas: LecturaTomada[];
  /**
   * Las colgadas que iban por su último intento y quedaron en `error` en este tick. El job las cuenta como errores
   * finales (semáforo rojo + Sentry): sin esto, una reunión que se colgó tres veces no daba ninguna señal.
   */
  enError: { sessionId: string; error: string }[];
}

/**
 * Toma hasta `n` lecturas de la cola. Primero las colgadas (más de 15 minutos leyendo: un reinicio, un deploy) vuelven
 * a la cola con un intento más, o quedan en `error` si ya iban por el último. Después toma de a una con un update
 * condicional (`en_espera` y con su espera vencida → `leyendo`): dos ticks, o el job y el botón, no leen la misma.
 */
export async function reclamar(n: number, ahora = new Date()): Promise<LoQueSeReclamo> {
  const enError: LoQueSeReclamo["enError"] = [];
  const colgadas = await prisma.lecturaDeReunion.findMany({ where: LEYENDO_COLGADA(ahora), select: { id: true, sessionId: true, seguimientoIntentos: true }, take: 50 });
  for (const c of colgadas) {
    const intentos = c.seguimientoIntentos + 1;
    if (intentos >= MAX_INTENTOS) {
      const error = `Se colgó ${MAX_INTENTOS} veces leyéndola.`;
      const r = await prisma.lecturaDeReunion.updateMany({
        where: { id: c.id, ...LEYENDO_COLGADA(ahora) },
        data: { seguimientoEstado: "error", seguimientoDesde: null, seguimientoIntentos: intentos, seguimientoLeidaAt: ahora, seguimientoError: error },
      });
      if (r.count) {
        await soltarLaFilaDelSeguimiento(c.id, "error", ahora);
        enError.push({ sessionId: c.sessionId ?? c.id, error });
      }
    } else {
      await prisma.lecturaDeReunion.updateMany({
        where: { id: c.id, ...LEYENDO_COLGADA(ahora) },
        data: { seguimientoEstado: "en_espera", seguimientoDesde: ahora, seguimientoIntentos: intentos, seguimientoError: "Se colgó leyéndola (un reinicio o un deploy)." },
      });
    }
  }

  const vencida: Prisma.LecturaDeReunionWhereInput = { seguimientoEstado: "en_espera", OR: [{ seguimientoDesde: null }, { seguimientoDesde: { lte: ahora } }] };
  const candidatas = await prisma.lecturaDeReunion.findMany({
    where: { ...vencida, sessionId: { not: null } },
    select: { id: true, sessionId: true, seguimientoIntentos: true },
    orderBy: { seguimientoDesde: "asc" },
    take: Math.max(n * 4, n),
  });
  const tomadas: LecturaTomada[] = [];
  for (const c of candidatas) {
    if (tomadas.length >= n) break;
    const r = await prisma.lecturaDeReunion.updateMany({ where: { id: c.id, ...vencida }, data: { seguimientoEstado: "leyendo", seguimientoDesde: ahora } });
    if (r.count === 1 && c.sessionId) tomadas.push({ id: c.id, sessionId: c.sessionId, intentos: c.seguimientoIntentos });
  }
  return { tomadas, enError };
}

export type ResultadoDeTomar =
  /** `sessionId`: la reunión que hay que leer (la original, si la pedida es la copia de otra). */
  | { tomada: true; lecturaId: string; sessionId: string }
  | { tomada: false; motivo: "ocupada" | "no_ocurrio" | "no_es_cliente" | "puertas_adentro" };

/**
 * Para leer YA una reunión (el botón «Generar minuta» o «Leer esta reunión», y «Leer una reunión» de Tareas cuando la
 * fila espera al seguimiento): la crea en la cola si no estaba y la toma, salvo que alguien la esté leyendo desde hace
 * menos de 15 minutos. Sin el corte de 14 días: lo pidió una persona. Una reunión que no es de un cliente ni de un
 * prospecto, o que es de puertas adentro, no entra a la cola. Una fila que es COPIA de otra (la misma reunión en dos
 * series del calendario) no se lee dos veces: se toma la original, un nivel.
 */
export async function tomarParaLeer(sessionId: string, ahora = new Date(), profundidad = 0): Promise<ResultadoDeTomar> {
  const leida = await reunionYEmpresa(sessionId);
  if (!leida) return { tomada: false, motivo: "no_ocurrio" };
  if (!rutaDeLaLectura(leida.kind) || leida.puertasAdentro) {
    // Si esperaba en la cola desde antes (le cambiaron el dueño, o se encoló antes de mirar la sala), no queda esperando
    // para siempre: omitida, y la fila se suelta para Tareas.
    await soltarSiNoCorresponde(sessionId, ahora);
    return { tomada: false, motivo: leida.puertasAdentro && rutaDeLaLectura(leida.kind) ? "puertas_adentro" : "no_es_cliente" };
  }
  let fila = await prisma.lecturaDeReunion.findUnique({ where: { sessionId }, select: { id: true, estado: true, copiaDeId: true, seguimientoEstado: true } });
  if (fila && (fila.estado === "copia" || fila.seguimientoEstado === "copia") && fila.copiaDeId && profundidad === 0) {
    const original = await prisma.lecturaDeReunion.findUnique({ where: { id: fila.copiaDeId }, select: { sessionId: true } });
    if (original?.sessionId) return tomarParaLeer(original.sessionId, ahora, 1);
  }
  if (!fila) {
    try {
      const creada = await crearFilaDelSeguimiento(leida.reunion, { gemelaId: null, seguimiento: "leyendo", ahora });
      return { tomada: true, lecturaId: creada.id, sessionId };
    } catch (e) {
      if (!esP2002(e)) throw e;
      fila = await prisma.lecturaDeReunion.findUnique({ where: { sessionId }, select: { id: true, estado: true, copiaDeId: true, seguimientoEstado: true } });
      if (!fila) throw e;
    }
  }
  const r = await prisma.lecturaDeReunion.updateMany({
    where: { id: fila.id, OR: [{ seguimientoEstado: null }, { seguimientoEstado: { not: "leyendo" } }, LEYENDO_COLGADA(ahora)] },
    data: { seguimientoEstado: "leyendo", seguimientoDesde: ahora, seguimientoError: null },
  });
  return r.count === 1 ? { tomada: true, lecturaId: fila.id, sessionId } : { tomada: false, motivo: "ocupada" };
}

/** Una fila que esperaba en la cola y ya no corresponde: queda `omitida` y se suelta para Tareas (si nadie la leyó). */
async function soltarSiNoCorresponde(sessionId: string, ahora: Date): Promise<void> {
  const fila = await prisma.lecturaDeReunion.findUnique({ where: { sessionId }, select: { id: true } });
  if (!fila) return;
  const r = await prisma.lecturaDeReunion.updateMany({
    where: { id: fila.id, seguimientoEstado: "en_espera" },
    data: { seguimientoEstado: "omitida", seguimientoDesde: null, seguimientoLeidaAt: ahora, seguimientoError: null },
  });
  if (r.count) await soltarLaFilaDelSeguimiento(fila.id, "sin_texto", ahora);
}

/* ── Terminar ──────────────────────────────────────────────────────────────────────── */

export type FinDeLaLectura = { estado: "lista" | "sin_texto" | "copia" | "omitida" } | { estado: "error"; error: string };

/**
 * Deja el resultado de una lectura que estaba `leyendo` (si una colgada ya volvió a la cola, no la pisa). Un error se
 * reintenta: vuelve a `en_espera` con su espera (5 y 30 minutos) y a la tercera queda en `error`. Cuando termina sin la
 * salida de Tareas (sin texto, omitida, error), la fila se suelta para Tareas si nadie la había leído para tareas.
 */
export async function terminar(lecturaId: string, fin: FinDeLaLectura, ahora = new Date()): Promise<{ estado: EstadoDeSeguimiento; final: boolean }> {
  const leyendo: Prisma.LecturaDeReunionWhereInput = { id: lecturaId, seguimientoEstado: "leyendo" };
  if (fin.estado === "error") {
    const fila = await prisma.lecturaDeReunion.findUnique({ where: { id: lecturaId }, select: { seguimientoIntentos: true } });
    const intentos = (fila?.seguimientoIntentos ?? 0) + 1;
    const espera = esperaDelIntento(intentos);
    const error = fin.error.slice(0, 2_000);
    if (espera !== null) {
      await prisma.lecturaDeReunion.updateMany({
        where: leyendo,
        data: { seguimientoEstado: "en_espera", seguimientoDesde: new Date(+ahora + espera), seguimientoIntentos: intentos, seguimientoError: error },
      });
      return { estado: "en_espera", final: false };
    }
    await prisma.lecturaDeReunion.updateMany({
      where: leyendo,
      data: { seguimientoEstado: "error", seguimientoDesde: null, seguimientoIntentos: intentos, seguimientoLeidaAt: ahora, seguimientoError: error },
    });
    await soltarLaFilaDelSeguimiento(lecturaId, "error", ahora);
    return { estado: "error", final: true };
  }
  await prisma.lecturaDeReunion.updateMany({
    where: leyendo,
    data: { seguimientoEstado: fin.estado, seguimientoDesde: null, seguimientoLeidaAt: ahora, seguimientoError: null },
  });
  // Si la salida de Tareas ya se escribió (lista con propuestas o sin ellas), esto no hace nada.
  await soltarLaFilaDelSeguimiento(lecturaId, "sin_texto", ahora);
  return { estado: fin.estado, final: true };
}
