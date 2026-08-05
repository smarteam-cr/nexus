/**
 * lib/sessions/project-sources.ts
 *
 * CHOKEPOINT único de "sesiones-fuente" para generación. TODA generación que arma
 * contexto desde sesiones (handoff, análisis client-wide, etc.) DEBE pasar por acá —
 * nunca leer `SessionProject`/`FirefliesSession` por su cuenta — para que el invariante
 *
 *     una sesión solo alimenta a su cliente:
 *       session.resolvedClientId === project.clientId   (o manualClientId)
 *
 * se cumpla en UN solo lugar. `resolvedClientId` es la fuente ÚNICA de ownership
 * (materialización de `categorizeSession`; ver lib/sessions/resolve-client.ts). Las
 * sesiones que cruzan cliente se DESCARTAN acá (y se loguean) — defensa de runtime
 * contra links `SessionProject` stale/legacy/cross-client.
 *
 * El check de invariante (scripts/check-invariants.ts) verifica que no queden links
 * cruzados; este chokepoint es la red de runtime aunque alguno se cuele.
 */
import { prisma } from "@/lib/db/prisma";

/** Compatible con `RawTranscript` de analyze (date en epoch ms). */
export interface ProjectSourceSession {
  id: string;
  title: string;
  date: number; // epoch ms
  participants: string[]; // organizerEmail incluido (para detectar Ventas/roles)
  handoffOverride: boolean | null; // solo significativo en getProjectHandoffSessions
  /** Link primario de la sesión en ESTE proyecto (política linkFeedsHandoff aguas abajo). */
  isPrimary: boolean;
  /** Confianza del clasificador para este link (null si manual/legacy). */
  confidence: number | null;
}

export interface DroppedLink {
  sessionId: string;
  title: string;
  resolvedClientId: string | null;
}

export interface ProjectSourcesResult {
  sessions: ProjectSourceSession[];
  dropped: DroppedLink[];
}

/**
 * Único criterio de ownership: una sesión pertenece al cliente si su resolución
 * materializada (`resolvedClientId`) o su override manual apuntan a ese cliente.
 */
export function belongsToClient(
  s: { resolvedClientId: string | null; manualClientId: string | null },
  clientId: string,
): boolean {
  return s.resolvedClientId === clientId || s.manualClientId === clientId;
}

/**
 * El MISMO criterio, en forma de `where` de Prisma. Es el gemelo de `belongsToClient` y vive
 * pegado a él a propósito: son una sola regla y tienen que poder leerse juntas.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * El `OR` se escribía a mano en ocho consultas, y una de ellas —el widget del GPS— lo escribía
 * DISTINTO: `manualClientId === c` O (`manualClientId === null` Y `resolvedClientId === c`), o
 * sea "el override manda". Suena más correcto y es una trampa: esa forma solo funciona si
 * `manualClientId` garantiza apuntar a un cliente vivo, y **no lo garantiza nadie** —no es clave
 * foránea, así que borrar un cliente lo deja colgando—. Con un override colgado, la sesión falla
 * las DOS ramas y el widget dice "Sin agendar" con la reunión agendada. Es el síntoma exacto del
 * incidente del 2026-08-04, y estaba en producción.
 *
 * Escribir la regla una vez y llamarla ocho veces vuelve imposible tener dos criterios de
 * pertenencia — que es el mismo motivo por el que `componerCon` existe en `lib/projects/scope.ts`.
 */
export function whereBelongsToClient(clientId: string) {
  return { OR: [{ resolvedClientId: clientId }, { manualClientId: clientId }] };
}

/**
 * Le da dueño a una sesión HUÉRFANA para que pueda alimentar un proyecto. Es la contracara de
 * `belongsToClient`, y vive al lado porque hay que leerlas juntas.
 *
 * ── POR QUÉ HACE FALTA ───────────────────────────────────────────────────────
 * Crear el vínculo NO alcanza. Los endpoints que escriben `SessionProject` dejan pasar una sesión
 * sin dueño, pero después `getProjectMemberSessions` la DESCARTA al leer (abajo, con un
 * `console.warn` que nadie mira). O sea: el botón "Agregar" parece funcionar, la fila queda
 * escrita, y el handoff sigue vacío. Falla silenciosa.
 *
 * ── LOS DOS FRENOS, Y POR QUÉ ────────────────────────────────────────────────
 * · **Solo si NO tiene dueño**, por las dos vías. Una sesión que ya es de alguien no se roba:
 *   para eso está el rechazo cross-cliente de los endpoints, y romperlo sería mover contexto de
 *   un cliente a otro sin que nadie lo pida.
 * · **Sin reclasificación de IA.** El humano ACABA de elegir el proyecto; pagar el modelo para
 *   que adivine lo mismo cuesta del orden de un dólar por click y encima puede proponer links a
 *   otros proyectos del cliente que nadie pidió.
 *
 * ⚠ Es una escritura DURABLE de pertenencia: desde acá la sesión cuenta como del cliente en todas
 * las lecturas, no solo en este proyecto. Se revierte desde /sessions quitando la asignación.
 *
 * Devuelve `true` si adoptó. `manualClientId` gana en el primer paso de la cascada, así que la
 * resolución queda coherente y INV1 en verde por construcción.
 */
