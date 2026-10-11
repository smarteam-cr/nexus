/**
 * lib/seguimiento/hechos-server.ts — LA LECTURA DE HECHOS de una reunión y lo que se hace con ellos (memoria de la
 * cuenta, etapa 6). SERVIDOR. El ÚNICO escritor de `HechoDeReunion` (lib/seguimiento/hechos-internos.test.ts lo vigila).
 * Ver docs/DECISIONS.md «Hechos, enrutador y novedades».
 *
 *   · `leerHechosDeLaReunion` — lo llama la lectura de seguimiento (lib/sessions/post-process.ts) cuando la minuta quedó
 *     escrita (o, en una reunión con solo notas, cuando la lectura dijo «sin texto»). Lee la reunión por el chokepoint
 *     (lib/seguimiento/hechos/texto-de-la-reunion.ts), le pide los hechos a Claude (UNA llamada, `pedidoDeHechos`),
 *     verifica las citas (`leerSalidaDeHechos`), rutea con el registro (`rutear`), escribe las filas y aplica cada
 *     destino con su propio ciclo: la ficha, la alerta de queja, el avance y la etapa. Cada uno best-effort.
 *   · `reintentarHechos` — el job de la lectura (`seguimiento-reuniones`) reintenta las reuniones cuyos hechos fallaron
 *     o que cambiaron de dueño (como «procesos-lectura»: el estado vive en su AgentRun «seguimiento-hechos»).
 *   · `alCambiarDeDueno` — una reunión que cambia de dueño retira sus hechos vivos del cliente anterior («La reunión
 *     cambió de dueño»: lo pendiente se desestima y lo delegado se retira de su módulo); el reintento los vuelve a pedir
 *     en el cliente nuevo (solo los hechos: la minuta no se relee). `retirarHechos` es lo mismo por id: el remedio de
 *     INV45 (scripts/hechos-fuera-de-su-cliente.ts).
 *   · Los lectores: los riesgos para el vigía, los hechos para la memoria interna (los dos, solo con la bandera
 *     prendida), y `decidirDestinoDeHecho` para las novedades («Listo», «No aplica», o el acuerdo del chat que la
 *     llevaba; las lee lib/seguimiento/novedades-server.ts).
 *   · `marcarProcesosUsados` — al terminar un mapeo de Procesos, los hechos de cómo trabaja hoy el cliente que ese
 *     mapeo leyó quedan usados (lib/procesos/agente.ts).
 *
 * ⛔ Nada de esto corre con `SEGUIMIENTO_HECHOS` apagada (vacía = apagada) ni sin el SQL
 * (scripts/sql/2026-10-10-hechos-de-reunion.sql): todo degrada sin romper y la lectura de cada reunión sigue como antes.
 * ⛔ No lee `FirefliesSession` ni `SessionProject` por su cuenta (lib/seguimiento/guardas.test.ts): la reunión sale del
 * chokepoint, y el dueño de `duenoDeLaReunion`.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getAnthropic } from "@/lib/anthropic";
import { conContextoDeIA, conLaReunion } from "@/lib/ai/contexto-de-corrida";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { loadHandoffContext } from "@/lib/canvas/load-canvas-context";
import { responsableDeLaPreventaViva } from "@/lib/lecturas/personas";
import { duenoDeLaReunion, duenosDeLasReuniones } from "@/lib/sessions/reuniones-para-seguimiento";
import { whereBelongsToClient, whereVinculadaAlProyecto } from "@/lib/sessions/project-sources";
import { claveDeRepeticion, rutear, salidaDe, type HechoRuteado } from "./enrutador";
import {
  decidirDestino,
  delegarDestino,
  desestimarPorCambioDeDueno,
  destinosDelegados,
  esperaAUnaPersona,
  estadoGeneral,
  estaVencido,
  leerDestinos,
  soloDelegado,
  type AccionSobreElDestino,
  type CambioDelHecho,
  type DestinoDelHecho,
  type RefDelDestino,
} from "./hechos/estado";
import { MODELO_DE_HECHOS, TOPE_LO_VENDIDO, pedidoDeHechos, type ProyectoDelPedido } from "./hechos/pedido";
import {
  AGENT_SLUG_DE_HECHOS,
  DECIDE_EL_SISTEMA,
  MAX_INTENTOS_DE_HECHOS,
  MINUTOS_CORRIDA_COLGADA,
  NOTA_CAMBIO_DE_DUENO,
  hechosPrendidos,
} from "./hechos/reglas";
import { leerSalidaDeHechos, prepararParaVerificar } from "./hechos/salida";
import { textoParaHechos } from "./hechos/texto-de-la-reunion";
import type { TipoDeHecho } from "./hechos/tipos";

/**
 * La variante de la llamada de hechos, hasta que el sondeo (etapa 5) decida: aparte, con la reunión cacheada. ⚠ La
 * lectura de seguimiento de hoy (lib/sessions/post-process.ts) todavía no arma su pedido con `prefijoDeLaReunion`: hasta
 * que lo haga, la caché se escribe y no se comparte (un recargo de escritura sobre la reunión). Si el sondeo elige «sin
 * caché», es esta línea.
 */
export const VARIANTE_DE_HECHOS: "aparte-con-cache" | "aparte-sin-cache" = "aparte-con-cache";

/* ── ¿Está el SQL? ─────────────────────────────────────────────────────────────────── */

const REMIRAR_MS = 30_000;
let mirado: { ok: boolean; en: number } | null = null;
let mirando: Promise<boolean> | null = null;

/**
 * ¿El cliente de Prisma conoce el modelo Y la base tiene la tabla? En verde no se vuelve a preguntar en toda la vida
 * del proceso; sin la tabla se vuelve a mirar como mucho cada 30 s (correr el SQL lo pone en verde solo). Si la
 * consulta falla, false sin guardarlo (el molde es `seguimientoDisponible`, lib/lecturas/cola.ts).
 */
