import "server-only";
/**
 * lib/procesos/agente.ts — EL AGENTE DE PROCESOS: LEE CADA REUNIÓN ENTERA Y ARMA HOY Y DESPUÉS.
 *
 * Reemplaza al agente `agent-mapeo-inicial` (retirado en lib/agents/retirados.ts), que leía las notas
 * de Gemini cortadas a 9.000 caracteres por reunión, no marcaba supuestos y dibujaba la configuración
 * de HubSpot como si fuera el proceso actual. Medido con el prototipo el 2026-10-05: ver
 * docs/DECISIONS.md «Procesos: un mapa de hoy y uno de después, en carriles».
 *
 * Corre en segundo plano (el servidor es un solo proceso de larga vida, RUNBOOK invariante #1) y deja
 * su avance en un AgentRun `procesos-mapeo` que la pantalla consulta. Las sesiones salen SOLO del
 * chokepoint (`getClientSessions`, invariante #1 de CLAUDE.md). La lectura de cada reunión se guarda
 * en un AgentRun `procesos-lectura` por reunión y no se vuelve a pagar: al volver a mapear, solo se
 * leen las nuevas.
 */
import type { Prisma } from "@prisma/client";
import { getAnthropic } from "@/lib/anthropic";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { parseObject } from "@/lib/ai/section-schema";
import { prisma } from "@/lib/db/prisma";
import { ensureProcesosSection } from "@/lib/canvas/sync-procesos-blocks";
import { proyectoClasificableWhere } from "@/lib/projects/scope";
import { getClientSessions } from "@/lib/sessions/project-sources";
import { citaAparece, prepararReunion, verificarPasos, type ReunionParaCitar } from "./citas";
import {
  AREAS,
  esIndiceDeProcesos,
  esMapaAnterior,
  esMapaDeCarriles,
  FORMATO_INDICE,
  FORMATO_MAPA,
  slugDeProceso,
  type AreaDelProceso,
  type IndiceDeProcesos,
  type MapaDeProceso,
} from "./mapa";
import { normalizarRespuesta, respuestaDelMapaSchema } from "./respuesta";
import {
  bloqueDeHechos,
  encabezadoDelCliente,
  ESQUEMA_DE_LECTURA,
  mensajeDeLectura,
  MODELO_DE_PROCESOS,
  SISTEMA_DE_LECTURA,
  SISTEMA_DE_PROCESOS,
  SISTEMA_DEL_MAPA,
  type Hecho,
  type LecturaDeReunion,
} from "./prompts";

export const SLUG_DEL_MAPEO = "procesos-mapeo";
export const SLUG_DE_LA_LECTURA = "procesos-lectura";
/** Cuántas reuniones lee como máximo (las más recientes con transcripción). */
export const MAX_REUNIONES = 40;
/** Una reunión con menos texto que esto no tiene transcripción de verdad. */
const MIN_TRANSCRIPCION = 2000;
/** Una corrida que lleva más que esto «en curso» murió con el proceso (un deploy, un reinicio). */
const CORRIDA_VENCIDA_MS = 45 * 60 * 1000;
const EN_PARALELO_LECTURA = 5;
const EN_PARALELO_MAPAS = 4;

/** Corre `fn` sobre cada elemento con como mucho `n` a la vez, en orden de llegada. */
async function enParalelo<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < items.length) {
      const i = siguiente++;
      try {
        out[i] = { status: "fulfilled", value: await fn(items[i], i) };
      } catch (e) {
        out[i] = { status: "rejected", reason: e };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, trabajador));
  return out;
}

async function pedir(params: { system: string; user: string; maxTokens: number; effort: "medium" | "high"; esquema?: Record<string, unknown> }): Promise<string> {
  const msg = await getAnthropic()
    .messages.stream({
      model: MODELO_DE_PROCESOS,
      max_tokens: params.maxTokens,
      thinking: { type: "adaptive" },
      output_config: params.esquema ? { effort: params.effort, format: { type: "json_schema", schema: params.esquema } } : { effort: params.effort },
      system: params.system,
      messages: [{ role: "user", content: params.user }],
    })
    .finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("El modelo no quiso leer este material.");
  if (msg.stop_reason === "max_tokens") throw new Error("La respuesta se cortó.");
  return msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
}