export async function adoptarSesionSinDuenio(
  sessionId: string,
  clientId: string,
): Promise<boolean> {
  const s = await prisma.firefliesSession.findUnique({
    where: { id: sessionId },
    select: { resolvedClientId: true, manualClientId: true },
  });
  if (!s || s.resolvedClientId !== null || s.manualClientId !== null) return false;

  await prisma.firefliesSession.update({ where: { id: sessionId }, data: { manualClientId: clientId } });
  const { reResolveSession } = await import("./resolve-client");
  await reResolveSession(sessionId, undefined, { reclassify: false });
  return true;
}

function foldOrganizer(participants: string[], organizerEmail: string | null): string[] {
  return organizerEmail ? [...new Set([...participants, organizerEmail])] : participants;
}

/**
 * MIEMBROS del contexto del proyecto: sesiones vinculadas a ESTE proyecto con
 * `included: true` (la exclusión humana — tombstone — no alimenta NADA) que ADEMÁS
 * pertenecen a su cliente. Las que cruzan cliente se descartan (→ `dropped` +
 * console.warn). Esta es la noción ÚNICA de membresía que todo consumidor
 * (handoff, cronograma, watchdog, análisis) debe respetar.
 */
export async function getProjectMemberSessions(projectId: string): Promise<ProjectSourcesResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { clientId: true },
  });
  if (!project) return { sessions: [], dropped: [] };

  const links = await prisma.sessionProject.findMany({
    where: { projectId, included: true },
    select: {
      handoffOverride: true,
      isPrimary: true,
      confidence: true,
      session: {
        select: {
          id: true,
          title: true,
          date: true,
          participants: true,
          organizerEmail: true,
          resolvedClientId: true,
          manualClientId: true,
        },
      },
    },
  });

  const sessions: ProjectSourceSession[] = [];
  const dropped: DroppedLink[] = [];
  for (const l of links) {
    const s = l.session;
    if (!belongsToClient(s, project.clientId)) {
      dropped.push({ sessionId: s.id, title: s.title, resolvedClientId: s.resolvedClientId });
      continue;
    }
    sessions.push({
      id: s.id,
      title: s.title,
      date: s.date.getTime(),
      participants: foldOrganizer(s.participants, s.organizerEmail),
      handoffOverride: l.handoffOverride,
      isPrimary: l.isPrimary,
      confidence: l.confidence,
    });
  }

  if (dropped.length > 0) {
    console.warn(
      `[project-sources] project=${projectId} client=${project.clientId}: descartados ` +
        `${dropped.length} link(s) cross-client: ` +
        dropped.map((d) => `${d.sessionId}("${d.title}")→${d.resolvedClientId ?? "null"}`).join(", "),
    );
  }
  return { sessions, dropped };
}

/**
 * Sesiones-fuente del HANDOFF: hoy es la misma membresía (`getProjectMemberSessions`).
 * NO decide qué alimenta el handoff — eso ocurre aguas abajo con `linkFeedsHandoff`
 * (lib/handoff/session-relevance: link primario / secundario de confianza alta /
 * forzado con `handoffOverride`) + la regla de relevancia; para eso expone
 * `isPrimary`/`confidence`/`handoffOverride`. Membresía ("¿es de este proyecto?") ≠
 * feeding de handoff ("¿cuenta la historia de venta de ESTE proyecto?"). El cronograma
 * (lib/timeline/delivery-sessions) y demás consumidores usan la membresía pura y NO
 * respetan la política de handoff (por diseño).
 */
export async function getProjectHandoffSessions(projectId: string): Promise<ProjectSourcesResult> {
  return getProjectMemberSessions(projectId);
}

/**
 * Todas las sesiones de un CLIENTE (client-wide), por la misma regla de pertenencia.
 * Para los caminos que arman contexto a nivel cliente (no proyecto), ej. análisis y
 * el handoff legacy sin proyecto. Reemplaza los queries por título/dominio sin filtro.
 */
export async function getClientSessions(
  clientId: string,
  opts: { before?: Date; take?: number } = {},
): Promise<ProjectSourceSession[]> {
  const rows = await prisma.firefliesSession.findMany({
    where: {
      ...whereBelongsToClient(clientId),
      ...(opts.before ? { date: { lte: opts.before } } : {}),
    },
    orderBy: { date: "desc" },
    take: opts.take ?? 200,
    select: { id: true, title: true, date: true, participants: true, organizerEmail: true },
  });
  return rows.map((s) => ({
    id: s.id,
    title: s.title,
    date: s.date.getTime(),
    participants: foldOrganizer(s.participants, s.organizerEmail),
    // Valores neutros: el camino client-wide (handoff legacy sin proyecto, análisis)
    // NO usa la política de link `linkFeedsHandoff` — sin SessionProject no hay
    // primario/confianza; estos campos existen solo para satisfacer la interface.
    handoffOverride: null,
    isPrimary: false,
    confidence: null,
  }));
}