export async function hechosDisponible(): Promise<boolean> {
  const conoce = !!(Prisma as unknown as Record<string, unknown>).HechoDeReunionScalarFieldEnum;
  if (!conoce) return false;
  if (mirado?.ok) return true;
  if (mirado && performance.now() - mirado.en < REMIRAR_MS) return false;
  mirando ??= (async () => {
    try {
      const filas = await prisma.$queryRaw<{ existe: boolean }[]>`SELECT to_regclass('public."HechoDeReunion"') IS NOT NULL AS existe`;
      const ok = filas[0]?.existe === true;
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
export function olvidarHechosMirado(): void {
  mirado = null;
  mirando = null;
}

/** La bandera prendida Y el SQL aplicado. Con cualquiera de las dos en falso, la etapa 6 no corre. */
export async function hechosActivos(): Promise<boolean> {
  return hechosPrendidos(process.env) && (await hechosDisponible());
}

/**
 * Corre una lectura de la tabla para un agente (el vigía, la memoria); con la bandera apagada, sin la tabla (o con el
 * cliente viejo), devuelve el valor de respaldo. Con la bandera apagada los hechos ya escritos NO llegan a ningún
 * agente: las pantallas tampoco los muestran, y nadie los podría decidir.
 */
async function seguro<T>(fn: () => Promise<T>, respaldo: T): Promise<T> {
  try {
    if (!(await hechosActivos())) return respaldo;
    return await fn();
  } catch (e) {
    if (esquemaDesactualizado(e)) return respaldo;
    throw e;
  }
}

/* ── La lectura de hechos ─────────────────────────────────────────────────────────── */

export type ResultadoDeHechos =
  | { estado: "apagado" | "sin_sql" | "omitida" | "ya_leida" | "ocupada" | "sin_texto"; motivo?: string }
  | { estado: "lista"; agentRunId: string; hechos: number; descartados: number; cortada: boolean; aplicado: ResumenDelRuteo }
  | { estado: "error"; error: string; agentRunId?: string };

export interface ResumenDelRuteo {
  ficha: number;
  alertas: number;
  vigia: number;
  avance: number;
  etapa: number;
  procesos: boolean;
  novedades: number;
}

const DIA_MS = 86_400_000;

type CorridaDeHechos = { id: string; status: string; clientId: string | null; createdAt: Date; sourceSessionIds: string[]; output?: string | null };

/** Las corridas de hechos de unas reuniones (de los últimos `dias`). `conSalida`: también lo que dejó cada una (solo al leer una reunión). */
async function corridasDe(sessionIds: readonly string[] | null, desde: Date, conSalida = false): Promise<CorridaDeHechos[]> {
  return prisma.agentRun.findMany({
    where: { agentSlug: AGENT_SLUG_DE_HECHOS, createdAt: { gte: desde }, ...(sessionIds ? { sourceSessionIds: { hasSome: [...sessionIds] } } : {}) },
    select: { id: true, status: true, clientId: true, createdAt: true, sourceSessionIds: true, ...(conSalida ? { output: true } : {}) },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
}

/**
 * ¿Lo que se leyó para este dueño se leyó sin la transcripción? Todas sus corridas listas son de una reunión con solo
 * notas (fuente «notas») o sin nada que leer (`sinTexto`). Si la transcripción llegó después, los hechos se vuelven a
 * leer con ella: si no, lo que dijo la conversación entera no se leería nunca.
 */
export function leidaSinLaTranscripcion(corridas: readonly CorridaDeHechos[], clientId: string): boolean {
  const listas = corridas.filter((c) => c.clientId === clientId && c.status === "DONE");
  return (
    listas.length > 0 &&
    listas.every((c) => {
      try {
        const o = JSON.parse(c.output ?? "{}") as { fuente?: unknown; sinTexto?: unknown };
        return o.fuente === "notas" || o.sinTexto === true;
      } catch {
        return false;
      }
    })
  );
}

/** La nota con que se desestiman los hechos de las notas cuando la reunión se vuelve a leer con la transcripción. */
const NOTA_RELEIDA_CON_LA_TRANSCRIPCION = "Se volvió a leer con la transcripción";

/** Una corrida RUNNING de más de 15 minutos se cayó a mitad: cuenta como un intento fallido. */
const colgada = (c: CorridaDeHechos, ahora: Date) => c.status === "RUNNING" && +ahora - +c.createdAt > MINUTOS_CORRIDA_COLGADA * 60_000;

/** Qué dicen las corridas de una reunión para un dueño: ya leída, leyéndose, o cuántas veces falló. */
export function estadoDeLasCorridas(corridas: readonly CorridaDeHechos[], clientId: string, ahora: Date): { leida: boolean; leyendo: boolean; fallas: number } {
  const deEste = corridas.filter((c) => c.clientId === clientId);
  return {
    leida: deEste.some((c) => c.status === "DONE"),
    leyendo: deEste.some((c) => c.status === "RUNNING" && !colgada(c, ahora)),
    fallas: deEste.filter((c) => c.status === "ERROR" || colgada(c, ahora)).length,
  };
}

export interface OpcionesDeLosHechos {
  /** La fila de la cola (`LecturaDeReunion`): queda en `HechoDeReunion.lecturaId`. */
  lecturaId?: string | null;
  /** Quién pidió la lectura: cobra contra su presupuesto. null = automática. */
  quien?: string | null;
  signal?: AbortSignal;
  ahora?: Date;
}

/**
 * Lee los hechos de una reunión, los escribe y los rutea. NUNCA lanza: un error vuelve como `estado: "error"` (con la
 * corrida en ERROR, que el job reintenta). Atribuida a la reunión: toda llamada a Claude de adentro queda en `LlmCall`
 * con `origen = "reunion:<id> › …"`.
 */
export async function leerHechosDeLaReunion(sessionId: string, opts: OpcionesDeLosHechos = {}): Promise<ResultadoDeHechos> {
  return conLaReunion(sessionId, () => leer(sessionId, opts)).catch(
    (e): ResultadoDeHechos => ({ estado: "error", error: e instanceof Error ? e.message : String(e) }),
  );
}

async function leer(sessionId: string, opts: OpcionesDeLosHechos): Promise<ResultadoDeHechos> {
  const ahora = opts.ahora ?? new Date();
  if (!hechosPrendidos(process.env)) return { estado: "apagado" };
  if (!(await hechosDisponible())) return { estado: "sin_sql" };

  // 1. El dueño: `resolvedClientId` (el manual solo si no hay). Sin dueño, nada.
  const clientId = await duenoDeLaReunion(sessionId);
  if (!clientId) return { estado: "omitida", motivo: "sin dueño" };
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true, industry: true, kind: true } });
  if (!client) return { estado: "omitida", motivo: "el dueño ya no existe" };

  // 2. Ya leída para este dueño, o leyéndose. Una leída solo con las notas (o sin nada que leer) se vuelve a leer si
  //    ahora la reunión tiene transcripción.
  const corridas = await corridasDe([sessionId], new Date(+ahora - 365 * DIA_MS), true);
  const previas = estadoDeLasCorridas(corridas, clientId, ahora);
  let releerConLaTranscripcion = false;
  let reunionYaLeida: Awaited<ReturnType<typeof textoParaHechos>> | undefined;
  if (previas.leida) {
    if (!leidaSinLaTranscripcion(corridas, clientId)) return { estado: "ya_leida" };
    reunionYaLeida = await textoParaHechos(sessionId, clientId);
    if (reunionYaLeida?.texto?.fuente !== "transcripcion") return { estado: "ya_leida" };
    releerConLaTranscripcion = true;
  }
  if (previas.leyendo) return { estado: "ocupada" };

  // 3. De un aliado o de Smarteam, o una reunión que no es del cliente o de puertas adentro: nada. Queda una corrida
  //    lista sin llamar al modelo, para que el reintento no la vuelva a mirar en cada tick.
  if (client.kind !== "CLIENTE" && client.kind !== "PROSPECTO") return marcarOmitida(sessionId, clientId, "no es de un cliente ni de un prospecto", opts.quien);
  const reunion = reunionYaLeida ?? (await textoParaHechos(sessionId, clientId));
  if (!reunion) return marcarOmitida(sessionId, clientId, "la reunión no es del cliente o todavía no ocurrió", opts.quien);
  if (reunion.puertasAdentro) return marcarOmitida(sessionId, clientId, "de puertas adentro", opts.quien);

  const run = await prisma.agentRun.create({
    data: {
      agentId: null,
      agentSlug: AGENT_SLUG_DE_HECHOS,
      clientId,
      projectId: null,
      status: "RUNNING",
      triggeredByEmail: opts.quien ?? null,
      sourceSessionIds: [sessionId],
      stepLabel: `Hechos de «${reunion.titulo}»`,
      currentPhase: "Leyendo los hechos",
    },
    select: { id: true },
  });
  // Una vez escritos los hechos, la corrida NUNCA queda en ERROR: el reintento los volvería a escribir (duplicados).
  let escritos = false;
  const marcarError = async (error: string): Promise<ResultadoDeHechos> => {
    const data = escritos
      ? { status: "DONE" as const, output: JSON.stringify({ errorDespuesDeEscribir: error.slice(0, 2_000) }), currentPhase: null }
      : { status: "ERROR" as const, output: error.slice(0, 2_000), currentPhase: null };
    await prisma.agentRun.update({ where: { id: run.id }, data }).catch(() => undefined);
    return { estado: "error", error, agentRunId: run.id };
  };

  try {
    if (!reunion.texto) {
      // Sin nada que leer: la corrida queda lista (no se reintenta) y no hay hechos.
      await prisma.agentRun.update({ where: { id: run.id }, data: { status: "DONE", output: JSON.stringify({ sinTexto: true }), currentPhase: null } });
      return { estado: "sin_texto" };
    }

    // 4. Los proyectos con lo vendido, el equipo (activo y de baja) y el pedido.
    const proyectos: (ProyectoDelPedido & { alimentaElAvance: boolean })[] = await Promise.all(
      reunion.proyectos.map(async (p, k) => ({
        ref: `P${k + 1}`,
        id: p.id,
        nombre: p.nombre,
        alimentaElAvance: p.alimentaElAvance,
        loVendido: (await loadHandoffContext(p.id, { onlyConfirmed: false, includeKeys: ["alcance_contratado"] }).catch(() => "")).slice(0, TOPE_LO_VENDIDO),
      })),
    );
    const equipo = (await prisma.teamMember.findMany({ select: { name: true } })).map((t) => t.name).filter((n): n is string => !!n?.trim());
    const pedido = pedidoDeHechos({
      cliente: { name: client.name, industry: client.industry, kind: client.kind },
      proyectos,
      equipoSmarteam: equipo,
      reunion: { titulo: reunion.titulo, fecha: reunion.fecha, texto: reunion.texto },
      modelo: MODELO_DE_HECHOS,
      conCache: VARIANTE_DE_HECHOS === "aparte-con-cache",
    });

    // 5. La llamada.
    let msg: Anthropic.Messages.Message;
    try {
      msg = await conContextoDeIA(
        { agentSlug: AGENT_SLUG_DE_HECHOS, agentRunId: run.id, clientId, projectId: null, triggeredByEmail: opts.quien ?? null, origen: "seguimiento/hechos" },
        () => getAnthropic().messages.create(pedido, opts.signal ? { signal: opts.signal } : undefined),
      );
    } catch (e) {
      return await marcarError(opts.signal?.aborted ? "La lectura de hechos se cortó antes de terminar." : `Claude: ${(e as Error).message}`);
    }

    // 6. Las citas: lo que no aparece tal cual, se descarta.
    const salida = leerSalidaDeHechos(msg, {
      texto: prepararParaVerificar(reunion.texto),
      proyectosPorRef: new Map(proyectos.map((p) => [p.ref, { id: p.id }])),
      equipoSmarteam: equipo,
    });
    if (!salida.llamoLaHerramienta) return await marcarError("El modelo no llamó a la herramienta de los hechos.");
    // La base guarda citas de 12 a 600 caracteres (CHECK): lo que no entra, no se escribe.
    const hechos = salida.hechos.filter((h) => h.cita.length >= 12 && h.cita.length <= 600);

    // 7. El ruteo.
    const huellas = [...new Set(hechos.map((h) => h.huella))];
    const abiertos = huellas.length
      ? await prisma.hechoDeReunion.findMany({
          where: { clientId, estado: "pendiente", huella: { in: huellas }, NOT: { sessionId } },
          select: { id: true, projectId: true, huella: true, estado: true, createdAt: true, destinos: true },
          orderBy: { createdAt: "asc" },
        })
      : [];
    // Abierto = pendiente en general y sin vencer, AUNQUE sus destinos ya estén delegados (la propuesta a la ficha, la
    // etapa…): lo mismo dicho en la reunión siguiente no se vuelve a mandar a la ficha (otra llamada a Haiku, y volver a
    // proponer lo que el CSE quizás descartó). La queja y las señales siguen igual (`SIGUEN_AUNQUE_SE_REPITA`).
    const hechosAbiertosPorHuella = new Map<string, string>();
    for (const a of abiertos) {
      if (estaVencido(a, ahora)) continue;
      const clave = claveDeRepeticion(a.projectId, a.huella);
      if (!hechosAbiertosPorHuella.has(clave)) hechosAbiertosPorHuella.set(clave, a.id);
    }
    // Si no se puede saber si hay una preventa viva, se toma como que sí: solo la preventa propone a la ficha de un
    // prospecto, y en la duda los hechos de la cuenta no proponen ahí.
    const preventaViva =
      client.kind === "PROSPECTO" ? await responsableDeLaPreventaViva(clientId).then((r) => r !== undefined, () => true) : false;
    const ruteo = rutear(hechos, {
      kind: client.kind,
      puertasAdentro: reunion.puertasAdentro,
      preventaViva,
      proyectosVinculados: new Set(proyectos.map((p) => p.id)),
      proyectosQueAlimentanElAvance: new Set(proyectos.filter((p) => p.alimentaElAvance).map((p) => p.id)),
      hechosAbiertosPorHuella,
    });

    // 8. Las filas, de una vez. El riesgo nace delegado en el vigía (lo juzga él). Los ids se arman acá para saber cuál
    //    es cuál al aplicar cada destino (el orden de un INSERT … RETURNING no está garantizado).
    //    Antes de escribir, el dueño se vuelve a mirar: si la reunión cambió de dueño mientras el modelo leía, no se
    //    escribe nada (ni la ficha ni la alerta del cliente anterior) y el reintento la lee para el dueño nuevo.
    if (ruteo.seEscriben && ruteo.porHecho.length && (await duenoDeLaReunion(sessionId)) !== clientId) {
      await prisma.agentRun.update({
        where: { id: run.id },
        data: { status: "DONE", currentPhase: null, output: JSON.stringify({ omitida: "la reunión cambió de dueño mientras se leía" }) },
      });
      return { estado: "omitida", motivo: "la reunión cambió de dueño mientras se leía" };
    }
    // Releída con la transcripción: lo que quedó vivo de la lectura de las notas se desestima (la conversación entera lo
    // vuelve a decir, con su cita). Lo delegado sigue en su módulo (es del mismo cliente).
    if (releerConLaTranscripcion) {
      const deLasNotas = await prisma.hechoDeReunion.findMany({ where: { sessionId, clientId, estado: "pendiente" }, select: SELECT_PARA_RETIRAR });
      for (const h of deLasNotas) {
        const c = desestimarPorCambioDeDueno(h, DECIDE_EL_SISTEMA, ahora, NOTA_RELEIDA_CON_LA_TRANSCRIPCION);
        if (c) await escribirCambio(h.id, c, h.updatedAt);
      }
    }
    const fecha = new Date(`${reunion.fecha}T12:00:00.000Z`);
    const creados = ruteo.seEscriben ? ruteo.porHecho.map(() => randomUUID()) : [];
    if (creados.length) {
      await prisma.hechoDeReunion.createMany({
        data: ruteo.porHecho.map((r, i) => {
          const destinos = r.destinos.map((d) => (salidaDe(d.clave) === "vigia" ? { ...d, estado: "delegado" as const, ref: { tipo: "vigia" as const } } : d));
          return {
            id: creados[i],
            sessionId,
            lecturaId: opts.lecturaId ?? null,
            agentRunId: run.id,
            clientId,
            projectId: r.hecho.projectId,
            tipo: r.hecho.tipo,
            tema: r.hecho.tema ?? null,
            frase: r.hecho.frase,
            cita: r.hecho.cita,
            citaFuente: r.hecho.fuenteDeLaCita,
            // Solo lo que comprobó el turno de la transcripción: lo que dijo el modelo no se guarda como un hecho.
            quien: r.hecho.quienComprobado ? r.hecho.quien : null,
            gravedad: r.hecho.gravedad ?? null,
            huella: r.hecho.huella,
            mismoQueId: r.mismoQueId,
            destinos: destinos as unknown as Prisma.InputJsonValue,
            estado: estadoGeneral(destinos),
            fechaDeLaReunion: fecha,
          };
        }),
      });
      escritos = true;
    }

    // 9. Cada destino con su ciclo. Best-effort: lo que falla queda pendiente y se ve en la tarjeta.
    const aplicado = await aplicarRuteo({
      sessionId,
      clientId,
      reunion: { id: sessionId, titulo: reunion.titulo, fecha: reunion.fecha, fechaDate: fecha },
      porHecho: ruteo.porHecho,
      ids: creados,
      acciones: ruteo.acciones,
      agentRunId: run.id,
      quien: opts.quien ?? null,
      ahora,
    });

    const porMotivo: Record<string, number> = {};
    for (const d of salida.descartados) porMotivo[d.motivo] = (porMotivo[d.motivo] ?? 0) + 1;
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "DONE",
        currentPhase: null,
        output: JSON.stringify({
          hechos: creados.length,
          descartados: porMotivo,
          cortada: salida.cortada,
          fuente: reunion.texto.fuente,
          caracteres: reunion.texto.caracteres,
          tokens: { entrada: msg.usage?.input_tokens ?? 0, salida: msg.usage?.output_tokens ?? 0, cacheLeida: msg.usage?.cache_read_input_tokens ?? 0 },
          aplicado,
        }),
      },
    });
    console.log(
      `[hechos] ✓ «${reunion.titulo}» (${client.name}): ${creados.length} hecho(s), ${salida.descartados.length} descartado(s)` +
        ` · ficha ${aplicado.ficha} · alertas ${aplicado.alertas} · avance ${aplicado.avance} · etapa ${aplicado.etapa} · novedades ${aplicado.novedades}`,
    );
    return { estado: "lista", agentRunId: run.id, hechos: creados.length, descartados: salida.descartados.length, cortada: salida.cortada, aplicado };
  } catch (e) {
    return await marcarError(e instanceof Error ? e.message : String(e));
  }
}

