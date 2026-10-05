/**
 * lib/finanzas/tipo-cambio-server.ts — traer, guardar y leer el tipo de cambio de cada día (2026-10-05). Server-only.
 *
 * Lo que es cálculo (leer las respuestas, qué tasa le toca a un día o a un mes) vive en lib/finanzas/tipo-cambio.ts,
 * que se prueba sin red ni base. Acá: pedirle las tasas al BCCR o a Hacienda, guardarlas en `TipoCambioDia`, y armar
 * las tasas de un año para el punto de equilibrio y el cierre del mes.
 *
 * ⚠ Sin `import "server-only"`: lo importa lib/cobranza/queries.ts, que las pruebas cargan (mismo caso que
 * decisiones-server.ts). Es de servidor por lo que importa (Prisma, red), no por la marca.
 *
 * Las fuentes, en orden:
 *  1. El servicio del BCCR (SDDE), si hay `BCCR_TOKEN`: cualquier rango, venta (318) y compra (317).
 *  2. El histórico de Hacienda, sin token. Al 2026-10-05 respondía 503; si vuelve, trae el histórico solo.
 *  3. La tasa de hoy de Hacienda, sin token. Con eso, aunque falte el histórico, desde hoy cada día queda guardado.
 */
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { crDateParts } from "@/lib/jobs/time";
import { confirmadoPorPersona } from "./cierre";
import type { TasaDeMes } from "./equilibrio";
import {
  DIAS_HACIA_ATRAS,
  TIPO_CAMBIO_DESDE,
  corrigeLoGuardado,
  juntarBccr,
  leerHistoricoHacienda,
  leerHoyHacienda,
  leerSeriesBccr,
  sumarDias,
  tasasDeMesDesdeDias,
  tramos,
  type TasaDelDia,
  type TasaMensualDerivada,
} from "./tipo-cambio";

const BCCR_BASE = "https://apim.bccr.fi.cr/SDDE/api/Bccr.GE.SDDE.Publico.Indicadores.API/indicadoresEconomicos";
const HACIENDA_HOY = "https://api.hacienda.go.cr/indicadores/tc/dolar";
const HACIENDA_HISTORICO = "https://api.hacienda.go.cr/indicadores/tc/dolar/historico";
/** Los indicadores del BCCR: tipo de cambio de referencia, compra y venta. */
const BCCR_COMPRA = 317;
const BCCR_VENTA = 318;

class FalloDeFuente extends Error {
  constructor(
    mensaje: string,
    readonly transitorio: boolean,
  ) {
    super(mensaje);
    this.name = "FalloDeFuente";
  }
}

/**
 * Cuánto se espera a una fuente en CADA pedido. Era 30 s: con Hacienda colgada, un intento tardaba hasta un minuto y
 * medio (BCCR, histórico y hoy), y el tick de los jobs es secuencial, así que atrasaba a todos los demás. Una respuesta
 * sana de cualquiera de las dos tarda menos de un par de segundos; diez alcanzan de sobra.
 */
const ESPERA_POR_PEDIDO_MS = 10_000;

