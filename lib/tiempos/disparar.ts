/**
 * lib/tiempos/disparar.ts — dónde nace una pregunta de tiempo. SERVIDOR.
 *
 * Lo llaman las rutas DESPUÉS de que su escritura quedó hecha (marcar tareas, aplicar un avance, publicar un
 * documento) y NUNCA lanza: perder una pregunta es mucho menos grave que fallar un «Hecha». Devuelve lo que hay
 * que mostrar; la ruta lo agrega a su respuesta y la pantalla pregunta ahí mismo.
 *
 * Las reglas (a quién, en qué, cada cuánto) son las de lib/tiempos/reglas.ts.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { computePhaseRanges, overduePlannedEnd } from "@/lib/timeline/weeks";
import {
  aplicaAPersona,
  aplicaATarea,
  caben,
  claveDeDocumento,
  claveDeTarea,
  cuandoFue,
  cuantil,
  elegirDelLote,
  inicioDelDiaCR,
  marcadaDemasiadoTarde,
  META_PARA_CALIBRAR,
  nombreDeDocumento,
  nombreDeTipo,
  partyDe,
  tipoDeFase,
  tocaPorMuestreo,
  venceEn,
  type Documento,
  type TipoDeFase,
} from "./reglas";
import { calibracionActual, encuestaDe, estimacionDeDocumento, estimacionDeTarea, personaQueResponde, tiemposDisponible } from "./servidor";
import type { PreguntaParaResponder } from "./tipos";

const isoDia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Cuántas preguntas ya se le hicieron hoy a la persona (de cualquier momento). */
async function preguntasDeHoy(email: string, ahora: Date): Promise<number> {
  return prisma.preguntaDeTiempo.count({ where: { personaEmail: email, createdAt: { gte: inicioDelDiaCR(ahora) } } });
}

/**
 * Crea la pregunta, o reabre una retirada (la tarea se desmarcó y se volvió a marcar). Si ya existe otra cosa
 * (respondida, omitida, pendiente), no pregunta de nuevo. Una carrera con otra pestaña cae en el único.
 */
async function crearOReabrir(
  encuestaId: string,
  clave: string,
  datos: Omit<Prisma.PreguntaDeTiempoUncheckedCreateInput, "encuestaId" | "clave">,
): Promise<string | null> {
  const ya = await prisma.preguntaDeTiempo.findUnique({ where: { encuestaId_clave: { encuestaId, clave } }, select: { id: true, estado: true } });
  if (ya && ya.estado !== "retirada") return null;
  try {
    if (ya) {
      const r = await prisma.preguntaDeTiempo.update({
        where: { id: ya.id },
        data: { ...datos, estado: "pendiente", motivoOmision: null, minutos: null, respondidaAt: null },
        select: { id: true },
      });
      return r.id;
    }
    const r = await prisma.preguntaDeTiempo.create({ data: { ...datos, encuestaId, clave }, select: { id: true } });
    return r.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null;
    throw e;
  }
}

/**
 * Tareas que acaban de quedar HECHAS. `cronograma` = una persona marcó una; `avance` = se aplicó lo que propuso
 * la IA (muchas a la vez: sale UNA pregunta por tipo de fase, hasta tres).
 */
export async function alMarcarTareasHechas(args: {
  email: string | null | undefined;
  taskIds: readonly string[];
  origen: "cronograma" | "avance";
  ahora?: Date;
}): Promise<PreguntaParaResponder[]> {
  try {
    const ahora = args.ahora ?? new Date();
    if (!args.email || args.taskIds.length === 0 || !tiemposDisponible()) return [];
    const encuesta = await encuestaDe("TAREA_HECHA");
    if (!encuesta.activa || !encuesta.id) return [];
    const persona = await personaQueResponde(args.email);
    if (!persona || !aplicaAPersona(encuesta.config, persona)) return [];

    const tareas = await prisma.timelineTask.findMany({
      where: { id: { in: [...args.taskIds] }, status: "DONE" },
      select: {
        id: true,
        title: true,
        weekIndex: true,
        party: true,
        dueDateOverride: true,
        phase: {
          select: {
            id: true,
            activityType: true,
            timeline: {
              select: {
                anchorStartDate: true,
                project: { select: { id: true, clientId: true, client: { select: { name: true } } } },
                phases: { orderBy: { order: "asc" }, select: { id: true, durationWeeks: true, startWeek: true } },
              },
            },
          },
        },
      },
    });

    const candidatas = tareas
      .map((t) => {
        const tl = t.phase.timeline;
        const i = tl.phases.findIndex((p) => p.id === t.phase.id);
        const inicio = i >= 0 ? computePhaseRanges(tl.phases)[i].start : 0;
        const finPlaneado = t.dueDateOverride ?? overduePlannedEnd(isoDia(tl.anchorStartDate), inicio, t.weekIndex);
        return {
          clave: claveDeTarea(t.id),
          id: t.id,
          titulo: t.title,
          tipo: tipoDeFase(t.phase.activityType) as TipoDeFase,
          party: partyDe(t.party),
          projectId: tl.project.id,
          clientId: tl.project.clientId,
          cliente: tl.project.client?.name ?? null,
          finPlaneado,
        };
      })
      .filter((t) => aplicaATarea(encuesta.config, t) && !marcadaDemasiadoTarde(t.finPlaneado, ahora));
    if (candidatas.length === 0) return [];

    const cal = await calibracionActual(encuesta.id);
    const porTipo = Object.fromEntries(cal.map((c) => [c.tipo, c.respuestas])) as Partial<Record<TipoDeFase, number>>;
    const yaHoy = await preguntasDeHoy(persona.email, ahora);
    const elegidas =
      args.origen === "avance"
        ? elegirDelLote(encuesta.config, candidatas, porTipo, yaHoy)
        : candidatas.filter((t) => tocaPorMuestreo(encuesta.config, t.clave, porTipo[t.tipo] ?? 0)).slice(0, Math.min(1, caben(encuesta.config, yaHoy)));
    if (elegidas.length === 0) return [];

    const lote = args.origen === "avance" && elegidas.length > 1 ? randomUUID() : null;
    const vence = venceEn(ahora);
    const salida: PreguntaParaResponder[] = [];
    for (const t of elegidas) {
      const est = estimacionDeTarea(cal, t.tipo);
      const id = await crearOReabrir(encuesta.id, t.clave, {
        personaEmail: persona.email,
        rol: persona.rol,
        estimadoMinutos: est.minutos,
        projectId: t.projectId,
        clientId: t.clientId,
        taskId: t.id,
        tipoFase: t.tipo,
        party: t.party,
        titulo: t.titulo,
        origen: args.origen,
        lote,
        ocurrioAt: ahora,
        venceAt: vence,
      });
      if (!id) continue;
      salida.push({
        id,
        momento: "TAREA_HECHA",
        pregunta: encuesta.config.pregunta,
        titulo: t.titulo,
        contexto: [t.cliente, nombreDeTipo(t.tipo), `marcada ${cuandoFue(ahora, ahora)}`].filter(Boolean).join(" · "),
        opciones: encuesta.config.opciones,
        estimacion: { modo: encuesta.config.estimacion, texto: est.texto },
        taskId: t.id,
        lote,
        venceAt: vence.toISOString(),
      });
    }
    return salida;
  } catch (e) {
    console.error("[tiempos] no se pudo crear la pregunta de una tarea hecha:", e instanceof Error ? e.message : e);
    return [];
  }
}