/** Una reunión que no deja hechos para este dueño: una corrida lista sin llamada, y nada más. */
async function marcarOmitida(sessionId: string, clientId: string, motivo: string, quien: string | null | undefined): Promise<ResultadoDeHechos> {
  await prisma.agentRun.create({
    data: {
      agentId: null,
      agentSlug: AGENT_SLUG_DE_HECHOS,
      clientId,
      projectId: null,
      status: "DONE",
      triggeredByEmail: quien ?? null,
      sourceSessionIds: [sessionId],
      stepLabel: "Hechos: no corresponde",
      output: JSON.stringify({ omitida: motivo }),
    },
    select: { id: true },
  });
  return { estado: "omitida", motivo };
}

/* ── Aplicar el ruteo ──────────────────────────────────────────────────────────────── */

/**
 * Deja un destino delegado en su módulo. Lee y escribe con la marca de la fila (`updatedAt`): si otro escritor la cambió
 * en el medio (una persona decidió una novedad), se vuelve a leer una vez en vez de pisarla.
 */
async function delegar(hechoId: string, clave: string, ref: RefDelDestino): Promise<void> {
  for (let intento = 0; intento < 2; intento++) {
    const fila = await prisma.hechoDeReunion.findUnique({ where: { id: hechoId }, select: { destinos: true, estado: true, decididoAt: true, updatedAt: true } });
    if (!fila) return;
    const destinos = delegarDestino(leerDestinos(fila.destinos), clave, ref);
    const estado = fila.estado === "pendiente" ? estadoGeneral(destinos) : fila.estado;
    // El CHECK HechoDeReunion_decidido exige decididoAt cuando el estado pasa a usado o desestimado: si una persona usó
    // otro destino del mismo hecho mientras tanto, delegar este lo cierra y lo firma el sistema.
    const cierra = (estado === "usado" || estado === "desestimado") && !fila.decididoAt;
    const r = await prisma.hechoDeReunion.updateMany({
      where: { id: hechoId, updatedAt: fila.updatedAt },
      data: {
        destinos: destinos as unknown as Prisma.InputJsonValue,
        estado,
        ...(cierra ? { decididoAt: new Date(), decididoPorEmail: "sistema" } : {}),
      },
    });
    if (r.count === 1) return;
  }
}