async function fase(runId: string, texto: string) {
  await prisma.agentRun.update({ where: { id: runId }, data: { currentPhase: texto } }).catch(() => undefined);
}

/** Lo que el agente lee además de las reuniones: qué se vendió y lo que dice la planificación. */
async function contextoDelCliente(clientId: string): Promise<string> {
  const cliente = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
  const proyectos = await prisma.project.findMany({
    // Los mismos proyectos que un agente ve como contexto del cliente (lib/projects/scope.ts).
    where: proyectoClasificableWhere({ clientId }),
    select: { id: true, name: true, tags: true, handoffResumen: true },
    orderBy: { createdAt: "desc" },
    take: 6,
  });
  const bloquesDePlan = await prisma.canvasBlock.findMany({
    where: { section: { key: "definicion_procesos", canvas: { slug: "planning", projectId: { in: proyectos.map((p) => p.id) } } } },
    select: { data: true },
  });
  const plan: string[] = [];
  for (const b of bloquesDePlan) {
    const d = b.data as { procesos?: { nombre?: string; comoSera?: string; pasos?: { paso?: string }[] }[] } | null;
    for (const p of d?.procesos ?? []) {
      const pasos = (p.pasos ?? []).map((x) => x.paso).filter(Boolean).join(" → ");
      plan.push(`- ${p.nombre ?? "(sin nombre)"}: ${pasos || p.comoSera || ""}`.slice(0, 900));
    }
  }
  return encabezadoDelCliente({
    cliente: cliente?.name ?? "(cliente)",
    proyectos: proyectos.map((p) => ({ nombre: p.name, tags: p.tags, queSeVendio: p.handoffResumen })),
    planificacion: plan.join("\n"),
  });
}

type ReunionDelCliente = { id: string; titulo: string; fecha: string; participantes: string[]; transcript: string };

async function reunionesDelCliente(clientId: string): Promise<ReunionDelCliente[]> {
  const sesiones = await getClientSessions(clientId, { take: 200 });
  const porId = new Map(sesiones.map((s) => [s.id, s]));
  const filas = await prisma.firefliesSession.findMany({
    // Los ids ya vienen del chokepoint (solo las ocurridas); el techo de fecha se repite acá porque
    // esta consulta es la que lleva la transcripción al modelo (censo de lib/sessions/ocurridas.test.ts).
    where: { id: { in: sesiones.map((s) => s.id) }, date: { lte: new Date() } },
    select: { id: true, title: true, date: true, transcript: true },
  });
  return filas
    .filter((f) => (f.transcript ?? "").length >= MIN_TRANSCRIPCION)
    .sort((a, b) => +b.date - +a.date)
    .slice(0, MAX_REUNIONES)
    .sort((a, b) => +a.date - +b.date)
    .map((f) => ({
      id: f.id,
      titulo: f.title,
      fecha: f.date.toISOString().slice(0, 10),
      participantes: porId.get(f.id)?.participants ?? [],
      transcript: f.transcript ?? "",
    }));
}

/** Lo leído de cada reunión, guardado: el AgentRun más reciente de lectura por reunión. */
async function lecturasGuardadas(clientId: string, ids: string[]): Promise<Map<string, LecturaDeReunion>> {
  const filas = await prisma.agentRun.findMany({
    where: { clientId, agentSlug: SLUG_DE_LA_LECTURA, status: "DONE", sourceSessionIds: { hasSome: ids } },
    orderBy: { createdAt: "desc" },
    select: { sourceSessionIds: true, output: true },
  });
  const out = new Map<string, LecturaDeReunion>();
  for (const f of filas) {
    const id = f.sourceSessionIds[0];
    if (!id || out.has(id) || !f.output) continue;
    try {
      const l = JSON.parse(f.output) as LecturaDeReunion;
      if (Array.isArray(l.hechos)) out.set(id, l);
    } catch {
      /* una lectura ilegible se vuelve a leer */
    }
  }
  return out;
}