/** Tareas que dejaron de estar hechas: su pregunta pendiente se retira y no cuenta. Lo ya respondido se queda. */
export async function alDesmarcarTareas(taskIds: readonly string[]): Promise<void> {
  try {
    if (taskIds.length === 0 || !tiemposDisponible()) return;
    await prisma.preguntaDeTiempo.updateMany({
      where: { taskId: { in: [...taskIds] }, estado: "pendiente" },
      data: { estado: "retirada" },
    });
  } catch (e) {
    console.error("[tiempos] no se pudo retirar la pregunta de una tarea desmarcada:", e instanceof Error ? e.message : e);
  }
}

/**
 * Un documento que se publica. `yaEstabaPublicado` lo dice la ruta (lo leyó antes de escribir): solo la primera
 * vez se pregunta, porque republicar una corrección no es haberlo hecho de nuevo.
 */
export async function alPublicarDocumento(args: {
  email: string | null | undefined;
  projectId: string;
  documento: Documento;
  yaEstabaPublicado: boolean;
  ahora?: Date;
}): Promise<PreguntaParaResponder | null> {
  try {
    const ahora = args.ahora ?? new Date();
    if (!args.email || args.yaEstabaPublicado || !tiemposDisponible()) return null;
    const encuesta = await encuestaDe("DOCUMENTO_PUBLICADO");
    if (!encuesta.activa || !encuesta.id || !encuesta.config.documentos.includes(args.documento)) return null;
    const persona = await personaQueResponde(args.email);
    if (!persona || !aplicaAPersona(encuesta.config, persona)) return null;

    const clave = claveDeDocumento(args.projectId, args.documento);
    const anteriores = await prisma.preguntaDeTiempo.findMany({
      where: { encuestaId: encuesta.id, documento: args.documento, estado: "respondida", minutos: { not: null } },
      select: { minutos: true },
    });
    if (!tocaPorMuestreo(encuesta.config, clave, anteriores.length)) return null;
    if (caben(encuesta.config, await preguntasDeHoy(persona.email, ahora)) <= 0) return null;

    const proyecto = await prisma.project.findUnique({
      where: { id: args.projectId },
      select: { id: true, clientId: true, client: { select: { name: true } } },
    });
    if (!proyecto) return null;
    const mediana = anteriores.length >= META_PARA_CALIBRAR ? cuantil(anteriores.map((a) => a.minutos ?? 0), 0.5) : null;
    const nombre = nombreDeDocumento(args.documento);
    const vence = venceEn(ahora);
    const id = await crearOReabrir(encuesta.id, clave, {
      personaEmail: persona.email,
      rol: persona.rol,
      estimadoMinutos: mediana,
      projectId: proyecto.id,
      clientId: proyecto.clientId,
      documento: args.documento,
      titulo: nombre,
      origen: "publicar",
      ocurrioAt: ahora,
      venceAt: vence,
    });
    if (!id) return null;
    return {
      id,
      momento: "DOCUMENTO_PUBLICADO",
      pregunta: encuesta.config.pregunta,
      titulo: nombre,
      contexto: [proyecto.client?.name, "lo acabas de publicar"].filter(Boolean).join(" · "),
      opciones: encuesta.config.opciones,
      estimacion: { modo: encuesta.config.estimacion, texto: estimacionDeDocumento(mediana, args.documento) },
      taskId: null,
      lote: null,
      venceAt: vence.toISOString(),
    };
  } catch (e) {
    console.error("[tiempos] no se pudo crear la pregunta de un documento publicado:", e instanceof Error ? e.message : e);
    return null;
  }
}