const claveConSalida = (r: HechoRuteado, salida: string): string | null => r.destinos.find((d) => salidaDe(d.clave) === salida)?.clave ?? null;

async function aplicarRuteo(o: {
  sessionId: string;
  clientId: string;
  reunion: { id: string; titulo: string; fecha: string; fechaDate: Date };
  porHecho: HechoRuteado[];
  ids: string[];
  acciones: ReturnType<typeof rutear>["acciones"];
  agentRunId: string;
  quien: string | null;
  ahora: Date;
}): Promise<ResumenDelRuteo> {
  const resumen: ResumenDelRuteo = { ficha: 0, alertas: 0, vigia: o.acciones.vigia.length, avance: 0, etapa: 0, procesos: o.acciones.procesos, novedades: 0 };
  resumen.novedades = o.porHecho.reduce((s, r) => s + r.destinos.filter((d) => salidaDe(d.clave) === "novedad").length, 0);
  const idDe = (i: number) => o.ids[i];

  // La ficha: una sola llamada a Haiku con las viñetas de los hechos (no relee la reunión).
  if (o.acciones.ficha.length) {
    try {
      const { proponerFichaDesdeHechos } = await import("@/lib/clients/ficha-propuesta");
      const r = await proponerFichaDesdeHechos({
        clientId: o.clientId,
        reunion: { title: o.reunion.titulo, date: o.reunion.fechaDate },
        hechos: o.acciones.ficha.map((i) => ({ tipo: o.porHecho[i].hecho.tipo, frase: o.porHecho[i].hecho.frase, cita: o.porHecho[i].hecho.cita })),
        triggeredByEmail: o.quien,
      });
      if (r.status === "ok") {
        for (const i of o.acciones.ficha) {
          const clave = claveConSalida(o.porHecho[i], "ficha");
          if (clave && idDe(i)) await delegar(idDe(i), clave, { tipo: "ficha", campos: r.campos });
        }
        resumen.ficha = r.cambiados;
      } else if (r.status === "error") console.error(`[hechos] la ficha falló (no bloqueante): ${r.error}`);
    } catch (e) {
      console.error(`[hechos] la ficha falló (no bloqueante):`, e instanceof Error ? e.message : e);
    }
  }

  // Las quejas verificadas del cliente: el detector de la lectura (una alerta por cita).
  for (const i of o.acciones.alertas) {
    const h = o.porHecho[i].hecho;
    if (!idDe(i)) continue;
    try {
      const { levantarQuejaDeLaLectura } = await import("@/lib/cs/alertas-de-la-lectura-server");
      const r = await levantarQuejaDeLaLectura({
        hecho: { hechoId: idDe(i), tipo: h.tipo, frase: h.frase, cita: h.cita, quien: h.quien, quienComprobado: h.quienComprobado, gravedad: h.gravedad ?? null, huella: h.huella, fuenteDeLaCita: h.fuenteDeLaCita },
        clientId: o.clientId,
        reunion: { id: o.reunion.id, titulo: o.reunion.titulo, fecha: o.reunion.fecha, puertasAdentro: false },
        agentRunId: o.agentRunId,
        ahora: o.ahora,
      });
      if ("alertaId" in r) {
        await delegar(idDe(i), "alerta.queja", { tipo: "alerta", id: r.alertaId });
        if (r.estado !== "suprimida") resumen.alertas++;
      } else if (r.estado === "error") console.error(`[hechos] la alerta de queja falló (no bloqueante): ${r.error}`);
    } catch (e) {
      console.error(`[hechos] la alerta de queja falló (no bloqueante):`, e instanceof Error ? e.message : e);
    }
  }

  // El avance: solo con una señal de cronograma, para cada proyecto que cumple `linkFeedsAvance`.
  for (const projectId of o.acciones.avance) {
    try {
      const { regenerateTimelineProgress } = await import("@/lib/timeline/regenerate-progress");
      const r = await regenerateTimelineProgress(projectId, { asOfSessionId: o.sessionId, disparadoPorSistema: !o.quien });
      if (r.status === "error") {
        console.error(`[hechos] el avance de ${projectId} falló (no bloqueante): ${r.reason ?? ""}`);
        continue;
      }
      resumen.avance++;
      for (const [i, r2] of o.porHecho.entries()) {
        if (r2.hecho.projectId === projectId && claveConSalida(r2, "avance") && idDe(i)) await delegar(idDe(i), "cronograma.avance", { tipo: "avance", projectId });
      }
    } catch (e) {
      console.error(`[hechos] el avance de ${projectId} falló (no bloqueante):`, e instanceof Error ? e.message : e);
    }
  }

  // La etapa: solo con una señal de etapa del proyecto, con el texto de la señal (no relee la reunión).
  if (o.acciones.etapa.size) {
    const minuta = await prisma.sessionMinute.findUnique({ where: { sessionId: o.sessionId }, select: { summary: true } }).catch(() => null);
    for (const [projectId, indices] of o.acciones.etapa) {
      try {
        const [{ proponerEtapaDesdeSesion }, { textoDeLasSenalesDeEtapa, citasDeLasSenalesDeEtapa }] = await Promise.all([
          import("@/lib/projects/etapa-desde-reunion-server"),
          import("@/lib/projects/etapa-desde-reunion"),
        ]);
        const senales = indices.map((i) => o.porHecho[i].hecho);
        const texto = textoDeLasSenalesDeEtapa(senales, minuta?.summary ?? null);
        // La cita de la etapa se verifica solo contra las citas literales de las señales, no contra la frase ni el resumen.
        const r = await proponerEtapaDesdeSesion(o.sessionId, projectId, o.ahora, { texto, citas: citasDeLasSenalesDeEtapa(senales), quien: o.quien });
        if (r.status === "error") {
          console.error(`[hechos] la etapa de ${projectId} falló (no bloqueante): ${r.error}`);
          continue;
        }
        if (r.status === "sugerida") resumen.etapa++;
        for (const i of indices) if (idDe(i)) await delegar(idDe(i), "etapa.encuesta", { tipo: "etapa", projectId, stageId: r.status === "sugerida" ? r.stageId : null });
      } catch (e) {
        console.error(`[hechos] la etapa de ${projectId} falló (no bloqueante):`, e instanceof Error ? e.message : e);
      }
    }
  }
  return resumen;
}

