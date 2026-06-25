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

function foldOrganizer(participants: string[], organizerEmail: string | null): string[] {
  return organizerEmail ? [...new Set([...participants, organizerEmail])] : participants;
}

/**
 * Sesiones vinculadas a ESTE proyecto que ADEMÁS pertenecen a su cliente. Las que
 * cruzan cliente se descartan (→ `dropped` + console.warn). NO decide relevancia de
 * handoff (eso sigue en classifyForHandoff/handoffOverride aguas abajo) — solo
 * garantiza que el material es del cliente correcto.
 */
export async function getProjectHandoffSessions(projectId: string): Promise<ProjectSourcesResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { clientId: true },
  });
  if (!project) return { sessions: [], dropped: [] };

  const links = await prisma.sessionProject.findMany({
    where: { projectId },
    select: {
      handoffOverride: true,
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
      OR: [{ resolvedClientId: clientId }, { manualClientId: clientId }],
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
    handoffOverride: null,
  }));
}