async function pedirJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json", ...headers }, signal: AbortSignal.timeout(ESPERA_POR_PEDIDO_MS), cache: "no-store" });
  } catch (e) {
    throw new FalloDeFuente(`no respondió (${e instanceof Error ? e.message : String(e)})`, true);
  }
  if (!res.ok) throw new FalloDeFuente(`respondió ${res.status}`, res.status >= 500 || res.status === 429);
  try {
    return await res.json();
  } catch {
    throw new FalloDeFuente("respondió algo que no es JSON", false);
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fechaBccr = (f: string) => f.replaceAll("-", "/");

/**
 * Del BCCR, de a un año por pedido (venta y compra). Lo traído se va dejando en `out`: si un pedido falla a mitad de
 * camino, lo anterior se guarda igual. ⚠ El token va en el encabezado y nunca se escribe en un log.
 */
async function traerDelBccr(desde: string, hasta: string, token: string, out: TasaDelDia[]): Promise<void> {
  for (const t of tramos(desde, hasta, 366)) {
    const url = (codigo: number) =>
      `${BCCR_BASE}/${codigo}/series?fechaInicio=${fechaBccr(t.desde)}&fechaFin=${fechaBccr(t.hasta)}&idioma=ES`;
    const auth = { Authorization: `Bearer ${token}` };
    const venta = leerSeriesBccr(await pedirJson(url(BCCR_VENTA), auth));
    const compra = leerSeriesBccr(await pedirJson(url(BCCR_COMPRA), auth));
    out.push(...juntarBccr(venta, compra));
  }
}

/**
 * De Hacienda, de a un mes por pedido y sin apurarla (bloquea 10 minutos a quien pase de 10 pedidos por segundo). Como
 * el del BCCR, deja lo traído en `out` aunque un pedido falle.
 */
async function traerHistoricoDeHacienda(desde: string, hasta: string, out: TasaDelDia[]): Promise<void> {
  for (const t of tramos(desde, hasta, 31)) {
    const { tasas } = leerHistoricoHacienda(await pedirJson(`${HACIENDA_HISTORICO}?d=${t.desde}&h=${t.hasta}`));
    out.push(...tasas);
    await esperar(250);
  }
}

async function traerHoyDeHacienda(): Promise<TasaDelDia> {
  return leerHoyHacienda(await pedirJson(HACIENDA_HOY));
}

/** Guarda lo traído: lo nuevo se crea; lo que cambió se corrige, salvo que Hacienda quiera pisar un número del BCCR. */
async function guardar(tasas: readonly TasaDelDia[]): Promise<{ nuevos: number; corregidos: number }> {
  if (tasas.length === 0) return { nuevos: 0, corregidos: 0 };
  const porFecha = new Map(tasas.map((t) => [t.fecha, t]));
  const existentes = await prisma.tipoCambioDia.findMany({
    where: { fecha: { in: [...porFecha.keys()] } },
    select: { fecha: true, venta: true, compra: true, fuente: true },
  });
  const ya = new Map(existentes.map((e) => [e.fecha, e]));
  const ahora = new Date();
  const nuevas = [...porFecha.values()].filter((t) => !ya.has(t.fecha));
  if (nuevas.length > 0) {
    await prisma.tipoCambioDia.createMany({
      data: nuevas.map((t) => ({ fecha: t.fecha, venta: t.venta, compra: t.compra, fuente: t.fuente, traidoEn: ahora })),
      skipDuplicates: true,
    });
  }
  let corregidos = 0;
  for (const e of existentes) {
    const t = porFecha.get(e.fecha)!;
    if (!corrigeLoGuardado({ venta: Number(e.venta), compra: e.compra === null ? null : Number(e.compra), fuente: e.fuente }, t)) continue;
    await prisma.tipoCambioDia.update({
      where: { fecha: e.fecha },
      data: { venta: t.venta, compra: t.compra ?? e.compra, fuente: t.fuente, traidoEn: ahora },
    });
    corregidos++;
  }
  return { nuevos: nuevas.length, corregidos };
}

export interface ResultadoTipoDeCambio {
  /** Quedó guardada al menos la tasa de hoy. */
  ok: boolean;
  /** De dónde salió lo que se guardó. */
  fuente: "BCCR" | "HACIENDA" | null;
  nuevos: number;
  corregidos: number;
  desde: string;
  hasta: string;
  /** Todavía no hay histórico desde `TIPO_CAMBIO_DESDE`: hace falta el token del BCCR o que Hacienda vuelva. */
  faltaHistorico: boolean;
  /** Lo que falló, en palabras, sin secretos. Vacío si todo salió. */
  avisos: string[];
  /** Algún fallo fue de red o del servidor de la fuente: reintentar más tarde puede arreglarlo. */
  transitorio: boolean;
}

/** La sincronización que está corriendo en este proceso, si hay una (el candado de `sincronizarTipoDeCambio`). */
let enCurso: Promise<ResultadoTipoDeCambio> | null = null;

/**
 * Trae lo que falta y lo guarda. Sin histórico (o con huecos al principio), pide desde `TIPO_CAMBIO_DESDE`; si ya lo
 * tiene, desde tres días antes de la última tasa (por si el BCCR corrigió algo). Nunca lanza por una fuente caída: lo
 * dice en `avisos` y prueba la siguiente.
 *
 * ⚠ CANDADO: una sola a la vez en el proceso. Sin histórico, una corrida son hasta 45 pedidos a Hacienda (uno por mes
 * desde 2023), y Hacienda bloquea diez minutos a quien pase de diez por segundo: cada clic en «Actualizar» (o el clic
 * de otra persona, o el job de las 6) arrancaba otra tanda en paralelo. Ahora quien llega mientras corre una espera esa
 * misma y se lleva su resultado. Con un rango explícito (solo el script, que corre en su propio proceso) no hay candado.
 */
export function sincronizarTipoDeCambio(opciones: { desde?: string; hasta?: string } = {}): Promise<ResultadoTipoDeCambio> {
  if (opciones.desde !== undefined || opciones.hasta !== undefined) return sincronizar(opciones);
  enCurso ??= sincronizar({}).finally(() => {
    enCurso = null;
  });
  return enCurso;
}

async function sincronizar(opciones: { desde?: string; hasta?: string }): Promise<ResultadoTipoDeCambio> {
  const hoy = crDateParts(new Date()).dateKey;
  const hasta = opciones.hasta ?? hoy;
  const [primera, ultima] = await Promise.all([
    prisma.tipoCambioDia.findFirst({ orderBy: { fecha: "asc" }, select: { fecha: true } }),
    prisma.tipoCambioDia.findFirst({ orderBy: { fecha: "desc" }, select: { fecha: true } }),
  ]);
  const sinHistorico = !primera || primera.fecha > sumarDias(TIPO_CAMBIO_DESDE, DIAS_HACIA_ATRAS);
  const desde = opciones.desde ?? (sinHistorico || !ultima ? TIPO_CAMBIO_DESDE : sumarDias(ultima.fecha, -3));

  const avisos: string[] = [];
  let transitorio = false;
  const anotar = (quien: string, e: unknown) => {
    avisos.push(`${quien}: ${e instanceof Error ? e.message : String(e)}`);
    if (e instanceof FalloDeFuente && e.transitorio) transitorio = true;
  };

  const traidas: TasaDelDia[] = [];
  let fuente: ResultadoTipoDeCambio["fuente"] = null;
  const token = process.env.BCCR_TOKEN?.trim();
  if (token) {
    try {
      await traerDelBccr(desde, hasta, token, traidas);
    } catch (e) {
      anotar("El servicio del BCCR", e);
    }
    if (traidas.length > 0) fuente = "BCCR";
  }
  if (traidas.length === 0) {
    try {
      await traerHistoricoDeHacienda(desde, hasta, traidas);
    } catch (e) {
      anotar("El histórico de Hacienda", e);
    }
    if (traidas.length > 0) fuente = "HACIENDA";
  }
  if (!traidas.some((t) => t.fecha === hoy)) {
    try {
      const deHoy = await traerHoyDeHacienda();
      if (deHoy.fecha <= hasta) {
        traidas.push(deHoy);
        fuente ??= "HACIENDA";
      }
    } catch (e) {
      anotar("La tasa de hoy de Hacienda", e);
    }
  }

  const { nuevos, corregidos } = await guardar(traidas);
  const primeraAhora = await prisma.tipoCambioDia.findFirst({ orderBy: { fecha: "asc" }, select: { fecha: true } });
  const hayHoy = (await prisma.tipoCambioDia.count({ where: { fecha: { gte: sumarDias(hoy, -DIAS_HACIA_ATRAS), lte: hoy } } })) > 0;
  return {
    ok: hayHoy,
    fuente,
    nuevos,
    corregidos,
    desde,
    hasta,
    faltaHistorico: !primeraAhora || primeraAhora.fecha > sumarDias(TIPO_CAMBIO_DESDE, DIAS_HACIA_ATRAS),
    avisos,
    transitorio,
  };
}

// ── Leer ────────────────────────────────────────────────────────────────────────

export interface TasaDelMesParaReporte {
  periodo: string;
  crcPorUsd: number;
  fuente: string;
  /** La del BCCR, si el mes tiene días traídos (o es un mes por venir y hay alguna). */
  bccr: TasaMensualDerivada | null;
  /** La cargada a mano o por script en `TipoCambioMes`: el respaldo de los meses sin días. */
  manual: { crcPorUsd: number; fuente: string; registradoPor: string; registradoEn: Date } | null;
}

export interface TasasDelAnio {
  /** Una por mes, la que se usa: la del BCCR si hay, si no la manual. Un mes sin ninguna no está. */
  tasas: TasaDeMes[];
  /** Fecha → venta del BCCR, del año (y una semana antes, para el 1 de enero). */
  tasasDiarias: Map<string, number>;
  porMes: Map<string, TasaDelMesParaReporte>;
}

/**
 * Las tasas de un año para el punto de equilibrio y el cierre. ⚠ Si `TipoCambioDia` no existe todavía (el SQL de
 * 2026-10-05 sin aplicar), no tumba nada: avisa en el log y sigue con las de `TipoCambioMes`, como antes.
 *
 * ⛔ SOLO eso se traga (tabla o columna que no existe, P2021/P2022 — `esquemaDesactualizado`). Hasta el 2026-10-05 el
 * `catch` se tragaba cualquier error: una base caída a mitad del reporte (P1001) convertía todos los colones con la tasa
 * cargada a mano, sin un solo aviso en pantalla. Cualquier otro error se relanza.
 */
export async function cargarTasasDelAnio(anio: number, hoyISO: string): Promise<TasasDelAnio> {
  const periodos = Array.from({ length: 12 }, (_, i) => `${anio}-${String(i + 1).padStart(2, "0")}`);
  const [dias, filasMes] = await Promise.all([
    prisma.tipoCambioDia
      .findMany({
        where: { fecha: { gte: sumarDias(`${anio}-01-01`, -DIAS_HACIA_ATRAS), lte: `${anio}-12-31` } },
        select: { fecha: true, venta: true },
        orderBy: { fecha: "asc" },
      })
      .catch((e: unknown) => {
        if (!esquemaDesactualizado(e)) throw e;
        console.warn("[tipo-de-cambio] no se pudo leer el tipo de cambio diario (¿falta el SQL de 2026-10-05?): se usa el de cada mes");
        return [];
      }),
    prisma.tipoCambioMes.findMany({
      where: { periodo: { in: periodos } },
      select: { periodo: true, crcPorUsd: true, fuente: true, registradoPor: true, registradoEn: true },
      orderBy: { periodo: "asc" },
    }),
  ]);
  const diarias = dias.map((d) => ({ fecha: d.fecha, venta: Number(d.venta) }));
  const derivadas = tasasDeMesDesdeDias(diarias, periodos, hoyISO);
  const manualDe = new Map(filasMes.map((f) => [f.periodo, f]));

  const porMes = new Map<string, TasaDelMesParaReporte>();
  for (const p of periodos) {
    const bccr = derivadas.get(p) ?? null;
    const m = manualDe.get(p);
    const manual = m ? { crcPorUsd: Number(m.crcPorUsd), fuente: m.fuente, registradoPor: m.registradoPor, registradoEn: m.registradoEn } : null;
    const usada = bccr ?? manual;
    if (!usada) continue;
    porMes.set(p, { periodo: p, crcPorUsd: usada.crcPorUsd, fuente: usada.fuente, bccr, manual });
  }
  return {
    tasas: [...porMes.values()].map((t) => ({ periodo: t.periodo, crcPorUsd: t.crcPorUsd, fuente: t.fuente })),
    tasasDiarias: new Map(diarias.map((d) => [d.fecha, d.venta])),
    porMes,
  };
}

/**
 * ¿El tipo de cambio de este mes ya es firme? El del BCCR con todos los días, o (sin días del BCCR) uno firmado por una
 * persona. «Firmado por una persona» es UNA regla, la del cierre (`confirmadoPorPersona`): copiada acá, las dos podían
 * dejar de decir lo mismo y el cierre pedir confirmar un mes que el reporte ya daba por firme.
 */
export function tasaFirme(t: TasaDelMesParaReporte | undefined): boolean {
  if (!t) return false;
  if (t.bccr) return t.bccr.completo && !t.bccr.porVenir;
  return !!t.manual && confirmadoPorPersona(t.manual.registradoPor) !== null;
}

/** Todo el histórico guardado, del más viejo al más nuevo: para la página del tipo de cambio. */
export async function leerHistorico(): Promise<{ dias: TasaDelDia[]; traidoEn: string | null } | null> {
  try {
    const filas = await prisma.tipoCambioDia.findMany({ orderBy: { fecha: "asc" } });
    const ultima = filas.reduce<Date | null>((m, f) => (!m || f.traidoEn > m ? f.traidoEn : m), null);
    return {
      dias: filas.map((f) => ({
        fecha: f.fecha,
        venta: Number(f.venta),
        compra: f.compra === null ? null : Number(f.compra),
        fuente: f.fuente === "BCCR" ? "BCCR" : "HACIENDA",
      })),
      traidoEn: ultima ? ultima.toISOString() : null,
    };
  } catch (e) {
    // Solo la tabla que todavía no existe (la página lo dice); cualquier otro error es un error (ver `cargarTasasDelAnio`).
    if (!esquemaDesactualizado(e)) throw e;
    console.warn("[tipo-de-cambio] no se pudo leer el histórico (¿falta el SQL de 2026-10-05?)");
    return null;
  }
}
