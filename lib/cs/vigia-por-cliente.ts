/**
 * lib/cs/vigia-por-cliente.ts — EL VIGÍA DE UN CLIENTE: al entrar a su ficha, y a pedido (D14, 2026-10-05).
 *
 * ── LO QUE DECIDIÓ ELÍAS ─────────────────────────────────────────────────────
 *  a) Lo puede correr cualquier persona interna con acceso al cliente, no solo la líder de CS.
 *  b) «Que se actualice cada vez que alguien entra al cliente y tenga más de 2 días sin correr para
 *     ese cliente.» Al abrir la ficha del cliente o su cuenta en Éxito del cliente, en segundo plano:
 *     si el vigía no corrió para NINGÚN proyecto de cartera del cliente en 48 h, corre para todos sus
 *     proyectos de cartera activos (el criterio de la cartera: `proyectoDeCarteraWhere`).
 *  c) Contra los pedidos repetidos (un doble clic, una pestaña que reintenta, un script): la corrida a
 *     mano se rechaza con un mensaje claro si ya hay una en curso para ese cliente o si corrió hace
 *     menos de 10 minutos. Cada corrida cuesta y genera alertas.
 *  d) El interruptor de la base (`watchdogEnabled`) frena todo. Se mira acá para contestar claro, y
 *     además dentro de `runWatchdogForProject`, donde convergen todas las vías.
 *
 * ── EL MOLDE: lib/google/auto-sync.ts ────────────────────────────────────────
 *  · Se LEE la última corrida antes de escribir nada: con una reciente, una lectura y nada más.
 *  · El proceso RECUERDA hasta cuándo no toca (por cliente): las cargas siguientes ni miran la base.
 *  · Nunca dos corridas a la vez para el mismo cliente: candado en el proceso, que se toma antes del
 *    primer `await` y se suelta siempre (`finally`), también en error. Entre procesos, una corrida
 *    RUNNING fresca en la base cuenta como «en curso».
 *  · Un fallo no abre la puerta a reintentar en cada carga: se espera una hora (`ESPERA_TRAS_FALLO_MS`).
 *
 * Sin columnas nuevas: «cuándo corrió» sale de AgentRun (agentSlug + clientId + projectId + fechas).
 */
import { prisma } from "@/lib/db/prisma";
import { CS_CLIENT_WHERE } from "@/lib/clients/kind";
import { proyectoDeCarteraWhere } from "@/lib/projects/scope";
import { MS_SIN_LATIDO_PARA_COLGADA } from "@/lib/agents/run-colgada";
import type { DisparoDelVigia, WatchdogRunResult } from "./watchdog";

const AGENT_SLUG = "cs-watchdog";
const MIN_MS = 60 * 1000;

/** Al entrar: no corre si ya corrió para el cliente en este tiempo. */
export const VENTANA_AL_ENTRAR_MS = 48 * 60 * MIN_MS;
/** A mano: no corre si corrió para el cliente hace menos que esto. */
export const PISO_MANUAL_MS = 10 * MIN_MS;
/** Tras una corrida que falló (o un cliente sin proyectos de cartera), cuánto esperar antes de volver a mirar. */
export const ESPERA_TRAS_FALLO_MS = 60 * MIN_MS;