async function leerReunion(clientId: string, cliente: string, r: ReunionDelCliente, reunion: ReunionParaCitar, triggeredByEmail: string | null): Promise<LecturaDeReunion> {
  const crudo = await pedir({
    system: SISTEMA_DE_LECTURA,
    user: mensajeDeLectura({ cliente, titulo: r.titulo, fecha: r.fecha, participantes: r.participantes, transcript: r.transcript }),
    maxTokens: 32000,
    effort: "medium",
    esquema: ESQUEMA_DE_LECTURA as unknown as Record<string, unknown>,
  });
  const leido = parseObject(crudo) as Partial<LecturaDeReunion>;
  // Un hecho cuya cita no está en la transcripción no entra: ni siquiera llega a los mapas.
  const hechos = (Array.isArray(leido.hechos) ? leido.hechos : []).filter(
    (h): h is Hecho => !!h && typeof h.cita === "string" && typeof h.proceso === "string" && citaAparece(reunion, h.cita),
  );
  const lectura: LecturaDeReunion = { procesos: Array.isArray(leido.procesos) ? leido.procesos : [], hechos };
  await prisma.agentRun.create({
    data: {
      agentId: null,
      agentSlug: SLUG_DE_LA_LECTURA,
      clientId,
      status: "DONE",
      sourceSessionIds: [r.id],
      output: JSON.stringify(lectura),
      triggeredByEmail,
      stepLabel: `Lectura de «${r.titulo}»`,
    },
  });
  return lectura;
}

export type ResultadoDelMapeo = { procesos: number; respetados: number; reuniones: number; leidasAhora: number; hechos: number; citas: number; citasOk: number; bajados: number };

