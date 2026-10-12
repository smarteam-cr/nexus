/**
 * lib/memoria/cargar.ts — EL ÚNICO CARGADOR DE LA MEMORIA DE LA CUENTA Y DEL PROYECTO. SERVIDOR.
 *
 * Lee lo que ya se sabe (la ficha, los procesos, la historia, lo fuera de alcance, la preventa, la auditoría del
 * portal; del proyecto, lo que dejó cada reunión, los compromisos abiertos, las desviaciones y los resultados) y se lo
 * pasa al armador puro (lib/memoria/armar.ts), que decide qué entra según el alcance de quien lee
 * (lib/memoria/consumidores.ts). Un agente nuevo llama acá: no arma su propio contexto de la cuenta, y ninguno vuelve a
 * leer todas las reuniones (DECISIONS «La memoria de la cuenta y del proyecto: un solo cargador»).
 *
 * Reglas de lectura:
 *   · Las reuniones salen SOLO del chokepoint (`getProjectMemberSessions`: incluidas, del cliente, desde el piso) y solo
 *     las que ya ocurrieron; su contenido, con UNA consulta (resumen y minuta, nunca la transcripción).
 *   · Los compromisos salen de Tareas SOLO por lib/tareas/para-agentes.ts, y solo en el alcance interno.
 *   · Lo de la preventa, solo por lib/exploraciones/para-la-memoria.ts, y solo en el alcance interno.
 *   · Lo que no va a usar el alcance ni se pide a la base (`queCargar`).
 *   · ⛔ Nunca: facturación, Partner (montos o uso), rentabilidad, salarios, el monto de un pedido fuera de alcance, el
 *     `sourceQuote` ni quién creó una desviación. Lo vigila lib/memoria/frontera.test.ts.
 *
 * Nunca tira: lo que falla se omite con `console.error` y la memoria sale con lo demás.
 */
import "server-only";
import { conteoDeLaFicha, leerFicha } from "@/lib/clients/ficha";
import { getSessionCategories } from "@/lib/cache/session-categories";
import { ENTREGA_PREVIA_KEYS, loadCanvasContext } from "@/lib/canvas/load-canvas-context";
import { resumenDeReunion } from "@/lib/contexto/material-cronograma";
import { prisma } from "@/lib/db/prisma";
import { ETIQUETA_DE_DECISION, ETIQUETA_DE_SECCION, leerFoto } from "@/lib/auditoria-portal/foto";
import { loAprendidoEnLaPreventa, ultimaPreventa } from "@/lib/exploraciones/para-la-memoria";
import { resolverDuenioDelHandoff } from "@/lib/handoff/duenio";
import { TIPO_CONGELADO, TIPO_REHECHO, viaDelMotivo } from "@/lib/handoff/congelado";
import { resultadosDelProyecto } from "@/lib/handoff/resultados";
import { canvasOf, canvasOfNested } from "@/lib/pieces/canvas-query";
import { esMapaAnterior, esMapaDeCarriles } from "@/lib/procesos/mapa";
import { SENTINEL_SERVICE_TYPE } from "@/lib/projects/kind";
import { NO_ES_CONTENEDOR_WHERE } from "@/lib/projects/scope";
import { buildInternalDomainsSet } from "@/lib/sessions/categorize";
import { DOMINIO_PROPIO } from "@/lib/sessions/dominio-propio";
import { etiquetaDeSala } from "@/lib/sessions/etiqueta-de-sala";
import { soloOcurridas } from "@/lib/sessions/ocurridas";
import { getProjectMemberSessions } from "@/lib/sessions/project-sources";
import { COLUMNA_DEL_DESTINO, type DestinoSugerido } from "@/lib/sessions/destinos-de-contexto";
import { compromisosAbiertosParaAgentes } from "@/lib/tareas/para-agentes";
import { esCerrada } from "@/lib/timeline/particularidad-state";
import { armarLoEsencial, armarMemoriaDeLaCuenta, armarMemoriaDelProyecto, resumirMapa, TOPES_DE_LA_MEMORIA } from "./armar";
import { consumidorDeLaMemoria, queCargar, type LectorDeMemoria } from "./consumidores";
import type {
  AuditoriaDeLaMemoria,
  ClaveDeParte,
  DatosDeLaCuenta,
  DesviacionDeLaMemoria,
  HechoDeLaMemoria,
  LoQueSabeLaIADeLaMemoria,
  MemoriaArmada,
  PedidoDeLaMemoria,
  ProcesoDeLaMemoria,
  QueCargar,
  ReunionDeLaMemoria,
  SeccionDeLoEsencial,
} from "./tipos";

