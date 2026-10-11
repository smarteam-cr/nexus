/**
 * lib/sessions/project-sessions.ts
 *
 * Las sesiones PASADAS de un proyecto para el agente de avance del cronograma (D.2), que cruza lo que ya ocurrió con
 * la etapa de HubSpot. Desde la memoria de la cuenta (etapa 3, 2026-10-10) no relee las 12 últimas transcripciones en
 * cada reunión nueva: la reunión NUEVA va entera (sus notas y la transcripción, recortada a 40.000 caracteres con
 * `recortarTranscripcion`) y las demás van con lo que ya dejaron (la minuta y las notas de la reunión,
 * `resumenDeReunion`), nunca con su transcripción. Filtro temporal: solo sesiones con date <= now (las futuras no son
 * avance).
 */
import { prisma } from "@/lib/db/prisma";
import { resumenDeReunion } from "@/lib/contexto/material-cronograma";
import { KICKOFF_TITLE_FILTERS, pickKickoffSessionDate } from "@/lib/sessions/kickoff-pick";
import { belongsToClient } from "@/lib/sessions/project-sources";
import { recortarTranscripcion } from "@/lib/sessions/recortar-transcripcion";

export interface PastSessionContext {
  id: string;
  title: string;
  date: Date;
  /** Emails de los participantes — para clasificar el área (Ventas/CSE) de la sesión. */
  participants: string[];
  /**
   * Quién convocó. Va porque en muchas reuniones NO figura entre los participantes, y sin él una
   * reunión que convocó alguien de afuera se lee como si hubiéramos estado solos — que es la
   * conclusión contraria a la verdadera cuando hay que decidir si fue con el cliente.
   */
  organizerEmail: string | null;
  /** Lo que se lee de la reunión (ver `entera`), o null si no hay contenido. */
  content: string | null;
}

export interface SesionDelAvance extends PastSessionContext {
  /** La reunión NUEVA: va entera (notas + transcripción recortada). Las demás, solo lo que dejaron (minuta y notas). */
  entera: boolean;
  /**
   * Tiene transcripción guardada (se lea o no). Una reunión anterior con transcripción pero sin minuta ni notas queda
   * sin contenido, y el avance no puede decirle al modelo que «no hay material»: lo hay, solo que no se relee.
   */
  conTranscripcion: boolean;
}

/**
 * Cuál es la reunión nueva: la pedida (`asOfSessionId` del post-proceso) si está en la ventana; si no (el botón), la más
 * reciente que tenga algo que leer. `sesiones` va en orden cronológico. PURO.
 */
export function laReunionNueva(
  sesiones: readonly { id: string }[],
  tieneAlgo: (id: string) => boolean,
  pedida?: string | null,
): string | null {
  if (pedida && sesiones.some((s) => s.id === pedida)) return pedida;
  for (let i = sesiones.length - 1; i >= 0; i--) if (tieneAlgo(sesiones[i].id)) return sesiones[i].id;
  return null;
}

/** Lo que el avance lee de una reunión: la nueva entera, las demás su resumen. null si no hay nada. PURO. */
export function contenidoParaElAvance(o: { resumen: string; transcripcion: string | null; entera: boolean }): string | null {
  const texto = o.entera ? recortarTranscripcion(o.resumen, o.transcripcion ?? "") : o.resumen;
  return texto.trim() || null;
}

/**
 * Las sesiones del proyecto que YA ocurrieron (date <= now), de más antigua a más reciente: la nueva entera y las
 * demás con lo que dejaron. `limit` acota a las N más recientes (se devuelven igual en orden cronológico).
 */