async function mapear(runId: string, clientId: string, triggeredByEmail: string | null): Promise<ResultadoDelMapeo> {
  const cliente = (await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } }))?.name ?? "(cliente)";
  await fase(runId, "Buscando las reuniones del cliente");
  const reuniones = await reunionesDelCliente(clientId);
  if (reuniones.length === 0) throw new Error("El cliente no tiene reuniones con transcripción para leer.");
  const preparadas = new Map(reuniones.map((r) => [r.id, prepararReunion(r)]));
  const guardadas = await lecturasGuardadas(clientId, reuniones.map((r) => r.id));
  const faltan = reuniones.filter((r) => !guardadas.has(r.id));
  let leidas = 0;
  await fase(runId, faltan.length ? `Leyendo ${faltan.length} reuniones enteras (de ${reuniones.length})` : `Usando las ${reuniones.length} reuniones ya leídas`);
  const resultados = await enParalelo(faltan, EN_PARALELO_LECTURA, async (r) => {
    const l = await leerReunion(clientId, cliente, r, preparadas.get(r.id)!, triggeredByEmail);
    leidas++;
    await fase(runId, `Leyendo reuniones enteras: ${leidas} de ${faltan.length}`);
    return l;
  });
  resultados.forEach((res, i) => {
    if (res.status === "fulfilled") guardadas.set(faltan[i].id, res.value);
    else console.error(`[procesos] no se pudo leer «${faltan[i].titulo}»:`, res.reason instanceof Error ? res.reason.message : res.reason);
  });

  const lecturas = reuniones
    .filter((r) => guardadas.has(r.id))
    .map((r, i) => ({ clave: `S${i + 1}`, id: r.id, titulo: r.titulo, fecha: r.fecha, hechos: guardadas.get(r.id)!.hechos }));
  const hechos = lecturas.reduce((n, l) => n + l.hechos.length, 0);
  if (hechos === 0) throw new Error("Las reuniones no tienen hechos de proceso: no hay con qué armar un mapa.");
  const reunionPorClave = new Map(lecturas.map((l) => [l.clave, preparadas.get(l.id)!]));

  await fase(runId, `Juntando ${hechos} hechos en procesos`);
  const encabezado = await contextoDelCliente(clientId);
  const lista = parseObject(
    await pedir({ system: SISTEMA_DE_PROCESOS, user: `${encabezado}\n\n=== HECHOS DE LAS REUNIONES ===\n${bloqueDeHechos(lecturas)}`, maxTokens: 32000, effort: "high" }),
  ) as { resumen?: string; procesos?: { id?: string; nombre?: string; area?: string; queResuelve?: string; incluye?: string[] }[]; sinMapear?: { nombre?: string; falta?: string }[] };
  const procesos = (lista.procesos ?? []).filter((p) => p?.nombre).slice(0, 6);
  if (procesos.length === 0) throw new Error("El agente no encontró procesos con sustancia en las reuniones.");

  // Los mapas editados a mano no se pisan: el agente no rehace un proceso con el mismo id.
  const seccionId = await ensureProcesosSection(clientId);
  const existentes = await prisma.canvasBlock.findMany({
    where: { sectionId: seccionId },
    select: { id: true, blockType: true, source: true, data: true, agentRun: { select: { agentId: true } } },
  });
  const respetados = new Set(
    existentes.filter((b) => b.source !== "AGENT" && esMapaDeCarriles(b.data)).map((b) => (b.data as unknown as MapaDeProceso).id),
  );

  let terminados = 0;
  await fase(runId, `Armando ${procesos.length} procesos: hoy y después`);
  const generadoEn = new Date().toISOString();
  const totales = { citas: 0, citasOk: 0, bajados: 0 };
  const mapas = await enParalelo(procesos, EN_PARALELO_MAPAS, async (p) => {
    const id = slugDeProceso(p.id || p.nombre || "");
    if (respetados.has(id)) return null;
    const nombres = new Set(p.incluye ?? []);
    const crudo = await pedir({
      system: SISTEMA_DEL_MAPA,
      user: `${encabezado}\n\n=== EL PROCESO ===\n${p.nombre} (${p.area ?? ""}): ${p.queResuelve ?? ""}\n\n=== HECHOS DE ESTE PROCESO ===\n${bloqueDeHechos(lecturas, (h) => nombres.has(h.proceso))}`,
      maxTokens: 32000,
      effort: "high",
    });
    const r = normalizarRespuesta(respuestaDelMapaSchema.parse(parseObject(crudo)));
    const hoy = verificarPasos(r.hoy.pasos, reunionPorClave, "hoy");
    const despues = verificarPasos(r.despues.pasos, reunionPorClave, "despues");
    totales.citas += hoy.citas + despues.citas;
    totales.citasOk += hoy.citasOk + despues.citasOk;
    totales.bajados += hoy.bajados + despues.bajados;
    terminados++;
    await fase(runId, `Armando procesos: ${terminados} de ${procesos.length}`);
    const area = (AREAS as readonly string[]).includes(p.area ?? "") ? (p.area as AreaDelProceso) : "operacion";
    const mapa: MapaDeProceso = {
      formato: FORMATO_MAPA,
      id,
      nombre: (p.nombre ?? "").slice(0, 120),
      area,
      queResuelve: (p.queResuelve ?? "").slice(0, 300),
      hoy: { ...r.hoy, pasos: hoy.pasos },
      despues: { ...r.despues, pasos: despues.pasos },
      cambios: r.cambios,
      preguntas: r.preguntas,
      estado: "borrador",
      generadoEn,
    };
    return mapa;
  });
  const listos = mapas.flatMap((m) => (m.status === "fulfilled" && m.value ? [m.value] : []));
  const fallidos = mapas.filter((m) => m.status === "rejected").length;
  if (listos.length === 0 && respetados.size === 0) throw new Error("No se pudo armar ningún mapa. Vuelve a intentarlo.");
  if (fallidos) console.error(`[procesos] ${fallidos} proceso(s) no se pudieron armar`, mapas.filter((m) => m.status === "rejected").map((m) => (m as PromiseRejectedResult).reason));

  const indice: IndiceDeProcesos = {
    formato: FORMATO_INDICE,
    resumen: (lista.resumen ?? "").trim().slice(0, 1200),
    porLevantar: (lista.sinMapear ?? []).filter((x) => x?.nombre).slice(0, 6).map((x) => ({ nombre: String(x.nombre).slice(0, 120), falta: String(x.falta ?? "").slice(0, 300) })),
    sesiones: lecturas.map((l) => ({ id: l.id, titulo: l.titulo, fecha: l.fecha, hechos: l.hechos.length })),
    generadoEn,
  };

  // Se reemplaza lo que escribió un agente: los mapas nuevos sin editar, el índice y lo que dejó el
  // agente viejo sin que nadie lo tocara. Lo editado a mano queda (los mapas viejos editados se ven
  // en «Mapas del formato anterior»).
  const aBorrar = existentes
    .filter((b) => {
      if (esIndiceDeProcesos(b.data)) return true;
      if (b.source !== "AGENT") return false;
      if (esMapaDeCarriles(b.data)) return true;
      return b.agentRun?.agentId === "agent-mapeo-inicial" && (esMapaAnterior(b.data) || b.blockType === "TEXT");
    })
    .map((b) => b.id);
  await prisma.$transaction(async (tx) => {
    if (aBorrar.length) await tx.canvasBlock.deleteMany({ where: { id: { in: aBorrar } } });
    await tx.canvasBlock.create({
      data: { sectionId: seccionId, blockType: "CARD", content: "Procesos · lo que leyó el agente", data: indice as unknown as Prisma.InputJsonValue, order: 0, source: "AGENT", status: "CONFIRMED", agentRunId: runId },
    });
    let orden = 1;
    for (const m of listos) {
      await tx.canvasBlock.create({
        data: { sectionId: seccionId, blockType: "FLOWCHART", content: m.nombre, data: m as unknown as Prisma.InputJsonValue, order: orden++, source: "AGENT", status: "DRAFT", agentRunId: runId },
      });
    }
  });
  return { procesos: listos.length, respetados: respetados.size, reuniones: lecturas.length, leidasAhora: faltan.length, hechos, ...totales };
}