const VACIA: MemoriaArmada = { texto: "", partes: [] };

/** Los estados de un pedido fuera de alcance que ya no están en juego. */
const PEDIDOS_CERRADOS = ["DESCARTADO", "INCLUIDO"];

/** Los tipos de hito del congelado del handoff (etapa 3b, DECISIONS «El handoff se congela», lib/handoff/congelado.ts). */
const HITO_CONGELADO = TIPO_CONGELADO;
const HITO_REHECHO = TIPO_REHECHO;

async function seguro<T>(que: string, leer: () => Promise<T>, porDefecto: T): Promise<T> {
  try {
    return await leer();
  } catch (e) {
    console.error(`[memoria] no se pudo leer ${que}`, e);
    return porDefecto;
  }
}

/** Los dominios de la casa, para saber si una reunión fue con el cliente. Smarteam siempre cuenta, aunque falle la caché. */
async function dominiosPropios(): Promise<Set<string>> {
  try {
    return new Set([DOMINIO_PROPIO, ...buildInternalDomainsSet(await getSessionCategories())]);
  } catch {
    return new Set([DOMINIO_PROPIO]);
  }
}

/** Los ítems de un campo Json de la minuta: [{ text }] o strings. */
function itemsDeMinuta(v: unknown): string[] {
  if (!Array.isArray(v)) return typeof v === "string" && v.trim() ? [v.trim()] : [];
  return v
    .map((x) =>
      typeof x === "string" ? x : x && typeof x === "object" && typeof (x as { text?: unknown }).text === "string" ? (x as { text: string }).text : "",
    )
    .map((s) => s.trim())
    .filter(Boolean);
}

// ── La cuenta ───────────────────────────────────────────────────────────────────────────────

async function leerProcesos(clientId: string, q: QueCargar): Promise<ProcesoDeLaMemoria[]> {
  const bloques = await prisma.canvasBlock.findMany({
    where: {
      blockType: "FLOWCHART",
      section: { key: "procesos", canvas: canvasOfNested("client-info", { project: { clientId, serviceType: SENTINEL_SERVICE_TYPE } }) },
    },
    orderBy: { order: "asc" },
    select: { content: true, data: true },
  });
  const out: ProcesoDeLaMemoria[] = [];
  for (const b of bloques) {
    const data: unknown = b.data;
    if (esMapaDeCarriles(data)) out.push(resumirMapa(data));
    else if (q.procesosSinValidar && esMapaAnterior(data)) {
      out.push({ nombre: b.content?.trim() || "(sin título)", estado: "anterior", queResuelve: "", dolores: [] });
    }
  }
  return out;
}

/** La última Entrega PUBLICADA de otro proyecto del cliente (solo las secciones de historia, solo lo confirmado). */
async function leerEntregaPublicada(clientId: string, proyectoActualId: string | null): Promise<DatosDeLaCuenta["entrega"]> {
  const canvas = await prisma.projectCanvas.findFirst({
    where: {
      ...canvasOf("delivery"),
      publishedSnapshotAt: { not: null },
      project: { clientId, ...NO_ES_CONTENEDOR_WHERE, esPrueba: false, ...(proyectoActualId ? { id: { not: proyectoActualId } } : {}) },
    },
    orderBy: { publishedSnapshotAt: "desc" },
    select: { projectId: true, project: { select: { name: true } } },
  });
  if (!canvas?.projectId || !canvas.project) return null;
  const texto = await loadCanvasContext(canvas.projectId, "delivery", { onlyConfirmed: true, includeKeys: ENTREGA_PREVIA_KEYS });
  return texto.trim() ? { proyecto: canvas.project.name, texto } : null;
}