export async function getSessionsForProgress(
  projectId: string,
  opts: { nuevaId?: string | null; limit?: number } = {},
): Promise<SesionDelAvance[]> {
  const now = new Date();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { clientId: true },
  });
  if (!project) return [];

  const links = await prisma.sessionProject.findMany({
    /* `included: true`: las sesiones excluidas por humano (tombstone) no alimentan el avance.
       ⚠ NO usa la elección del «Contexto del cronograma» (`timelineOverride`), a propósito: allá
       entran solo las reuniones que el CSE eligió, y el avance existe para enterarse SOLO de lo que
       pasó en la última reunión. Atarlo a la elección lo dejaba ciego hasta que alguien se
       acordara de elegirla. Las que se eligen desde el calendario ya quedan como reuniones del
       proyecto, así que si son recientes entran acá igual. Desde la etapa 3 de la memoria relee
       lo que dejaron las anteriores (minuta y notas), no sus transcripciones. */
    where: { projectId, included: true, session: { date: { lte: now } } },
    orderBy: { session: { date: "desc" } },
    take: opts.limit ?? 12,
    select: {
      session: {
        select: {
          id: true, title: true, date: true, participants: true, organizerEmail: true,
          resolvedClientId: true, manualClientId: true,
        },
      },
    },
  });

  // De más antigua a más reciente (el avance se lee mejor en orden cronológico).
  // belongsToClient: misma defensa de runtime que el chokepoint (links cross-client stale).
  const sessions = links
    .map((l) => l.session)
    .filter((s) => belongsToClient(s, project.clientId))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  if (!sessions.length) return [];

  // UNA consulta para lo que dejaron todas (minuta y notas) y otra, sin traer el texto, para saber cuáles tienen
  // transcripción; la transcripción se trae solo de la nueva.
  const ids = sessions.map((s) => s.id);
  const [filas, conTranscripcion] = await Promise.all([
    prisma.firefliesSession.findMany({
      where: { id: { in: ids } },
      select: { id: true, summary: true, minute: { select: { summary: true, decisions: true, agreements: true, risks: true, status: true } } },
    }),
    prisma.firefliesSession.findMany({ where: { id: { in: ids }, transcript: { not: null } }, select: { id: true } }),
  ]);
  const resumenes = new Map(
    filas.map((f) => {
      const titulo = sessions.find((s) => s.id === f.id)?.title ?? "(sin título)";
      return [f.id, resumenDeReunion({ title: titulo, summary: f.summary, minuta: f.minute }).texto] as const;
    }),
  );
  const tienenTranscripcion = new Set(conTranscripcion.map((f) => f.id));
  const nuevaId = laReunionNueva(sessions, (id) => !!resumenes.get(id)?.trim() || tienenTranscripcion.has(id), opts.nuevaId);
  const transcripcionDeLaNueva =
    nuevaId && tienenTranscripcion.has(nuevaId)
      ? ((await prisma.firefliesSession.findUnique({ where: { id: nuevaId }, select: { transcript: true } }))?.transcript ?? null)
      : null;

  return sessions.map((s) => {
    const entera = s.id === nuevaId;
    return {
      id: s.id,
      title: s.title ?? "(sin título)",
      date: s.date,
      participants: s.participants,
      organizerEmail: s.organizerEmail,
      content: contenidoParaElAvance({ resumen: resumenes.get(s.id) ?? "", transcripcion: entera ? transcripcionDeLaNueva : null, entera }),
      entera,
      conTranscripcion: tienenTranscripcion.has(s.id),
    };
  });
}

/**
 * Fecha de la sesión de KICKOFF del proyecto (la titulada kickoff más cercana a la
 * creación del proyecto — ver pickKickoffSessionDate en kickoff-pick.ts), o null si
 * no hay. Fuente de verdad de la heurística "kickoff" — la reusan: la derivación del
 * anchor del cronograma al generar (analyze), el GET del timeline (para sugerirla en
 * la UI) y el backfill. Se matchea por TÍTULO (no por la primera sesión: la primera
 * suele ser el Hand Off de Sales→CS, no el kickoff).
 */
export async function getKickoffSessionDate(projectId: string): Promise<Date | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { createdAt: true, hubspotCreatedAt: true },
  });
  if (!project) return null;

  const links = await prisma.sessionProject.findMany({
    where: {
      projectId,
      included: true,
      session: { OR: KICKOFF_TITLE_FILTERS },
    },
    select: { session: { select: { date: true } } },
  });
  return pickKickoffSessionDate(
    links.map((l) => l.session.date),
    project.hubspotCreatedAt ?? project.createdAt,
  );
}
