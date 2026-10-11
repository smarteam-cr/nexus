/**
 * lib/sessions/vincular-al-llegar.ts — las reuniones que la lectura de seguimiento NO toma se vinculan a su proyecto
 * (memoria de la cuenta, etapa 2). SERVIDOR.
 *
 * ── EL HUECO ─────────────────────────────────────────────────────────────────────────────────
 * El clasificador sesión→proyecto corre dentro de la lectura de seguimiento, y la lectura solo toma lo que encola. Una
 * reunión que no entra a la cola quedaba con dueño (la sync lo resuelve) pero sin proyecto: no aparecía en el
 * cronograma, ni en los documentos, ni en el contexto del proyecto. Son las de solo notas de Gemini, las de
 * transcripción corta, las de puertas adentro (el seguimiento no las lee) y las que recibieron dueño por la
 * re-resolución masiva. La sync de Meet no es el lugar para arreglarlo: crea eventos futuros, todavía sin contenido.
 *
 * Lo corre el job de la lectura (`seguimiento-reuniones`), después de sus lecturas: las reuniones de 14 días o menos,
 * ya ocurridas y enriquecidas, de un CLIENTE, sin ningún vínculo, con transcripción o con notas. Solo el clasificador
 * (con un proyecto, sin IA), nunca un override. Las que la lectura va a leer o ya leyó (`seguimientoEstado` en la cola,
 * leyéndose o lista) no: las vincula la lectura misma.
 *
 * ⚠ Una que el clasificador no puede vincular (dos proyectos y ninguno claro) no se vuelve a intentar en 24 h: sin
 * esto, el job le pagaría una llamada cada minuto. El recuerdo vive en memoria (un solo contenedor, RUNBOOK inv. #1).
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { conLaReunion } from "@/lib/ai/contexto-de-corrida";
import { duenoDeLaSesion } from "@/lib/sessions/project-sources";
import { classifySessionToProjects } from "@/lib/sessions/classify-session-project";
import { DIAS_DE_FRESCURA } from "@/lib/lecturas/reglas";

const HORA_MS = 3_600_000;
/** Cuánto se espera para volver a intentar una reunión que no se pudo vincular. */
const ESPERA_ENTRE_INTENTOS_MS = 24 * HORA_MS;
/** Cuánto puede tardar el vínculo de un tick: el scheduler corre los jobs en serie. */
const TOPE_DEL_TICK_MS = 60_000;

const intentadas = new Map<string, number>();

/** Para los tests: olvida lo intentado. */
export function olvidarIntentadas(): void {
  intentadas.clear();
}

/** ¿Trae notas de Gemini (el resumen) que el clasificador pueda leer? */
function tieneNotas(summary: unknown): boolean {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return false;
  const o = (summary as { overview?: unknown }).overview;
  return typeof o === "string" && o.trim().length > 0;
}

export interface VinculoDelTick {
  revisadas: number;
  vinculadas: number;
  sinProyecto: number;
}

/** Las reuniones que la lectura de seguimiento va a vincular (en la cola o leyéndose) o ya vinculó (lista). */
const LAS_VINCULA_LA_LECTURA = ["en_espera", "leyendo", "lista"];

async function lasQueVinculaLaLectura(ids: readonly string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  try {
    const filas = await prisma.lecturaDeReunion.findMany({
      where: { sessionId: { in: [...ids] }, seguimientoEstado: { in: LAS_VINCULA_LA_LECTURA } },
      select: { sessionId: true },
    });
    return new Set(filas.map((f) => f.sessionId).filter((x): x is string => !!x));
  } catch (e) {
    // Sin el SQL de la cola (o sin las tablas de Tareas), nadie las encoló: se vinculan acá.
    if (esquemaDesactualizado(e)) return new Set();
    throw e;
  }
}

export async function vincularReunionesSinProyecto(limit = 10, ahora = new Date()): Promise<VinculoDelTick> {
  const empezo = Date.now();
  const resultado: VinculoDelTick = { revisadas: 0, vinculadas: 0, sinProyecto: 0 };
  const base: Prisma.FirefliesSessionWhereInput = {
    date: { gte: new Date(+ahora - DIAS_DE_FRESCURA * 86_400_000), lte: new Date(+ahora - HORA_MS) },
    enrichedAt: { not: null },
    projects: { none: {} },
    OR: [{ resolvedClientId: { not: null } }, { manualClientId: { not: null } }],
  };
  // Dos consultas: las de solo notas (hace falta el resumen) y las que traen transcripción (sin traer el texto: el
  // clasificador lo lee por su cuenta).
  const [sinTexto, conTexto] = await Promise.all([
    prisma.firefliesSession.findMany({
      where: { ...base, transcript: null },
      select: { id: true, resolvedClientId: true, manualClientId: true, summary: true },
      orderBy: { date: "desc" },
      take: 60,
    }),
    prisma.firefliesSession.findMany({
      where: { ...base, transcript: { not: null } },
      select: { id: true, resolvedClientId: true, manualClientId: true },
      orderBy: { date: "desc" },
      take: 60,
    }),
  ]);
  const vinculaLaLectura = await lasQueVinculaLaLectura(conTexto.map((f) => f.id));
  const sinIntentar = (id: string) => (intentadas.get(id) ?? 0) < +ahora - ESPERA_ENTRE_INTENTOS_MS;
  const candidatas = [
    ...sinTexto.filter((f) => tieneNotas(f.summary) && sinIntentar(f.id)),
    ...conTexto.filter((f) => !vinculaLaLectura.has(f.id) && sinIntentar(f.id)),
  ];
  if (!candidatas.length) return resultado;

  // Solo las de un CLIENTE: un prospecto no tiene proyecto, y un aliado o Smarteam no se leen.
  const duenos = [...new Set(candidatas.map((f) => duenoDeLaSesion(f)).filter((x): x is string => !!x))];
  const clientes = new Set((await prisma.client.findMany({ where: { id: { in: duenos }, kind: "CLIENTE" }, select: { id: true } })).map((c) => c.id));

  for (const f of candidatas) {
    if (resultado.revisadas >= limit || Date.now() - empezo > TOPE_DEL_TICK_MS) break;
    const dueno = duenoDeLaSesion(f);
    if (!dueno || !clientes.has(dueno)) continue;
    intentadas.set(f.id, +ahora);
    resultado.revisadas++;
    try {
      // Atribuida a la reunión: el costo del clasificador se suma al de esa reunión (LlmCall.origen).
      const r = await conLaReunion(f.id, () => classifySessionToProjects(f.id, dueno));
      if (r.primaryProjectId) resultado.vinculadas++;
      else resultado.sinProyecto++;
    } catch (e) {
      resultado.sinProyecto++;
      console.error(`[lecturas] no se pudo vincular la reunión ${f.id}:`, e instanceof Error ? e.message : e);
    }
  }
  return resultado;
}