async function leerFueraDeAlcance(clientId: string): Promise<PedidoDeLaMemoria[]> {
  // ⛔ Sin `monto` ni `cita`: lo que se cotizó es plata de la cuenta, y la cita es de la reunión.
  const filas = await prisma.pedidoFueraDeAlcance.findMany({
    where: { clientId, estado: { notIn: PEDIDOS_CERRADOS } },
    orderBy: { createdAt: "desc" },
    take: TOPES_DE_LA_MEMORIA.pedidos,
    select: { pedido: true, estado: true, quienLoPidio: true, createdAt: true, project: { select: { name: true } } },
  });
  return filas.map((f) => ({
    pedido: f.pedido,
    estado: f.estado,
    proyecto: f.project?.name ?? null,
    quienLoPidio: f.quienLoPidio,
    fecha: f.createdAt.toISOString(),
  }));
}

/** La auditoría del portal más reciente del cliente que tenga hallazgos CONFIRMADOS por una persona. */
async function leerAuditoria(clientId: string): Promise<AuditoriaDeLaMemoria | null> {
  const filas = await prisma.audit.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { name: true, createdAt: true, data: true },
  });
  for (const a of filas) {
    const analisis = leerFoto(a.data)?.analisis;
    if (!analisis) continue;
    const hallazgos = analisis.hallazgos
      .filter((h) => h.estado === "confirmado")
      .map((h) => ({
        seccion: ETIQUETA_DE_SECCION[h.seccion] ?? h.seccion,
        titulo: h.titulo,
        hallazgo: h.hallazgo,
        decision: ETIQUETA_DE_DECISION[h.decision] ?? h.decision,
      }));
    if (!hallazgos.length) continue;
    return { nombre: a.name, fecha: a.createdAt.toISOString(), estado: analisis.estado?.titular ?? null, hallazgos };
  }
  return null;
}

async function cargarDatosDeLaCuenta(
  clientId: string,
  q: QueCargar,
  opts: { proyectoActualId: string | null; sinPartes: ReadonlySet<ClaveDeParte> },
): Promise<DatosDeLaCuenta | null> {
  const [cliente, procesos, entrega, fueraDeAlcance, preventa, auditoria, hechos] = await Promise.all([
    seguro(
      "el cliente",
      () =>
        prisma.client.findUnique({
          where: { id: clientId },
          select: {
            name: true,
            ficha: true,
            projects: {
              where: { ...NO_ES_CONTENEDOR_WHERE, esPrueba: false }, // un proyecto de prueba no es historia
              orderBy: { createdAt: "desc" },
              take: TOPES_DE_LA_MEMORIA.proyectos,
              select: { id: true, name: true, serviceType: true, status: true, createdAt: true, hubspotDealId: true },
            },
          },
        }),
      null,
    ),
    opts.sinPartes.has("procesos") ? Promise.resolve([]) : seguro("los procesos", () => leerProcesos(clientId, q), []),
    opts.sinPartes.has("historia") ? Promise.resolve(null) : seguro("la entrega publicada", () => leerEntregaPublicada(clientId, opts.proyectoActualId), null),
    q.fueraDeAlcance && !opts.sinPartes.has("fueraDeAlcance") ? seguro("lo fuera de alcance", () => leerFueraDeAlcance(clientId), []) : Promise.resolve([]),
    q.preventa && !opts.sinPartes.has("preventa")
      ? seguro("lo aprendido en la preventa", () => loAprendidoEnLaPreventa(clientId, { tope: TOPES_DE_LA_MEMORIA.partes.preventa }), null)
      : Promise.resolve(null),
    q.auditoria && !opts.sinPartes.has("auditoria") ? seguro("la auditoría del portal", () => leerAuditoria(clientId), null) : Promise.resolve(null),
    q.hechos && !opts.sinPartes.has("hechos") ? seguro("los hechos de la cuenta", () => leerHechos(clientId, null), []) : Promise.resolve([]),
  ]);
  if (!cliente) return null;
  return {
    cliente: { nombre: cliente.name },
    ficha: leerFicha(cliente.ficha),
    procesos,
    proyectos: cliente.projects.map((p) => ({
      id: p.id,
      nombre: p.name,
      tipo: p.serviceType,
      estado: p.status,
      desde: p.createdAt.toISOString(),
      tratoId: q.idsDeTrato ? p.hubspotDealId : null,
    })),
    entrega,
    fueraDeAlcance,
    preventa,
    auditoria,
    hechos,
  };
}