/** La corrida en curso (o la última) del cliente. Una «en curso» de hace demasiado se da por muerta. */
export async function ultimaCorrida(clientId: string) {
  const r = await prisma.agentRun.findFirst({
    where: { clientId, agentSlug: SLUG_DEL_MAPEO },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, currentPhase: true, output: true, createdAt: true, updatedAt: true, triggeredByEmail: true },
  });
  if (!r) return null;
  const vencida = r.status === "RUNNING" && Date.now() - +r.updatedAt > CORRIDA_VENCIDA_MS;
  return { ...r, status: vencida ? ("ERROR" as const) : r.status, currentPhase: vencida ? "Se cortó: el servidor se reinició mientras mapeaba." : r.currentPhase };
}

/**
 * Arranca el mapeo en segundo plano y devuelve la corrida. Si ya hay una en curso para el cliente,
 * devuelve esa: no se pagan dos lecturas iguales.
 */
export async function iniciarMapeo(clientId: string, triggeredByEmail: string | null): Promise<{ runId: string; yaCorria: boolean }> {
  const enCurso = await ultimaCorrida(clientId);
  if (enCurso && enCurso.status === "RUNNING") return { runId: enCurso.id, yaCorria: true };
  const run = await prisma.agentRun.create({
    data: { agentId: null, agentSlug: SLUG_DEL_MAPEO, clientId, status: "RUNNING", currentPhase: "Arrancando", triggeredByEmail, stepLabel: "Mapeo de procesos" },
    select: { id: true },
  });
  void conContextoDeIA({ agentSlug: SLUG_DEL_MAPEO, agentRunId: run.id, clientId, triggeredByEmail }, async () => {
    try {
      const resultado = await mapear(run.id, clientId, triggeredByEmail);
      await prisma.agentRun.update({ where: { id: run.id }, data: { status: "DONE", currentPhase: null, output: JSON.stringify(resultado) } });
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : "El mapeo falló.";
      console.error("[procesos] mapeo falló:", e);
      await prisma.agentRun.update({ where: { id: run.id }, data: { status: "ERROR", currentPhase: mensaje.slice(0, 300) } }).catch(() => undefined);
    }
  });
  return { runId: run.id, yaCorria: false };
}