/* ── El reintento (lo corre el job de la lectura) ─────────────────────────────────── */

/**
 * Las reuniones de los últimos 14 días cuyos hechos fallaron (o se colgaron) o que cambiaron de dueño, para el dueño de
 * hoy: hasta `n`, con menos de 3 intentos y sin una corrida viva. Solo reuniones que ya tuvieron alguna corrida de
 * hechos: prender la bandera no relee las dos semanas anteriores. La lectura de la reunión (la minuta) no se toca.
 * NUNCA lanza.
 */
export async function reintentarHechos(n: number, ahora = new Date()): Promise<{ reintentadas: string[]; errores: string[] }> {
  const vacio = { reintentadas: [] as string[], errores: [] as string[] };
  try {
    if (!(await hechosActivos())) return vacio;
    const corridas = await corridasDe(null, new Date(+ahora - 14 * DIA_MS));
    const porReunion = new Map<string, CorridaDeHechos[]>();
    for (const c of corridas) {
      const s = c.sourceSessionIds[0];
      if (s) porReunion.set(s, [...(porReunion.get(s) ?? []), c]);
    }
    const reintentadas: string[] = [];
    const errores: string[] = [];
    // Los dueños de todas en UNA consulta: el job corre cada minuto, y una consulta por reunión eran cientos por tick
    // sobre un pool chico (RUNBOOK, invariante #3). La fila de la cola se mira solo en las que de verdad se reintentan.
    const duenos = await duenosDeLasReuniones([...porReunion.keys()]);
    for (const [sessionId, deLaReunion] of porReunion) {
      if (reintentadas.length >= n) break;
      const dueno = duenos.get(sessionId) ?? null;
      if (!dueno) continue;
      const e = estadoDeLasCorridas(deLaReunion, dueno, ahora);
      if (e.leida || e.leyendo || e.fallas >= MAX_INTENTOS_DE_HECHOS) continue;
      // Solo una reunión cuya lectura terminó (la minuta, o «sin texto» en una de solo notas).
      const fila = await prisma.lecturaDeReunion.findUnique({ where: { sessionId }, select: { id: true, seguimientoEstado: true } }).catch(() => null);
      if (fila && fila.seguimientoEstado && fila.seguimientoEstado !== "lista" && fila.seguimientoEstado !== "sin_texto") continue;
      reintentadas.push(sessionId);
      const r = await leerHechosDeLaReunion(sessionId, { lecturaId: fila?.id ?? null, ahora });
      if (r.estado === "error") errores.push(`${sessionId}: ${r.error}`);
    }
    return { reintentadas, errores };
  } catch (e) {
    console.error("[hechos] el reintento falló:", e instanceof Error ? e.message : e);
    return vacio;
  }
}