/**
 * Los hechos de las reuniones (memoria de la cuenta, etapa 6), por la ÚNICA puerta de lectura de los hechos
 * (lib/seguimiento/hechos-server.ts). Import dinámico: el alcance del cliente ni lo carga. Sin la tabla, vacío.
 */
async function leerHechos(clientId: string, projectId: string | null): Promise<HechoDeLaMemoria[]> {
  const { hechosParaLaMemoria } = await import("@/lib/seguimiento/hechos-server");
  return hechosParaLaMemoria(clientId, projectId);
}

/**
 * LA MEMORIA DE LA CUENTA para un lector declarado en lib/memoria/consumidores.ts. Con `projectId` (cuando se lee desde
 * un proyecto), ese proyecto se marca en la historia y su propia entrega no cuenta como «lo que se entregó antes».
 * Texto "" si no hay nada que decir.
 */
export async function memoriaDeLaCuenta(
  clientId: string,
  opts: { lector: LectorDeMemoria; projectId?: string | null },
): Promise<MemoriaArmada> {
  const c = consumidorDeLaMemoria(opts.lector);
  const sinPartes = new Set(c.sinPartes ?? []);
  const datos = await cargarDatosDeLaCuenta(clientId, queCargar(c.alcance), { proyectoActualId: opts.projectId ?? null, sinPartes });
  if (!datos) return VACIA;
  return armarMemoriaDeLaCuenta(datos, {
    alcance: c.alcance,
    excluirOrigenes: c.excluirOrigenes,
    sinPartes: c.sinPartes,
    proyectoActualId: opts.projectId ?? null,
    pieza: c.pieza,
  });
}

// ── El proyecto ─────────────────────────────────────────────────────────────────────────────

/**
 * Las reuniones del proyecto que este lector puede recibir por la memoria. Con `destino` (el «Contexto adicional» de su
 * documento), las que el CSE desestimó o sacó de ESE documento (`override` false en su columna) no vuelven por acá.
 * Las que nadie eligió (null: desde la etapa 7 su material lee solo las elegidas) y las que no entraron a su material
 * por espacio sí: en resumen, nunca como transcripción, y con la regla del alcance (en un documento del cliente, solo
 * los acuerdos y las decisiones de las minutas revisadas: una reunión sin minuta revisada no llega).
 */
export function reunionesQueRespetanLaX<S extends Partial<Record<(typeof COLUMNA_DEL_DESTINO)[DestinoSugerido], boolean | null>>>(
  sesiones: readonly S[],
  destino: DestinoSugerido | undefined,
): S[] {
  if (!destino) return [...sesiones];
  const columna = COLUMNA_DEL_DESTINO[destino];
  return sesiones.filter((s) => s[columna] !== false);
}

