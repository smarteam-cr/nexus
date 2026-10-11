/**
 * lib/seguimiento/tarjeta-server.ts — carga «Lo que dejó esta reunión» para quien la mira. SERVIDOR.
 *
 * Un solo lugar la carga para la página de la reunión y para su API (`/api/sessions/[id]/lo-que-dejo`). Respeta quién
 * ve qué:
 *   · la reunión sale del chokepoint (`reunionParaLaTarjeta`): dueño = `resolvedClientId`; sin dueño, de un aliado o de
 *     puertas adentro, no hay tarjeta;
 *   · sin acceso al cliente (`requireAccessToClient`), null: la página y la API responden 404;
 *   · las tareas son solo las TUYAS, serializadas por Tareas (la cita, con la regla de lib/tareas/serializar.ts);
 *   · las alertas, solo para quien lidera Customer Success;
 *   · los hechos de la reunión (etapa 6), con su destino; una novedad la decide quien puede generar ese documento.
 *     Vacíos con `SEGUIMIENTO_HECHOS` apagada o sin el SQL (lib/seguimiento/novedades-server.ts).
 * Las reglas de qué entra y cómo está cada cosa: lib/seguimiento/tarjeta.ts.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireAccessToClient } from "@/lib/auth/access";
import { ForbiddenError, UnauthorizedError, type AppUserWithTeamMember } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { esLiderDeCs } from "@/lib/cs/acceso";
import { citaDeLaEvidencia, citaPedida } from "@/lib/cs/cita-de-alerta";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { urlDeProyecto } from "@/lib/agents/run-url";
import { canvasOfNested } from "@/lib/pieces/canvas-query";
import { proyectoClasificableWhere } from "@/lib/projects/scope";
import { SENTINEL_SERVICE_TYPE, resolvePipeline } from "@/lib/projects/kind";
import { leerMotivoDeEtapa, sugerenciaVigente } from "@/lib/projects/etapa-sugerida";
import { fechaEnPalabras, leerPresentacion } from "@/lib/canvas/presentacion-del-diagnostico";
import { campoDeFicha, camposDeLaReunion, decisionesDeLaReunion, leerFicha, type ClaveDeFicha } from "@/lib/clients/ficha";
import { urlDeSolicitudes } from "@/lib/sessions/solicitudes-fuera-de-alcance";
import { reunionParaLaTarjeta } from "@/lib/sessions/reuniones-para-seguimiento";
import { diaCR } from "@/lib/lo-propuesto/ciclo";
import { PROPUESTAS_WHERE } from "@/lib/tareas/donde";
import { contextoDeTareas, tareasDisponible } from "@/lib/tareas/servidor";
import { clientesQueVesParaTareas } from "@/lib/tareas/clientes";
import { SELECT_TAREA, prepararSerializacion, serializarTarea } from "@/lib/tareas/serializar";
import { documentoConContexto } from "@/lib/contexto/documento";
import { compromisosDeLaReunion } from "./compromisos-server";
import { destinoPorClave } from "./destinos";
import { leerDestinos } from "./hechos/estado";
import { hechosDeLaReunion, piezasConContenidoDelProyecto } from "./novedades-server";
import { armarTarjeta, type EntradaDeLaTarjeta, type Tarjeta } from "./tarjeta";

/** Una lectura que depende de un SQL que quizá falta: sin la columna o la tabla, la tarjeta sale sin esa parte. */
async function seguro<T>(p: Promise<T>, siFalta: T): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (esquemaDesactualizado(e)) return siFalta;
    throw e;
  }
}

/** ¿La alerta cita esta reunión? Por su cita (verificada o pedida) o por las reuniones de su evidencia. */
export function alertaCitaLaReunion(evidence: unknown, sessionId: string): boolean {
  const verificada = citaDeLaEvidencia(evidence);
  if (verificada && verificada.fuente !== "correo" && verificada.id === sessionId) return true;
  if (citaPedida(evidence)?.sessionId === sessionId) return true;
  const ids = (evidence as { sessionIds?: unknown } | null)?.sessionIds;
  return Array.isArray(ids) && ids.includes(sessionId);
}