/* ── El cambio de dueño ────────────────────────────────────────────────────────────── */

const SELECT_PARA_RETIRAR = {
  id: true,
  sessionId: true,
  clientId: true,
  destinos: true,
  estado: true,
  decididoPorEmail: true,
  decididoAt: true,
  nota: true,
  updatedAt: true,
  fechaDeLaReunion: true,
  session: { select: { title: true } },
} as const;

type HechoParaRetirar = Prisma.HechoDeReunionGetPayload<{ select: typeof SELECT_PARA_RETIRAR }>;

/**
 * Retira de su módulo lo que un hecho dejó delegado en un cliente que no es el suyo, y devuelve las claves que quedaron
 * retiradas (las demás siguen delegadas, y el hecho vivo para INV45):
 *   · la alerta de queja: se cierra firmada por el sistema, o pierde esa reunión si la sostienen otras;
 *   · la propuesta de la ficha: salen los campos que vinieron de esa reunión (una vez por cliente y reunión);
 *   · la etapa sugerida: se borra la pregunta si salió de esa reunión;
 *   · el vigía (lee los riesgos por el chokepoint, que ya no la ve), el avance (un borrador que revisa el CSE con todas
 *     las reuniones del proyecto) y lo demás: no hay nada que retirar.
 */
async function retirarDelegados(h: HechoParaRetirar, nota: string, ahora: Date, fichasRetiradas: Map<string, boolean>): Promise<Set<string>> {
  const retirados = new Set<string>();
  for (const d of destinosDelegados(h.destinos)) {
    try {
      const ref = d.ref;
      if (ref?.tipo === "alerta") {
        if (!h.sessionId) continue;
        const { retirarReunionDeLaAlerta } = await import("@/lib/cs/alertas-de-la-lectura-server");
        if (await retirarReunionDeLaAlerta({ alertaId: ref.id, sessionId: h.sessionId, hechoId: h.id, nota, ahora })) retirados.add(d.clave);
      } else if (ref?.tipo === "ficha") {
        if (!h.sessionId) continue;
        const clave = `${h.clientId}|${h.sessionId}`;
        if (!fichasRetiradas.has(clave)) {
          const { retirarDeLaFichaLoDeLaReunion } = await import("@/lib/clients/ficha-propuesta");
          const ok = await retirarDeLaFichaLoDeLaReunion(h.clientId, { title: h.session?.title ?? null, date: h.fechaDeLaReunion }).then(
            () => true,
            (e) => (console.error("[hechos] retirar la ficha falló:", e instanceof Error ? e.message : e), false),
          );
          fichasRetiradas.set(clave, ok);
        }
        if (fichasRetiradas.get(clave)) retirados.add(d.clave);
      } else if (ref?.tipo === "etapa") {
        if (!h.sessionId) continue;
        const { cerrarSugerenciaDeLaReunion } = await import("@/lib/projects/etapa-desde-reunion-server");
        await cerrarSugerenciaDeLaReunion(ref.projectId, h.sessionId);
        retirados.add(d.clave);
      } else {
        retirados.add(d.clave);
      }
    } catch (e) {
      console.error(`[hechos] retirar el destino ${d.clave} falló (el hecho sigue vivo para INV45):`, e instanceof Error ? e.message : e);
    }
  }
  return retirados;
}

/** Retira lo delegado y desestima lo pendiente de cada hecho, con la nota. Devuelve cuántos hechos cambiaron. */
async function retirarFilas(filas: readonly HechoParaRetirar[], nota: string, ahora: Date): Promise<number> {
  const fichasRetiradas = new Map<string, boolean>();
  let n = 0;
  for (const h of filas) {
    const retirados = await retirarDelegados(h, nota, ahora, fichasRetiradas);
    const c = desestimarPorCambioDeDueno(h, DECIDE_EL_SISTEMA, ahora, nota, retirados);
    if (c && (await escribirCambio(h.id, c, h.updatedAt))) n++;
  }
  return n;
}

/**
 * Unas reuniones cambiaron de dueño (lib/sessions/resolve-client.ts): sus hechos vivos («pendiente») de otro cliente se
 * retiran, firmados por el sistema con la nota «La reunión cambió de dueño»: lo pendiente queda desestimado y lo
 * delegado se retira de su módulo en el cliente anterior (la alerta de queja se cierra, los campos que la reunión
 * propuso salen de la propuesta de la ficha, la etapa sugerida se borra) y queda desestimado. Lo que no se pudo retirar
 * sigue delegado y el hecho vivo, así INV45 lo muestra. Lo usado no se toca: ya lo decidió una persona. El reintento del
 * job vuelve a pedir los hechos en el cliente nuevo (solo los hechos: no relee la minuta ni toca lo decidido). Corre
 * aunque la bandera esté apagada: los hechos que ya existen tienen que quedar bien. NUNCA lanza.
 */