async function leerReunionesDelProyecto(
  projectId: string,
  q: QueCargar,
  yaLeidas: ReadonlySet<string>,
  destino: DestinoSugerido | undefined,
): Promise<ReunionDeLaMemoria[]> {
  const [{ sessions }, dominios] = await Promise.all([getProjectMemberSessions(projectId), dominiosPropios()]);
  const ahora = Date.now();
  const candidatas = soloOcurridas(reunionesQueRespetanLaX(sessions, destino), ahora)
    .filter((s) => !yaLeidas.has(s.id))
    .map((s) => ({ s, sala: etiquetaDeSala({ participants: s.participants }, dominios) }))
    .filter((x) => q.reunionesPuertasAdentro || x.sala === "CON EL CLIENTE")
    .sort((a, b) => b.s.date - a.s.date || a.s.id.localeCompare(b.s.id))
    // El doble: algunas no tienen contenido, y la memoria lleva las últimas que sí.
    .slice(0, TOPES_DE_LA_MEMORIA.reuniones * 2);
  if (!candidatas.length) return [];
  const filas = await prisma.firefliesSession.findMany({
    where: { id: { in: candidatas.map((x) => x.s.id) }, date: { lte: new Date(ahora) } },
    select: {
      id: true,
      title: true,
      date: true,
      summary: true,
      minute: { select: { summary: true, decisions: true, agreements: true, risks: true, status: true } },
    },
  });
  const porId = new Map(filas.map((f) => [f.id, f]));
  const out: ReunionDeLaMemoria[] = [];
  for (const { s, sala } of candidatas) {
    const f = porId.get(s.id);
    if (!f) continue;
    const m = f.minute;
    out.push({
      id: f.id,
      titulo: f.title,
      fecha: f.date.toISOString(),
      sala,
      // Lo que va al alcance interno (minuta + notas, con riesgos). Fuera de él ni se arma.
      resumen: q.minutaCompleta ? resumenDeReunion({ title: f.title, summary: f.summary, minuta: m }).texto : "",
      minuta: m
        ? {
            resumen: q.minutaCompleta ? m.summary : null,
            acuerdos: itemsDeMinuta(m.agreements),
            decisiones: itemsDeMinuta(m.decisions),
            riesgos: q.minutaCompleta ? itemsDeMinuta(m.risks) : [],
            revisada: m.status === "REVIEWED" || m.status === "EDITED",
          }
        : null,
    });
  }
  return out;
}

async function leerDesviaciones(projectId: string, q: QueCargar): Promise<DesviacionDeLaMemoria[]> {
  // ⛔ Sin `sourceQuote` (la cita interna) ni `createdByEmail`. Fuera del alcance interno, solo lo que el cliente ve.
  const filas = await prisma.particularidad.findMany({
    where: { timeline: { projectId }, ...(q.desviacionesNoVisibles ? {} : { visibleExternal: true, needsValidation: false }) },
    orderBy: { occurredAt: "desc" },
    take: TOPES_DE_LA_MEMORIA.desviaciones,
    select: { kind: true, party: true, title: true, detail: true, weeksImpact: true, visibleExternal: true, needsValidation: true, occurredAt: true, estado: true },
  });
  return filas.map((f) => ({
    tipo: f.kind,
    titulo: f.title,
    detalle: q.atribucionDeDesviaciones ? f.detail : null,
    semanas: f.weeksImpact,
    fecha: f.occurredAt.toISOString(),
    visibleAlCliente: f.visibleExternal,
    sinConfirmar: f.needsValidation,
    cerrada: esCerrada(f),
    quien: q.atribucionDeDesviaciones ? f.party : "",
  }));
}

/**
 * LA MEMORIA DEL PROYECTO para un lector declarado en lib/memoria/consumidores.ts. `yaLeidas` son las reuniones que el
 * lector ya lee en su material: no se repiten. Texto "" si no hay nada que decir.
 */
