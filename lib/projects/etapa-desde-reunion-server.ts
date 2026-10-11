import "server-only";

/**
 * lib/projects/etapa-desde-reunion-server.ts — con cada reunión de un proyecto, la IA dice si el
 * proyecto ya pasó a otra etapa y deja la SUGERENCIA en `Project.etapaPropuesta*`. Nada se escribe
 * en HubSpot desde acá: eso lo hace el CSE en la encuesta de la etapa (ver `etapa-sugerida.ts`).
 *
 * Lo llama el post-proceso de cada sesión (lib/sessions/post-process.ts), con el proyecto primario
 * de la reunión. Con la lectura de hechos prendida (etapa 6) lo llama el escritor de los hechos
 * (lib/seguimiento/hechos-server.ts), SOLO con una señal de etapa y para cada proyecto vinculado, con
 * el texto de la señal (`opts.texto`). Nunca lanza: una etapa que no se sugiere no puede tumbar el post-proceso.
 */
import { getAnthropic } from "@/lib/anthropic";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { prisma } from "@/lib/db/prisma";
import { fetchTranscriptContent } from "@/lib/sessions/transcript";
import { resolvePipeline } from "./kind";
import {
  MAX_TEXTO_REUNION,
  VENTANA_DE_LA_REUNION_DIAS,
  leerRespuestaDeEtapa,
  pedidoDeEtapa,
} from "./etapa-desde-reunion";
import { escribirMotivoDeEtapa, leerMotivoDeEtapa, reemplazaA, sugerenciaVigente } from "./etapa-sugerida";

export type ResultadoDeEtapa =
  | { status: "sugerida"; stageId: string }
  | { status: "sin_cambio"; motivo: string }
  | { status: "error"; error: string };