export async function alCambiarDeDueno(cambios: ReadonlyArray<{ sessionId: string; duenoNuevo: string | null }>, ahora = new Date()): Promise<number> {
  try {
    if (!cambios.length || !(await hechosDisponible())) return 0;
    let n = 0;
    for (let i = 0; i < cambios.length; i += 500) {
      const tanda = cambios.slice(i, i + 500);
      const duenoDe = new Map(tanda.map((c) => [c.sessionId, c.duenoNuevo]));
      const vivos = await prisma.hechoDeReunion.findMany({
        where: { sessionId: { in: tanda.map((c) => c.sessionId) }, estado: "pendiente" },
        select: SELECT_PARA_RETIRAR,
      });
      n += await retirarFilas(
        vivos.filter((h) => h.sessionId && duenoDe.get(h.sessionId) !== h.clientId),
        NOTA_CAMBIO_DE_DUENO,
        ahora,
      );
    }
    return n;
  } catch (e) {
    console.error("[hechos] el cambio de dueño falló:", e instanceof Error ? e.message : e);
    return 0;
  }
}

/**
 * El remedio de INV45 (lo corre `scripts/hechos-fuera-de-su-cliente.ts --apply`): retira estos hechos con la nota que
 * dice por qué, igual que un cambio de dueño. Solo los vivos («pendiente»); lo usado no se toca. Devuelve cuántos
 * cambiaron. Lanza si la tabla no está.
 */
export async function retirarHechos(ids: readonly string[], nota: string, ahora = new Date()): Promise<number> {
  if (!ids.length) return 0;
  const filas = await prisma.hechoDeReunion.findMany({ where: { id: { in: [...ids] }, estado: "pendiente" }, select: SELECT_PARA_RETIRAR });
  return retirarFilas(filas, nota, ahora);
}

/** Escribe un cambio de estado, solo si la fila sigue como se leyó (`updatedAt`: otro escritor pudo cambiarla mientras tanto). */
async function escribirCambio(hechoId: string, c: CambioDelHecho, leidaEn: Date, reemplazaAId: string | null = null): Promise<boolean> {
  const r = await prisma.hechoDeReunion.updateMany({
    where: { id: hechoId, updatedAt: leidaEn },
    data: {
      destinos: c.destinos as unknown as Prisma.InputJsonValue,
      estado: c.estado,
      decididoPorEmail: c.decididoPorEmail,
      decididoAt: c.decididoAt,
      nota: c.nota,
      ...(reemplazaAId ? { reemplazaAId } : {}),
    },
  });
  return r.count === 1;
}

/* ── Las decisiones de una persona sobre un destino (las novedades) ───────────────── */

/**
 * Una persona decide un destino de un hecho: «Listo» o el acuerdo del chat que llevaba la novedad lo usan; «No aplica»
 * lo desestima. Solo un destino pendiente. La guarda de acceso la pone la ruta (la del documento de la pieza).
 *
 * `reemplazaAId` (acuerdos vigentes): al USAR un acuerdo, la persona puede confirmar que reemplaza a un acuerdo viejo
 * del mismo cliente y el mismo tema. Lo confirma ella al usarlo; el código nunca lo decide solo. Si no cumple (otro
 * cliente, otro tipo, otro tema, el mismo hecho), no se escribe nada.
 */
export async function decidirDestinoDeHecho(o: {
  hechoId: string;
  clave: string;
  accion: AccionSobreElDestino;
  quien: string;
  nota?: string | null;
  reemplazaAId?: string | null;
  ahora?: Date;
}): Promise<{ ok: true; estado: string } | { ok: false; motivo: "no_existe" | "ya_decidido" | "sin_sql" | "cambio" | "reemplazo_invalido" }> {
  if (!(await hechosDisponible())) return { ok: false, motivo: "sin_sql" };
  const h = await prisma.hechoDeReunion.findUnique({
    where: { id: o.hechoId },
    select: { destinos: true, estado: true, decididoPorEmail: true, decididoAt: true, nota: true, clientId: true, tipo: true, tema: true, updatedAt: true },
  });
  if (!h) return { ok: false, motivo: "no_existe" };
  let reemplazaAId: string | null = null;
  if (o.reemplazaAId) {
    const viejo = await prisma.hechoDeReunion.findUnique({ where: { id: o.reemplazaAId }, select: { id: true, clientId: true, tipo: true, tema: true } });
    const valido = o.accion === "usar" && h.tipo === "acuerdo" && !!viejo && viejo.id !== o.hechoId && viejo.clientId === h.clientId && viejo.tipo === "acuerdo" && viejo.tema === h.tema;
    if (!valido) return { ok: false, motivo: "reemplazo_invalido" };
    reemplazaAId = viejo!.id;
  }
  const c = decidirDestino(h, o.clave, o.accion, o.quien, o.ahora ?? new Date(), o.nota ?? null);
  if (!c) return { ok: false, motivo: "ya_decidido" };
  return (await escribirCambio(o.hechoId, c, h.updatedAt, reemplazaAId)) ? { ok: true, estado: c.estado } : { ok: false, motivo: "cambio" };
}

/**
 * Procesos terminó un mapeo: los hechos de cómo trabaja hoy el cliente de las reuniones que ese mapeo leyó
 * (`sessionIds`) y que existían cuando arrancó (`hasta`) quedan usados en su destino «procesos», con la corrida como
 * referencia. Los demás siguen pendientes: una reunión con solo notas o que llegó mientras mapeaba no la vio esa
 * lectura. Corre aunque la bandera esté apagada: los hechos que ya existen tienen que quedar bien. NUNCA lanza; devuelve
 * cuántos hechos cambiaron.
 */
export async function marcarProcesosUsados(o: {
  clientId: string;
  agentRunId: string;
  hasta: Date;
  sessionIds: readonly string[];
  quien: string | null;
  ahora?: Date;
}): Promise<number> {
  try {
    if (!o.sessionIds.length || !(await hechosDisponible())) return 0;
    const ahora = o.ahora ?? new Date();
    const quien = o.quien?.trim() || DECIDE_EL_SISTEMA;
    const filas = await prisma.hechoDeReunion.findMany({
      where: { clientId: o.clientId, sessionId: { in: [...o.sessionIds] }, tipo: "proceso_hoy", estado: "pendiente", createdAt: { lte: o.hasta } },
      select: { id: true, destinos: true, estado: true, decididoPorEmail: true, decididoAt: true, nota: true, updatedAt: true },
      take: 1_000,
    });
    let n = 0;
    for (const h of filas) {
      const c = decidirDestino(h, "procesos", "usar", quien, ahora, "Se volvió a mapear.");
      if (!c) continue;
      const destinos = c.destinos.map((d) => (d.clave === "procesos" ? { ...d, ref: { tipo: "procesos" as const, agentRunId: o.agentRunId } } : d));
      if (await escribirCambio(h.id, { ...c, destinos }, h.updatedAt)) n++;
    }
    return n;
  } catch (e) {
    console.error("[hechos] marcar los procesos como usados falló (no bloqueante):", e instanceof Error ? e.message : e);
    return 0;
  }
}