export async function memoriaDelProyecto(
  projectId: string,
  opts: { lector: LectorDeMemoria; yaLeidas?: readonly string[] },
): Promise<MemoriaArmada> {
  const c = consumidorDeLaMemoria(opts.lector);
  const q = queCargar(c.alcance);
  const sin = new Set(c.sinPartes ?? []);
  const proyecto = await seguro("el proyecto", () => prisma.project.findUnique({ where: { id: projectId }, select: { name: true, clientId: true } }), null);
  if (!proyecto) return VACIA;
  const [reuniones, compromisos, desviaciones, resultados, hechos] = await Promise.all([
    sin.has("minutas")
      ? Promise.resolve([])
      : seguro("las reuniones", () => leerReunionesDelProyecto(projectId, q, new Set(opts.yaLeidas ?? []), c.destino), []),
    q.compromisos && !sin.has("compromisos")
      ? seguro("los compromisos", () => compromisosAbiertosParaAgentes(projectId, TOPES_DE_LA_MEMORIA.compromisos), [])
      : Promise.resolve([]),
    sin.has("desviaciones") ? Promise.resolve([]) : seguro("las desviaciones", () => leerDesviaciones(projectId, q), []),
    sin.has("resultados") ? Promise.resolve([]) : seguro("los resultados", async () => (await resultadosDelProyecto(projectId))?.resultados ?? [], []),
    q.hechos && !sin.has("hechos") && proyecto.clientId
      ? seguro("los hechos del proyecto", () => leerHechos(proyecto.clientId, projectId), [])
      : Promise.resolve([] as HechoDeLaMemoria[]),
  ]);
  return armarMemoriaDelProyecto(
    { proyecto: { nombre: proyecto.name }, reuniones, compromisos, desviaciones, resultados, hechos },
    { alcance: c.alcance, yaLeidas: opts.yaLeidas, sinPartes: c.sinPartes, pieza: c.pieza },
  );
}

// ── Las dos juntas, para el documento de un proyecto ────────────────────────────────────────

/**
 * La memoria de la CUENTA y la del PROYECTO juntas, para un documento de un proyecto (kickoff, integraciones,
 * implementación, entrega): la cuenta primero, el proyecto después. `yaLeidas` son las reuniones que el documento ya
 * lee en su material. Sin `clientId`, lo saca del proyecto. Texto "" si ninguna de las dos tiene nada que decir.
 */
export async function memoriaDelDocumento(
  projectId: string,
  opts: { lector: LectorDeMemoria; clientId?: string | null; yaLeidas?: readonly string[] },
): Promise<MemoriaArmada> {
  const clientId =
    opts.clientId ??
    (await seguro("el cliente del proyecto", async () => (await prisma.project.findUnique({ where: { id: projectId }, select: { clientId: true } }))?.clientId ?? null, null));
  const [cuenta, proyecto] = await Promise.all([
    clientId ? memoriaDeLaCuenta(clientId, { lector: opts.lector, projectId }) : Promise.resolve(VACIA),
    memoriaDelProyecto(projectId, { lector: opts.lector, yaLeidas: opts.yaLeidas }),
  ]);
  return {
    texto: [cuenta.texto, proyecto.texto].filter(Boolean).join("\n\n"),
    partes: [...cuenta.partes, ...proyecto.partes],
  };
}

// ── Lo esencial de la cuenta (el pase de cuenta) ────────────────────────────────────────────

/**
 * LO ESENCIAL DE LA CUENTA en líneas cortas, para un aviso: la ficha confirmada, las personas y, en el alcance interno,
 * los compromisos abiertos de sus proyectos activos (por lib/tareas/para-agentes.ts) y lo fuera de alcance abierto. Lo
 * pide el pase de cuenta (el CSE nuevo lo recibe en «Para ti»). Nunca tira: sin cliente, vacío.
 */