export async function proponerEtapaDesdeSesion(
  sessionId: string,
  projectId: string,
  ahora: Date = new Date(),
  /**
   * `texto`: lo que se le pasa al modelo en vez de releer la reunión (memoria de la cuenta, etapa 6). El escritor de los
   * hechos manda las frases y las citas de la señal de etapa (ya verificadas contra la reunión) más el resumen de la
   * minuta: la etapa corre solo cuando hay algo que decir y sin volver a leer 30.000 caracteres. Con `texto`, la cita
   * de la respuesta se verifica SOLO contra `citas` (las citas literales de las señales): la frase y el resumen los
   * escribió la IA. Sin `citas`, ninguna cita pasa (falla cerrada). `quien`: la persona que pidió la lectura (su gasto
   * va a su presupuesto); sin ella, la corrida es automática.
   */
  opts: { texto?: string | null; citas?: readonly string[] | null; quien?: string | null } = {},
): Promise<ResultadoDeEtapa> {
  try {
    const [s, p] = await Promise.all([
      prisma.firefliesSession.findUnique({ where: { id: sessionId }, select: { title: true, date: true } }),
      prisma.project.findUnique({
        where: { id: projectId },
        select: {
          name: true,
          clientId: true,
          status: true,
          hubspotServiceId: true,
          hubspotPipelineId: true,
          hubspotPipelineStageId: true,
          client: { select: { name: true } },
        },
      }),
    ]);
    if (!s) return { status: "error", error: "Sesión no encontrada" };
    if (!p) return { status: "error", error: "Proyecto no encontrado" };
    if (p.status === "completed") return { status: "sin_cambio", motivo: "proyecto cerrado" };
    if (!p.hubspotServiceId) return { status: "sin_cambio", motivo: "el proyecto no existe en HubSpot" };
    const def = resolvePipeline(p.hubspotPipelineId);
    if (!def) return { status: "sin_cambio", motivo: "tablero desconocido" };
    if (ahora.getTime() - s.date.getTime() > VENTANA_DE_LA_REUNION_DIAS * 86_400_000) {
      return { status: "sin_cambio", motivo: "reunión vieja" };
    }
    if (s.date.getTime() > ahora.getTime()) return { status: "sin_cambio", motivo: "reunión futura" };

    const texto = opts.texto?.trim()
      ? opts.texto.slice(0, MAX_TEXTO_REUNION)
      : ((await fetchTranscriptContent(sessionId, s.title ?? "", { maxChars: MAX_TEXTO_REUNION })) ?? "");
    if (!texto.trim()) return { status: "sin_cambio", motivo: "reunión sin texto" };

    const pedido = pedidoDeEtapa({
      proyecto: p.name,
      cliente: p.client?.name ?? "",
      def,
      actualStageId: p.hubspotPipelineStageId,
      reunion: { titulo: s.title ?? "sin título", fecha: s.date.toISOString(), texto },
    });
    if (!pedido) return { status: "sin_cambio", motivo: "no hay etapa a la que avanzar" };

    const respuesta = await conContextoDeIA(
      {
        agentSlug: "etapa-desde-reunion",
        clientId: p.clientId,
        projectId,
        triggeredByEmail: opts.quien ?? null,
        origen: opts.texto?.trim() ? "projects/etapa-desde-reunion:hechos" : "projects/etapa-desde-reunion",
      },
      () => getAnthropic().messages.create(pedido),
    );
    const detectada = leerRespuestaDeEtapa(respuesta, {
      def,
      actualStageId: p.hubspotPipelineStageId,
      texto,
      ...(opts.texto?.trim() ? { soloEstasCitas: opts.citas ?? [] } : {}),
    });
    if (!detectada) return { status: "sin_cambio", motivo: "la reunión no muestra otra etapa" };

    // Releer y escribir juntos: mientras corría la IA pudo llegar otra reunión o moverse la etapa.
    return await prisma.$transaction(async (tx) => {
      const fila = await tx.project.findUnique({
        where: { id: projectId },
        select: {
          hubspotPipelineStageId: true,
          etapaPropuestaStageId: true,
          etapaPropuestaMotivo: true,
          etapaPropuestaAt: true,
        },
      });
      if (!fila) return { status: "error" as const, error: "Proyecto no encontrado" };
      if (fila.hubspotPipelineStageId !== p.hubspotPipelineStageId) {
        return { status: "sin_cambio" as const, motivo: "la etapa se movió mientras se leía la reunión" };
      }
      const vigente = sugerenciaVigente(def, fila.hubspotPipelineStageId, {
        stageId: fila.etapaPropuestaStageId,
        motivo: fila.etapaPropuestaMotivo,
        at: fila.etapaPropuestaAt,
      });
      if (vigente && !reemplazaA(def, vigente.stageId, detectada.stageId)) {
        return { status: "sin_cambio" as const, motivo: "ya hay una sugerencia igual o más avanzada" };
      }
      await tx.project.update({
        where: { id: projectId },
        data: {
          etapaPropuestaStageId: detectada.stageId,
          etapaPropuestaMotivo: escribirMotivoDeEtapa({
            motivo: detectada.motivo,
            cita: detectada.cita,
            reunion: { id: sessionId, titulo: s.title ?? "sin título", fecha: s.date.toISOString() },
          }),
          etapaPropuestaAt: ahora,
          etapaPropuestaByRunId: null,
        },
      });
      return { status: "sugerida" as const, stageId: detectada.stageId };
    });
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * La sugerencia ya se decidió: el CSE movió la etapa desde la encuesta (a la sugerida o a otra) o dijo
 * que sigue donde está. Se borra para que no vuelva a preguntarse.
 *
 * Vive acá y no en `estado-hubspot/route.ts` a propósito: esa ruta tiene prohibido escribir en
 * `Project` (lib/projects/estado-a-hubspot.test.ts), porque es la tentada de copiar la etapa nueva en
 * la base. Esto no toca la etapa: borra la PREGUNTA.
 */
/**
 * La reunión de la que salió la sugerencia dejó de ser del cliente del proyecto (cambió de dueño, memoria de la cuenta,
 * etapa 6): se borra la pregunta, solo si la sugerencia viva es de ESA reunión. No toca la etapa. Lanza si falla.
 */
export async function cerrarSugerenciaDeLaReunion(projectId: string, sessionId: string): Promise<boolean> {
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { etapaPropuestaStageId: true, etapaPropuestaMotivo: true } });
  if (!p?.etapaPropuestaStageId || leerMotivoDeEtapa(p.etapaPropuestaMotivo)?.reunion?.id !== sessionId) return false;
  const r = await prisma.project.updateMany({
    where: { id: projectId, etapaPropuestaMotivo: p.etapaPropuestaMotivo },
    data: { etapaPropuestaStageId: null, etapaPropuestaMotivo: null, etapaPropuestaAt: null, etapaPropuestaByRunId: null },
  });
  return r.count > 0;
}

export async function cerrarSugerenciaDeEtapa(projectId: string): Promise<void> {
  await prisma.project.updateMany({
    where: { id: projectId, etapaPropuestaStageId: { not: null } },
    data: { etapaPropuestaStageId: null, etapaPropuestaMotivo: null, etapaPropuestaAt: null, etapaPropuestaByRunId: null },
  });
}