/* ── Los lectores ──────────────────────────────────────────────────────────────────── */

export interface RiesgoParaElVigia {
  /** Un riesgo, o una queja que no se comprobó que la dijo el cliente (`vigia.queja`): las dos las juzga el vigía. */
  tipo: "riesgo" | "queja";
  frase: string;
  cita: string;
  /** Quién la dijo, solo si lo comprobó el turno de la transcripción; null = no se sabe (una cita de las notas). */
  quien: "cliente" | "smarteam" | null;
  gravedad: string | null;
  sessionId: string | null;
  /** AAAA-MM-DD. */
  fecha: string;
  deLaCuenta: boolean;
}

/** Los tipos que pueden llegar al vigía, y la salida que lo dice (un hecho va al vigía si uno de sus destinos es «vigia»). */
const TIPOS_PARA_EL_VIGIA = ["riesgo", "queja"] as const;
const vaAlVigia = (destinos: unknown) => leerDestinos(destinos).some((d) => salidaDe(d.clave) === "vigia");

/**
 * Los riesgos (y las quejas sin comprobar) que dejó la lectura de las reuniones del cliente (de este proyecto y de la
 * cuenta), de los últimos 30 días y sin desestimar: evidencia para el juicio del vigía (nunca una alerta sola), con quién
 * la dijo. Solo de reuniones que siguen siendo del cliente (el chokepoint). Con la bandera apagada, ninguno.
 */
export async function riesgosParaElVigia(clientId: string, projectId: string | null, ahora = new Date()): Promise<RiesgoParaElVigia[]> {
  return seguro(async () => {
    const filas = await prisma.hechoDeReunion.findMany({
      where: {
        clientId,
        tipo: { in: [...TIPOS_PARA_EL_VIGIA] },
        estado: "pendiente",
        createdAt: { gte: new Date(+ahora - 30 * DIA_MS) },
        OR: [{ projectId: null }, ...(projectId ? [{ projectId, OR: [{ sessionId: null }, { session: whereVinculadaAlProyecto(projectId) }] }] : [])],
        AND: [{ OR: [{ sessionId: null }, { session: whereBelongsToClient(clientId) }] }],
      },
      orderBy: { fechaDeLaReunion: "desc" },
      take: 30,
      select: { tipo: true, frase: true, cita: true, quien: true, gravedad: true, sessionId: true, fechaDeLaReunion: true, projectId: true, destinos: true },
    });
    return filas
      .filter((f) => vaAlVigia(f.destinos))
      .slice(0, 10)
      .map((f) => ({
        tipo: f.tipo === "queja" ? ("queja" as const) : ("riesgo" as const),
        frase: f.frase,
        cita: f.cita,
        quien: f.quien === "cliente" || f.quien === "smarteam" ? f.quien : null,
        gravedad: f.gravedad,
        sessionId: f.sessionId,
        fecha: f.fechaDeLaReunion.toISOString().slice(0, 10),
        deLaCuenta: !f.projectId,
      }));
  }, []);
}

/** Los riesgos de la lectura desde `desde` (para el barrido del vigía): de quién son y cuándo se escribieron. Con la bandera apagada, ninguno. */
export async function riesgosRecientes(desde: Date): Promise<{ clientId: string; projectId: string | null; createdAt: Date }[]> {
  return seguro(async () => {
    const filas = await prisma.hechoDeReunion.findMany({
      where: { tipo: { in: [...TIPOS_PARA_EL_VIGIA] }, estado: "pendiente", createdAt: { gte: desde } },
      select: { clientId: true, projectId: true, createdAt: true, destinos: true },
      take: 2_000,
    });
    return filas.filter((f) => vaAlVigia(f.destinos)).map(({ clientId, projectId, createdAt }) => ({ clientId, projectId, createdAt }));
  }, []);
}

export interface HechoDeLaMemoriaLeido {
  tipo: TipoDeHecho;
  tema: string | null;
  frase: string;
  estado: "usado" | "pendiente";
  reunion: { titulo: string; fecha: string } | null;
}

const TOPE_DE_HECHOS_EN_LA_MEMORIA = 24;

/**
 * Los hechos para la memoria INTERNA (lib/memoria/cargar.ts): de la cuenta (`projectId` null) o de un proyecto. Los
 * usados, y los pendientes que esperan a una persona (sin vencer); nunca los que quedaron solo delegados (ya están en su
 * destino), ni los desestimados. Sin la cita: la frase alcanza. Solo de reuniones que siguen siendo del cliente (y, en
 * un proyecto, que siguen vinculadas a él). Con la bandera apagada, ninguno.
 */
export async function hechosParaLaMemoria(clientId: string, projectId: string | null, ahora = new Date()): Promise<HechoDeLaMemoriaLeido[]> {
  return seguro(async () => {
    const filas = await prisma.hechoDeReunion.findMany({
      where: {
        clientId,
        projectId: projectId ?? null,
        estado: { in: ["usado", "pendiente"] },
        tipo: { notIn: ["senal_cronograma", "senal_etapa"] },
        AND: [
          { OR: [{ sessionId: null }, { session: whereBelongsToClient(clientId) }] },
          ...(projectId ? [{ OR: [{ sessionId: null }, { session: whereVinculadaAlProyecto(projectId) }] }] : []),
        ],
      },
      orderBy: { fechaDeLaReunion: "desc" },
      take: TOPE_DE_HECHOS_EN_LA_MEMORIA * 3,
      // Solo el título y la fecha de la reunión, para rotular lo propuesto: nunca su contenido.
      select: { tipo: true, tema: true, frase: true, estado: true, createdAt: true, destinos: true, fechaDeLaReunion: true, session: { select: { title: true } } },
    });
    const out: HechoDeLaMemoriaLeido[] = [];
    for (const f of filas) {
      if (out.length >= TOPE_DE_HECHOS_EN_LA_MEMORIA) break;
      const destinos: DestinoDelHecho[] = leerDestinos(f.destinos);
      if (f.estado === "pendiente" && (estaVencido(f, ahora) || soloDelegado(destinos) || !esperaAUnaPersona(destinos))) continue;
      out.push({
        tipo: f.tipo as TipoDeHecho,
        tema: f.tema,
        frase: f.frase,
        estado: f.estado === "usado" ? "usado" : "pendiente",
        reunion: { titulo: f.session?.title ?? "una reunión", fecha: f.fechaDeLaReunion.toISOString().slice(0, 10) },
      });
    }
    return out;
  }, []);
}