/** Una corrida del vigía como la lee esta regla. */
export interface CorridaDelVigia {
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Memoria del PROCESO: el candado por cliente, y hasta cuándo la vía automática ni mira la base. */
export interface EstadoDelVigia {
  enCurso: Set<string>;
  noAntesDe: Map<string, number>;
}

/** Lo que esta regla necesita del mundo. Inyectable para probarla sin base. */
export interface DepsDelVigia {
  encendido(): Promise<boolean>;
  /** Los proyectos de cartera activos del cliente. */
  proyectosDeCartera(clientId: string): Promise<string[]>;
  /** Las corridas del vigía de esos proyectos creadas desde `desde`, en cualquier estado. */
  corridasDesde(clientId: string, projectIds: readonly string[], desde: Date): Promise<CorridaDelVigia[]>;
  correr(projectId: string, trigger: DisparoDelVigia, quien: string | null): Promise<WatchdogRunResult>;
  ahora(): Date;
  estado: EstadoDelVigia;
}

export type MotivoSinCorrer =
  | "apagado"
  | "en_curso"
  | "reciente"
  | "espera_tras_fallo"
  | "sin_proyectos"
  | "no_es_de_la_cartera";

export type ResultadoDelVigia =
  | { corrio: true; resultados: WatchdogRunResult[] }
  | { corrio: false; motivo: MotivoSinCorrer; mensaje: string };

const ESTADO: EstadoDelVigia = { enCurso: new Set(), noAntesDe: new Map() };

const DEPS_REALES: DepsDelVigia = {
  /* Bajo demanda: watchdog.ts arrastra el SDK de IA y el armado del contexto. Se carga la primera
     vez que de verdad hace falta, no al importar este archivo (ni en las pruebas). */
  encendido: async () => (await import("./watchdog")).watchdogEnabled(),
  proyectosDeCartera: async (clientId) =>
    (
      await prisma.project.findMany({
        where: proyectoDeCarteraWhere({ clientId, client: CS_CLIENT_WHERE }),
        select: { id: true },
      })
    ).map((p) => p.id),
  corridasDesde: (clientId, projectIds, desde) =>
    prisma.agentRun.findMany({
      where: { agentSlug: AGENT_SLUG, clientId, projectId: { in: [...projectIds] }, createdAt: { gte: desde } },
      select: { status: true, createdAt: true, updatedAt: true },
    }),
  correr: async (projectId, trigger, quien) => (await import("./watchdog")).runWatchdogForProject(projectId, trigger, { quien }),
  ahora: () => new Date(),
  estado: ESTADO,
};

const minutos = (ms: number) => Math.max(1, Math.ceil(ms / MIN_MS));
/** El fin de una corrida (o su arranque, si sigue): para «hace cuánto corrió». */
const ultimaActividad = (c: CorridaDelVigia) => Math.max(c.createdAt.getTime(), c.updatedAt.getTime());
/** Una corrida RUNNING sin latido hace más de 30 min está muerta (lib/agents/run-colgada.ts): no es «en curso». */
const enVuelo = (c: CorridaDelVigia, ahora: number) =>
  c.status === "RUNNING" && c.createdAt.getTime() > ahora - MS_SIN_LATIDO_PARA_COLGADA;
/** ARCHIVED = el debounce perdió el claim: no revisó nada, no cuenta como corrida. */
const cuenta = (c: CorridaDelVigia) => c.status !== "ARCHIVED";

const MENSAJE: Record<MotivoSinCorrer, string> = {
  apagado: "El agente vigía está apagado desde los ajustes de Éxito del cliente.",
  en_curso: "El agente vigía ya está revisando este cliente. Espera a que termine: las alertas aparecen solas.",
  reciente: "El agente vigía revisó este cliente hace muy poco.",
  espera_tras_fallo: "La última revisión del agente vigía falló hace poco; vuelve a intentarlo en un rato.",
  sin_proyectos: "Este cliente no tiene proyectos activos de la cartera de Éxito del cliente: el agente vigía no tiene qué revisar.",
  no_es_de_la_cartera: "Ese proyecto no es de la cartera de Éxito del cliente: el agente vigía no lo revisa.",
};

const sinCorrer = (motivo: MotivoSinCorrer, mensaje = MENSAJE[motivo]): ResultadoDelVigia => ({ corrio: false, motivo, mensaje });

/** Corre los proyectos uno tras otro; una corrida que tira queda como error y no frena las demás. */
async function correrTodos(
  deps: DepsDelVigia,
  projectIds: readonly string[],
  trigger: DisparoDelVigia,
  quien: string | null,
): Promise<WatchdogRunResult[]> {
  const resultados: WatchdogRunResult[] = [];
  for (const projectId of projectIds) {
    try {
      resultados.push(await deps.correr(projectId, trigger, quien));
    } catch (e) {
      resultados.push({ status: "error", reason: e instanceof Error ? e.message : "error", projectId });
    }
  }
  return resultados;
}

/**
 * La vía AUTOMÁTICA: alguien abrió la ficha del cliente o su cuenta en Éxito del cliente. Corre para
 * los proyectos de cartera activos del cliente solo si el vigía no corrió para ninguno en 48 h.
 */
export async function vigiaAlEntrar(clientId: string, deps: DepsDelVigia = DEPS_REALES): Promise<ResultadoDelVigia> {
  const { estado } = deps;
  const inicio = deps.ahora().getTime();
  // El proceso ya sabe hasta cuándo no toca → ni siquiera se lee la base.
  const recordado = estado.noAntesDe.get(clientId);
  if (recordado !== undefined && inicio < recordado) return sinCorrer("reciente");
  if (estado.enCurso.has(clientId)) return sinCorrer("en_curso");
  estado.enCurso.add(clientId); // antes del primer await: dos cargas a la vez no pasan las dos

  try {
    if (!(await deps.encendido())) return sinCorrer("apagado");
    const proyectos = await deps.proyectosDeCartera(clientId);
    if (proyectos.length === 0) {
      estado.noAntesDe.set(clientId, inicio + ESPERA_TRAS_FALLO_MS);
      return sinCorrer("sin_proyectos");
    }

    // LEER antes de escribir: con una corrida en 48 h, esta lectura es todo lo que pasa.
    const corridas = (await deps.corridasDesde(clientId, proyectos, new Date(inicio - VENTANA_AL_ENTRAR_MS))).filter(cuenta);
    const buenas = corridas.filter((c) => c.status === "DONE" || enVuelo(c, inicio));
    if (buenas.length > 0) {
      const ultima = Math.max(...buenas.map((c) => c.createdAt.getTime()));
      estado.noAntesDe.set(clientId, ultima + VENTANA_AL_ENTRAR_MS);
      return sinCorrer("reciente");
    }
    const errores = corridas.filter((c) => c.status === "ERROR").map(ultimaActividad);
    const ultimoError = errores.length > 0 ? Math.max(...errores) : null;
    if (ultimoError !== null && inicio - ultimoError < ESPERA_TRAS_FALLO_MS) {
      estado.noAntesDe.set(clientId, ultimoError + ESPERA_TRAS_FALLO_MS);
      return sinCorrer("espera_tras_fallo");
    }

    const resultados = await correrTodos(deps, proyectos, "entrada", null);
    const fin = deps.ahora().getTime();
    // Con al menos una buena, la próxima en 48 h; si fallaron todas, una espera corta, no un bucle.
    const algunaBuena = resultados.some((r) => r.status === "ok");
    estado.noAntesDe.set(clientId, fin + (algunaBuena ? VENTANA_AL_ENTRAR_MS : ESPERA_TRAS_FALLO_MS));
    return { corrio: true, resultados };
  } catch (e) {
    // La base no respondió: el proceso igual espera antes de volver a intentar.
    estado.noAntesDe.set(clientId, deps.ahora().getTime() + ESPERA_TRAS_FALLO_MS);
    throw e;
  } finally {
    estado.enCurso.delete(clientId);
  }
}

/**
 * La vía A MANO, por cliente (todos sus proyectos de cartera) o por un proyecto suyo. El acceso al
 * cliente lo verifica la ruta. Se rechaza si hay una corrida en curso para el cliente o si corrió
 * hace menos de 10 minutos.
 */
export async function vigiaAMano(
  clientId: string,
  opciones: { projectId?: string | null; quien: string | null },
  deps: DepsDelVigia = DEPS_REALES,
): Promise<ResultadoDelVigia> {
  const { estado } = deps;
  if (estado.enCurso.has(clientId)) return sinCorrer("en_curso");
  estado.enCurso.add(clientId);

  try {
    if (!(await deps.encendido())) return sinCorrer("apagado");
    const inicio = deps.ahora().getTime();
    const proyectos = await deps.proyectosDeCartera(clientId);
    if (opciones.projectId && !proyectos.includes(opciones.projectId)) return sinCorrer("no_es_de_la_cartera");
    if (proyectos.length === 0) return sinCorrer("sin_proyectos");

    const desde = new Date(inicio - Math.max(PISO_MANUAL_MS, MS_SIN_LATIDO_PARA_COLGADA));
    const corridas = (await deps.corridasDesde(clientId, proyectos, desde)).filter(cuenta);
    // Otra máquina (o el barrido) la está corriendo ahora.
    if (corridas.some((c) => enVuelo(c, inicio))) return sinCorrer("en_curso");
    const ultima = corridas.length > 0 ? Math.max(...corridas.map(ultimaActividad)) : null;
    if (ultima !== null && inicio - ultima < PISO_MANUAL_MS) {
      const hace = minutos(inicio - ultima);
      const falta = minutos(ultima + PISO_MANUAL_MS - inicio);
      return sinCorrer(
        "reciente",
        `El agente vigía revisó este cliente hace ${hace} min. Cada revisión cuesta y repite el análisis: puedes volver a pedirla en ${falta} min.`,
      );
    }

    const aCorrer = opciones.projectId ? [opciones.projectId] : proyectos;
    const resultados = await correrTodos(deps, aCorrer, "manual", opciones.quien);
    // La vía automática no tiene por qué volver a correr enseguida.
    if (resultados.some((r) => r.status === "ok")) estado.noAntesDe.set(clientId, deps.ahora().getTime() + VENTANA_AL_ENTRAR_MS);
    return { corrio: true, resultados };
  } finally {
    estado.enCurso.delete(clientId);
  }
}