async function tusTareasDeLaReunion(sessionId: string, user: AppUserWithTeamMember, ahora: Date): Promise<EntradaDeLaTarjeta["tareas"]> {
  if (!user.teamMember || !(await tareasDisponible())) return [];
  const yo = user.email.toLowerCase();
  const filas = await prisma.tarea.findMany({
    where: { ...PROPUESTAS_WHERE, sessionId, responsableEmail: yo },
    select: SELECT_TAREA,
    orderBy: { numero: "asc" },
    take: 30,
  });
  if (!filas.length) return [];
  const [ctx, clientes] = await Promise.all([contextoDeTareas(user), clientesQueVesParaTareas(user.teamMember)]);
  const s = await prepararSerializacion(ctx, clientes, filas, ahora);
  return filas.map((f) => {
    const v = serializarTarea(f, s);
    return {
      id: v.id,
      version: v.version,
      numero: v.numero,
      titulo: v.titulo,
      cita: v.salioDe?.visible ? v.salioDe.cita : null,
      contexto: v.contexto,
      estado: f.estado,
      decision: f.decision,
      decididaPorEmail: f.decididaPorEmail,
      decididaAt: f.decididaAt?.toISOString() ?? null,
    };
  });
}

/** La tarjeta de una reunión para quien mira, o null (sin tarjeta, o sin acceso a su cliente). */
export async function cargarTarjeta(sessionId: string, user: AppUserWithTeamMember, ahora = new Date()): Promise<Tarjeta | null> {
  const reunion = await reunionParaLaTarjeta(sessionId);
  if (!reunion) return null;
  try {
    await requireAccessToClient(reunion.clientId);
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof UnauthorizedError) return null;
    throw e;
  }
  const tm = user.teamMember;
  if (!tm) return null;
  const clientId = reunion.clientId;
  const esLider = esLiderDeCs(tm.roleEnum);
  const sesion = { title: reunion.titulo, date: reunion.fecha };

  const [puedeMoverEtapa, minuta, pedidos, cliente, proyectos, tareas, alertas, compromisos, hechosLeidos] = await Promise.all([
    can(tm, "proyectos", "cambiarEstadoHubspot"),
    prisma.sessionMinute.findUnique({
      where: { sessionId },
      select: { id: true, summary: true, agreements: true, decisions: true, risks: true, status: true, reviewedByEmail: true, reviewedAt: true, createdAt: true },
    }),
    seguro(
      prisma.pedidoFueraDeAlcance.findMany({
        where: { sessionId, clientId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          pedido: true,
          quienLoPidio: true,
          cita: true,
          estado: true,
          decididoPor: true,
          decididoAt: true,
          creadoPor: true,
          createdAt: true,
          projectId: true,
          project: { select: { name: true } },
        },
      }),
      [],
    ),
    prisma.client.findUnique({ where: { id: clientId }, select: { ficha: true } }),
    seguro(
      prisma.project.findMany({
        where: proyectoClasificableWhere({ clientId, OR: [{ etapaPropuestaStageId: { not: null } }, { diagnosticoPresentacion: { not: Prisma.DbNull } }] }),
        select: {
          id: true,
          name: true,
          hubspotPipelineId: true,
          hubspotPipelineStageId: true,
          etapaPropuestaStageId: true,
          etapaPropuestaMotivo: true,
          etapaPropuestaAt: true,
          diagnosticoPresentacion: true,
        },
      }),
      [],
    ),
    seguro(tusTareasDeLaReunion(sessionId, user, ahora), []),
    esLider
      ? prisma.csAlert.findMany({
          where: { clientId, status: { in: ["OPEN", "SEEN"] } },
          orderBy: { lastDetectedAt: "desc" },
          take: 200,
          select: { id: true, title: true, reason: true, severity: true, evidence: true, status: true, resolvedByEmail: true, resolvedAt: true, agentRunId: true },
        })
      : Promise.resolve([]),
    seguro(compromisosDeLaReunion(sessionId, user), []),
    hechosDeLaReunion(sessionId, clientId),
  ]);

  // Los hechos de la reunión (etapa 6): cada destino con su estado, y las piezas cuyas novedades decide quien mira.
  const nombreDelProyecto = new Map(reunion.proyectos.map((p) => [p.id, p.name]));
  const hechos: NonNullable<EntradaDeLaTarjeta["hechos"]> = hechosLeidos.map((h) => ({
    id: h.id,
    tipo: h.tipo,
    tema: h.tema,
    frase: h.frase,
    cita: h.cita,
    estado: h.estado,
    createdAt: (typeof h.createdAt === "string" ? new Date(h.createdAt) : h.createdAt).toISOString(),
    projectId: h.projectId,
    proyecto: h.projectId ? (nombreDelProyecto.get(h.projectId) ?? null) : null,
    destinos: leerDestinos(h.destinos).map((d) => {
      const reg = destinoPorClave(d.clave);
      return {
        clave: d.clave,
        estado: d.estado,
        href: reg?.salida === "novedad" && reg.pieza && h.projectId ? urlDeProyecto(clientId, h.projectId, reg.pieza) : null,
      };
    }),
  }));
  const piezasDeNovedad = [...new Set(hechos.flatMap((h) => h.destinos.map((d) => destinoPorClave(d.clave)).filter((r) => r?.salida === "novedad" && r.pieza).map((r) => r!.pieza!)))];
  const piezasQueDecide = (
    await Promise.all(
      piezasDeNovedad.map(async (pieza) => {
        const seccion = documentoConContexto(pieza)?.seccion;
        return seccion && (await can(tm, seccion, "generate")) ? pieza : null;
      }),
    )
  ).filter((p): p is string => !!p);
  // Los documentos con contenido de cada proyecto que tiene una novedad que quien mira decide: la novedad existe solo
  // ahí (la misma regla que la franja del documento).
  const proyectosConNovedad = [
    ...new Set(hechos.filter((h) => h.projectId && h.destinos.some((d) => piezasQueDecide.includes(destinoPorClave(d.clave)?.pieza ?? ""))).map((h) => h.projectId!)),
  ];
  const piezasConContenidoPorProyecto = Object.fromEntries(
    await Promise.all(proyectosConNovedad.map(async (id) => [id, await piezasConContenidoDelProyecto(id).catch(() => [] as string[])] as const)),
  );

  // La ficha: los campos de ESTA reunión que siguen propuestos, y lo que ya se decidió de ellos.
  const ficha = leerFicha(cliente?.ficha);
  const campos = camposDeLaReunion(ficha, sesion).map((clave) => {
    const c = campoDeFicha(clave);
    return {
      clave,
      etiqueta: c.etiqueta,
      propuesto: ficha.propuesta?.valores[clave] ?? "",
      actual: ficha.valores[clave],
      propuestoEn: ficha.propuesta?.at || null,
      interno: !c.alCliente,
    };
  });
  const camposDecididos = decisionesDeLaReunion(ficha, sesion).map((d) => ({
    clave: d.clave,
    etiqueta: campoDeFicha(d.clave as ClaveDeFicha).etiqueta,
    valor: d.valor,
    estado: d.estado,
    por: d.por,
    en: d.en,
  }));

  // La etapa que sugirió esta reunión, si sigue en pie.
  const etapas: EntradaDeLaTarjeta["etapas"] = [];
  for (const p of proyectos) {
    if (!p.etapaPropuestaStageId || leerMotivoDeEtapa(p.etapaPropuestaMotivo)?.reunion?.id !== sessionId) continue;
    const s = sugerenciaVigente(resolvePipeline(p.hubspotPipelineId), p.hubspotPipelineStageId, {
      stageId: p.etapaPropuestaStageId,
      motivo: p.etapaPropuestaMotivo,
      at: p.etapaPropuestaAt,
    });
    if (!s) continue;
    etapas.push({
      projectId: p.id,
      proyecto: p.name,
      hasta: s.hasta,
      desde: s.desde,
      cita: s.cita,
      at: s.at,
      href: `${urlDeProyecto(clientId, p.id)}&etapa=revisar#proyecto-etapa`,
    });
  }

  // La fecha del diagnóstico que leyó Nexus en esta reunión, si el diagnóstico sigue en borrador.
  const conFecha = proyectos
    .map((p) => ({ p, pr: leerPresentacion(p.diagnosticoPresentacion) }))
    .filter(({ pr }) => pr.propuesta?.reunion.id === sessionId && pr.propuesta.fecha !== pr.fecha);
  const borradores = conFecha.length
    ? await prisma.projectCanvas.findMany({
        where: { ...canvasOfNested("diagnosis", { projectId: { in: conFecha.map(({ p }) => p.id) } }), estadoDocumento: { notIn: ["presentado", "aprobado"] } },
        select: { id: true, projectId: true },
      })
    : [];
  const canvasDe = new Map(borradores.map((b) => [b.projectId, b.id]));
  const fechas: EntradaDeLaTarjeta["fechas"] = conFecha.flatMap(({ p, pr }) => {
    const canvasId = canvasDe.get(p.id);
    if (!canvasId || !pr.propuesta) return [];
    return [
      {
        projectId: p.id,
        proyecto: p.name,
        fecha: pr.propuesta.fecha,
        fechaEnPalabras: fechaEnPalabras(pr.propuesta.fecha),
        cita: pr.propuesta.cita,
        en: pr.propuesta.en || null,
        href: urlDeProyecto(clientId, p.id, canvasId),
      },
    ];
  });

  const entrada: EntradaDeLaTarjeta = {
    reunion: { id: reunion.id, titulo: reunion.titulo, fecha: reunion.fecha, clientId, empresa: reunion.empresa, proyectos: reunion.proyectos },
    minuta: minuta
      ? {
          id: minuta.id,
          resumen: minuta.summary,
          acuerdos: textos(minuta.agreements),
          decisiones: textos(minuta.decisions),
          riesgos: textos(minuta.risks),
          status: minuta.status,
          reviewedByEmail: minuta.reviewedByEmail,
          reviewedAt: minuta.reviewedAt?.toISOString() ?? null,
          createdAt: minuta.createdAt.toISOString(),
        }
      : null,
    pedidos: pedidos.map((p) => ({
      id: p.id,
      pedido: p.pedido,
      quienLoPidio: p.quienLoPidio,
      cita: p.cita,
      estado: p.estado,
      decididoPor: p.decididoPor,
      decididoAt: p.decididoAt?.toISOString() ?? null,
      creadoPor: p.creadoPor,
      createdAt: p.createdAt.toISOString(),
      projectId: p.projectId,
      proyecto: p.project?.name ?? null,
    })),
    campos,
    camposDecididos,
    etapas,
    fechas,
    tareas,
    alertas: alertas
      .filter((a) => alertaCitaLaReunion(a.evidence, sessionId))
      .map((a) => ({
        id: a.id,
        titulo: a.title,
        razon: a.reason,
        severidad: a.severity,
        cita: citaDeLaEvidencia(a.evidence)?.texto ?? citaPedida(a.evidence)?.texto ?? null,
        status: a.status,
        resolvedByEmail: a.resolvedByEmail,
        resolvedAt: a.resolvedAt?.toISOString() ?? null,
        origen: a.agentRunId ? ("ia" as const) : ("regla" as const),
      })),
    compromisos,
    hechos,
    piezasQueDecide,
    piezasConContenidoPorProyecto,
    hrefs: {
      ficha: `/clients/${encodeURIComponent(clientId)}?tab=${SENTINEL_SERVICE_TYPE}`,
      solicitudes: urlDeSolicitudes(clientId),
      tareas: "/tareas",
      exito: `/customer-success/${encodeURIComponent(clientId)}`,
    },
  };

  return armarTarjeta(entrada, {
    hoyISO: diaCR(ahora),
    quienMira: { email: user.email.toLowerCase(), esLiderDeCs: esLider, puedeMoverEtapa },
  });
}

/** Los textos de una lista de la minuta (`[{ text }]` o `["…"]`). */
function textos(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x : x && typeof x === "object" && typeof (x as { text?: unknown }).text === "string" ? (x as { text: string }).text : ""))
    .filter((t) => t.trim());
}