export async function loEsencialDeLaCuenta(clientId: string, opts: { lector: LectorDeMemoria }): Promise<SeccionDeLoEsencial[]> {
  const c = consumidorDeLaMemoria(opts.lector);
  const q = queCargar(c.alcance);
  const [cliente, pedidos] = await Promise.all([
    seguro(
      "el cliente",
      () =>
        prisma.client.findUnique({
          where: { id: clientId },
          select: { ficha: true, projects: { where: { ...NO_ES_CONTENEDOR_WHERE, status: "active", esPrueba: false }, orderBy: { createdAt: "desc" }, take: 6, select: { id: true, name: true } } },
        }),
      null,
    ),
    q.fueraDeAlcance ? seguro("lo fuera de alcance", () => leerFueraDeAlcance(clientId), []) : Promise.resolve([]),
  ]);
  if (!cliente) return [];
  const compromisos = q.compromisos
    ? (
        await Promise.all(
          cliente.projects.map((p) =>
            seguro("los compromisos", () => compromisosAbiertosParaAgentes(p.id, 6), []).then((cs) => cs.map((x) => ({ ...x, proyecto: p.name }))),
          ),
        )
      ).flat()
    : [];
  return armarLoEsencial({ ficha: leerFicha(cliente.ficha), compromisos, pedidos }, c.alcance);
}

// ── «Lo que la IA ya sabe» ──────────────────────────────────────────────────────────────────

async function leerHandoff(projectId: string): Promise<LoQueSabeLaIADeLaMemoria["handoff"]> {
  // Un hermano que cuelga del handoff de otro proyecto lee el de ese (lib/handoff/duenio.ts).
  const { ownerProjectId } = await resolverDuenioDelHandoff(projectId);
  const delHandoff = canvasOfNested("handoff", { projectId: ownerProjectId });
  const [p, bloques, hito] = await Promise.all([
    prisma.project.findUnique({ where: { id: ownerProjectId }, select: { handoffGeneratedAt: true } }),
    prisma.canvasBlock.count({ where: { section: { canvas: delHandoff } } }),
    prisma.hitoDeDocumento.findFirst({
      where: { tipo: { in: [HITO_CONGELADO, HITO_REHECHO] }, canvas: delHandoff },
      orderBy: { createdAt: "desc" },
      select: { tipo: true, createdAt: true, motivo: true },
    }),
  ]);
  const congelado = hito?.tipo === HITO_CONGELADO;
  return {
    hay: bloques > 0 || !!p?.handoffGeneratedAt,
    generadoAt: p?.handoffGeneratedAt?.toISOString() ?? null,
    congeladoAt: congelado ? hito.createdAt.toISOString() : null,
    via: congelado ? viaDelMotivo(hito.motivo) : null,
  };
}

async function contarReunionesConMinuta(projectId: string): Promise<number> {
  const { sessions } = await getProjectMemberSessions(projectId);
  const ids = soloOcurridas(sessions).map((s) => s.id);
  if (!ids.length) return 0;
  return prisma.sessionMinute.count({ where: { sessionId: { in: ids } } });
}

/**
 * «Lo que la IA ya sabe» de la página de inicio de la exploración: CONTEOS, nunca el contenido. Los datos de la ficha
 * (confirmados, propuestos y por quién), y en un proyecto, el handoff (y si está congelado) y cuántas reuniones tienen
 * minuta. Nunca tira.
 */
export async function queSabeLaIA(clientId: string, projectId: string | null): Promise<LoQueSabeLaIADeLaMemoria> {
  const [cliente, handoff, reunionesConMinuta, preventa] = await Promise.all([
    seguro("la ficha", () => prisma.client.findUnique({ where: { id: clientId }, select: { ficha: true } }), null),
    projectId ? seguro("el handoff", () => leerHandoff(projectId), null) : Promise.resolve(null),
    projectId ? seguro("las minutas", () => contarReunionesConMinuta(projectId), null) : Promise.resolve(null),
    // En la preventa misma no: es la que se está mirando.
    projectId ? seguro("la preventa", () => ultimaPreventa(clientId), null) : Promise.resolve(null),
  ]);
  return { ficha: conteoDeLaFicha(leerFicha(cliente?.ficha)), handoff, reunionesConMinuta, preventa };
}
