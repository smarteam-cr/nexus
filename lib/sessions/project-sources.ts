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
 *
 * U1 (2026-10-25): una reunión cuyo evento se canceló y no tiene texto, minuta, hechos ni tareas no sale de acá
 * (lib/sessions/canceladas.ts). La cancelada con algo de eso sí: queda para que una persona la revise.
 */
import { prisma } from "@/lib/db/prisma";
import { asignarDuenioManual } from "./duenio-manual";
import { linkFeedsTimeline } from "@/lib/timeline/session-feeding";
import {
  COLUMNA_DEL_DESTINO,
  esSoloElegidas,
  linkFeedsDocumento,
  linkFeedsExploracion,
  type DestinoDeDocumento,
} from "./destinos-de-contexto";
import { etiquetaDeSala } from "./etiqueta-de-sala";
import { buildInternalDomainsSet } from "@/lib/sessions/categorize";
import { getSessionCategories } from "@/lib/cache/session-categories";
import { pisoDelProyecto, quedaAntesDelPiso } from "./piso-del-proyecto";
import { NO_ES_CONTENEDOR_WHERE } from "@/lib/projects/scope";
import { NO_ES_CANCELADA_SIN_TEXTO, noEsCanceladaSinTextoSql } from "./canceladas";
import { Prisma } from "@prisma/client";

/** Compatible con `RawTranscript` de analyze (date en epoch ms). */
export interface ProjectSourceSession {
  id: string;
  title: string;
  date: number; // epoch ms
  participants: string[]; // organizerEmail incluido (para detectar Ventas/roles)
  handoffOverride: boolean | null; // solo significativo en getProjectHandoffSessions
  /** El afinado del CRONOGRAMA (la X / «Agregar» de su Contexto). Ver lib/timeline/session-feeding. */
  timelineOverride: boolean | null;
  /** El afinado del «Contexto del diagnóstico» (null = sugerida). Ver destinos-de-contexto.ts. */
  diagnosisOverride: boolean | null;
  planningOverride: boolean | null;
  implementationOverride: boolean | null;
  kickoffOverride: boolean | null;
  explorationOverride: boolean | null;
  techRequirementsOverride: boolean | null;
  deliveryOverride: boolean | null;
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
  /** Vinculadas pero anteriores al piso del proyecto (lib/sessions/piso-del-proyecto.ts): no alimentan. */
  anteriores?: DroppedLink[];
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
 * Filtro de `FirefliesSession` (para componer en un `where` de una relación `session`): la reunión sigue VINCULADA a ese
 * proyecto (el vínculo incluido). Lo usan los lectores de los hechos de un proyecto (lib/seguimiento): una reunión que
 * alguien desvinculó del proyecto deja de proponerle novedades y de entrar a su memoria. Vive acá para que nadie lea
 * `SessionProject` por su cuenta.
 */
export function whereVinculadaAlProyecto(projectId: string) {
  return { projects: { some: { projectId, included: true } } };
}

/**
 * EL dueño de una sesión, cuando hace falta UNO solo (no "¿es de este cliente?", que es
 * `belongsToClient`, sino "¿de quién es?"). Es la precedencia que ya usan INV42 y Tareas:
 * `resolvedClientId` ya materializa el override manual (paso 1 de la cascada de
 * lib/sessions/categorize.ts), así que gana; el manual cuenta solo si no hay resolución
 * (por ejemplo, la cascada todavía no corrió). Un manual colgado —cliente borrado, que no es
 * clave foránea— no le gana nunca a una resolución viva.
 */
export function duenoDeLaSesion(s: {
  resolvedClientId: string | null;
  manualClientId: string | null;
}): string | null {
  return s.resolvedClientId ?? s.manualClientId ?? null;
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
  actorEmail: string | null = null,
): Promise<boolean> {
  const s = await prisma.firefliesSession.findUnique({
    where: { id: sessionId },
    select: { resolvedClientId: true, manualClientId: true },
  });
  if (!s || s.resolvedClientId !== null || s.manualClientId !== null) return false;

  /* Con procedencia "adopcion": es un EFECTO de agregar la reunión al proyecto, no una
     decisión de a quién pertenece. Es lo único que un "devolver a internas" puede deshacer
     solo, sin arriesgarse a pisar una elección humana. */
  const escribio = await asignarDuenioManual(sessionId, clientId, {
    origen: "adopcion",
    actorEmail,
    soloSiSinDuenio: true,
  });
  if (!escribio) return false;
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
 *
 * `elegidaEn` (etapa 7, solo lo pasa `getProjectDocumentSessions`): la columna del documento que se está
 * leyendo. Un vínculo con `true` en esa columna lo eligió una PERSONA para ese documento, y el piso del
 * proyecto no lo deja afuera, igual que a un vínculo manual (piso-del-proyecto.ts). Sin eso, una reunión
 * de antes del piso se veía «elegida» en el panel y el documento no la leía. Solo vale para ESE
 * documento: el resto de la membresía (el handoff, la memoria) sigue con el piso.
 */
export async function getProjectMemberSessions(
  projectId: string,
  opts: { elegidaEn?: (typeof COLUMNA_DEL_DESTINO)[DestinoDeDocumento] } = {},
): Promise<ProjectSourcesResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { clientId: true, createdAt: true, hubspotCreatedAt: true },
  });
  if (!project) return { sessions: [], dropped: [] };
  /* El piso solo existe si el cliente ya tuvo OTRO proyecto antes que éste: su historia vieja es de ese
     otro. Ver lib/sessions/piso-del-proyecto.ts (caso «CAV - SHP», 2026-10-02). */
  const anteriorDelCliente = await prisma.project.count({
    where: {
      clientId: project.clientId,
      id: { not: projectId },
      createdAt: { lt: project.createdAt },
      ...NO_ES_CONTENEDOR_WHERE,
      esPrueba: false, // un proyecto de prueba no es historia que le ponga piso a otro
    },
  });
  const piso = pisoDelProyecto(project, anteriorDelCliente > 0);

  const links = await prisma.sessionProject.findMany({
    where: { projectId, included: true, session: NO_ES_CANCELADA_SIN_TEXTO },
    select: {
      handoffOverride: true,
      timelineOverride: true,
      diagnosisOverride: true,
      planningOverride: true,
      implementationOverride: true,
      kickoffOverride: true,
      explorationOverride: true,
      techRequirementsOverride: true,
      deliveryOverride: true,
      isPrimary: true,
      confidence: true,
      source: true,
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
  const anteriores: DroppedLink[] = [];
  for (const l of links) {
    const s = l.session;
    if (!belongsToClient(s, project.clientId)) {
      dropped.push({ sessionId: s.id, title: s.title, resolvedClientId: s.resolvedClientId });
      continue;
    }
    const elegidaParaEsteDocumento = opts.elegidaEn ? l[opts.elegidaEn] === true : false;
    if (!elegidaParaEsteDocumento && quedaAntesDelPiso(s.date.getTime(), piso, l.source)) {
      anteriores.push({ sessionId: s.id, title: s.title, resolvedClientId: s.resolvedClientId });
      continue;
    }
    sessions.push({
      id: s.id,
      title: s.title,
      date: s.date.getTime(),
      participants: foldOrganizer(s.participants, s.organizerEmail),
      handoffOverride: l.handoffOverride,
      timelineOverride: l.timelineOverride,
      diagnosisOverride: l.diagnosisOverride,
      planningOverride: l.planningOverride,
      implementationOverride: l.implementationOverride,
      kickoffOverride: l.kickoffOverride,
      explorationOverride: l.explorationOverride,
      techRequirementsOverride: l.techRequirementsOverride,
      deliveryOverride: l.deliveryOverride,
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
  return { sessions, dropped, anteriores };
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
 * Sesiones que alimentan al CRONOGRAMA (2026-09-23, «Contexto del cronograma»): de la membresía del
 * proyecto, SOLO las que el CSE eligió (las que trae de su calendario quedan como reuniones del
 * proyecto al elegirlas, así que también pasan por acá). Pasa por el MISMO chokepoint que el
 * resto —la pertenencia al cliente y el tombstone no se re-implementan— y aplica la regla única de
 * `lib/timeline/session-feeding.ts`. Las futuras NO se cortan acá: eso lo hace quien arma el
 * material, igual que para el handoff.
 */
export async function getProjectTimelineSessions(projectId: string): Promise<ProjectSourcesResult> {
  const r = await getProjectMemberSessions(projectId);
  return {
    // La membresía ya trae `included: true`; la regla lo vuelve a mirar a propósito (una sola regla).
    sessions: r.sessions.filter((s) => linkFeedsTimeline({ included: true, timelineOverride: s.timelineOverride })),
    dropped: r.dropped,
  };
}

/**
 * Sesiones que alimentan al DIAGNÓSTICO: de la membresía del proyecto, SOLO las que eligió una
 * persona (etapa 7, ver `getProjectDocumentSessions`). Las futuras NO se cortan acá: eso lo hace quien
 * arma el material.
 */
export async function getProjectDiagnosisSessions(projectId: string): Promise<ProjectSourcesResult> {
  return getProjectDocumentSessions(projectId, "diagnostico");
}

/**
 * Sesiones que alimentan a un DOCUMENTO con «Contexto adicional» (lib/contexto/documento.ts), cada
 * uno con su propia columna de afinado y la MISMA regla que muestra su panel (`alimenta`,
 * lib/sessions/destinos-de-contexto.ts): lo que la pantalla dice que alimenta es lo que se lee.
 *
 *  · Los seis de `DESTINOS_SOLO_ELEGIDAS` (diagnóstico, planificación, ejecución, kickoff,
 *    integraciones y entrega — etapa 7, DECISIONS «Los documentos leen la memoria y solo las
 *    reuniones elegidas»): SOLO las que eligió una persona (`true`). Sin tocar no entra, y no se mira
 *    la sala: una elegida de puertas adentro entra, con su rótulo (el material la marca). Tampoco la
 *    deja afuera el piso del proyecto (`elegidaEn`): el panel la muestra elegida y el documento la lee.
 *  · La exploración conserva la regla sugerida de antes (`linkFeedsExploracion`: con el cliente y nadie
 *    la sacó, o agregada) hasta salir del módulo.
 *
 * Mismo chokepoint que el resto (`getProjectMemberSessions`): la pertenencia al cliente y el tombstone
 * no se re-implementan. Las futuras NO se cortan acá: eso lo hace quien arma el material.
 */
export async function getProjectDocumentSessions(
  projectId: string,
  destino: DestinoDeDocumento,
): Promise<ProjectSourcesResult> {
  const columna = COLUMNA_DEL_DESTINO[destino];
  if (esSoloElegidas(destino)) {
    // La elegida de antes del piso del proyecto se lee igual: la eligió una persona (`elegidaEn`).
    const r = await getProjectMemberSessions(projectId, { elegidaEn: columna });
    return {
      // La membresía ya trae `included: true`; la regla lo vuelve a mirar a propósito (una sola regla).
      sessions: r.sessions.filter((s) => linkFeedsDocumento({ included: true, override: s[columna] })),
      dropped: r.dropped,
    };
  }
  const [r, categorias] = await Promise.all([getProjectMemberSessions(projectId), getSessionCategories()]);
  const dominiosPropios = buildInternalDomainsSet(categorias);
  return {
    sessions: r.sessions.filter((s) =>
      linkFeedsExploracion(
        { included: true, override: s[columna] },
        etiquetaDeSala({ participants: s.participants }, dominiosPropios) === "CON EL CLIENTE",
      ),
    ),
    dropped: r.dropped,
  };
}

/**
 * Todas las sesiones de un CLIENTE (client-wide), por la misma regla de pertenencia.
 * Para los caminos que arman contexto a nivel cliente (no proyecto), ej. análisis y
 * el handoff legacy sin proyecto. Reemplaza los queries por título/dominio sin filtro.
 *
 * ⚠ SOLO SESIONES QUE YA OCURRIERON (2026-08-18). Esta función ordena por `date: desc`
 * y recorta a `take`, así que sin el techo las reuniones AGENDADAS iban primeras y se
 * comían la ventana: medido en producción, el 42 % del contexto de Multiquímica, el
 * 35 % del de SmartAgro y el 24 % del de Smarteam eran reuniones que no habían pasado
 * (18 clientes afectados). El modelo las recibía como `[fecha] Título`, sin forma de
 * saber que no ocurrieron. Ver `lib/sessions/ocurridas.ts`.
 *
 * `ids` (2026-10-07): solo esas reuniones, si son del cliente. Lo usa la preventa para leer las que el
 * vendedor eligió en el buscador aunque no estén entre las más recientes; un id de otro cliente no sale.
 */
export async function getClientSessions(
  clientId: string,
  opts: { before?: Date; take?: number; ids?: readonly string[] } = {},
): Promise<ProjectSourceSession[]> {
  if (opts.ids && opts.ids.length === 0) return [];
  // `before` (cuando viene) acota MÁS, nunca menos: un `before` futuro no puede
  // destapar lo que todavía no ocurrió. De ahí el mínimo entre los dos techos.
  const ahora = new Date();
  const techo = opts.before && opts.before < ahora ? opts.before : ahora;

  const rows = await prisma.firefliesSession.findMany({
    where: {
      ...whereBelongsToClient(clientId),
      date: { lte: techo },
      ...(opts.ids ? { id: { in: [...opts.ids] } } : {}),
      AND: [NO_ES_CANCELADA_SIN_TEXTO],
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
    timelineOverride: null,
    diagnosisOverride: null,
    planningOverride: null,
    implementationOverride: null,
    kickoffOverride: null,
    explorationOverride: null,
    techRequirementsOverride: null,
    deliveryOverride: null,
    isPrimary: false,
    confidence: null,
  }));
}

/**
 * Cuántas reuniones asignó la IA a cada proyecto y nadie revisó todavía, EN LOTE.
 *
 * Es el `unreviewedCount` de GET /api/projects/[id]/project-sessions —mismo criterio, mismas
 * tres condiciones (`included`, `source: "agent"`, `reviewedAt` en null) y el mismo filtro de
 * pertenencia— para muchos proyectos con UNA consulta. Lo usa el panel «Necesitan atención» del
 * índice de clientes (2026-10-04), que antes no tenía forma de saberlo sin abrir cada ficha.
 *
 * ⚠ Solo tiene sentido en empresas con 2+ proyectos abiertos: con uno solo, una reunión de la
 * empresa no puede caer en el proyecto equivocado (el chip de la ficha se apaga igual). Lo decide
 * el llamador, que es quien sabe cuántos proyectos tiene cada empresa.
 *
 * Vive acá porque lee `SessionProject`: todo consumidor de sesiones pasa por el chokepoint, y el
 * filtro `belongsToClient` descarta los vínculos que cruzan de cliente (los muestra el route igual).
 */
export async function contarSesionesSinRevisar(
  proyectos: readonly { id: string; clientId: string }[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (proyectos.length === 0) return out;
  const clienteDe = new Map(proyectos.map((p) => [p.id, p.clientId]));
  const links = await prisma.sessionProject.findMany({
    where: { projectId: { in: [...clienteDe.keys()] }, included: true, source: "agent", reviewedAt: null, session: NO_ES_CANCELADA_SIN_TEXTO },
    select: { projectId: true, session: { select: { resolvedClientId: true, manualClientId: true } } },
  });
  for (const l of links) {
    const clientId = clienteDe.get(l.projectId);
    if (!clientId || !belongsToClient(l.session, clientId)) continue;
    out.set(l.projectId, (out.get(l.projectId) ?? 0) + 1);
  }
  return out;
}

/**
 * De una lista de dominios y correos, los que también aparecen en reuniones de OTROS clientes del último
 * año: HubSpot, una agencia, un integrador que trabaja con varias empresas. Reconocer a una empresa por esa
 * gente mezcla clientes (invariante 1): «Agendadas» de la exploración listaba, con título y hora, reuniones
 * de otros clientes porque en una reunión de la empresa había estado alguien de HubSpot. Solo mira quiénes
 * estuvieron, nunca el contenido de una reunión. Un dominio genérico (gmail) se pasa como correo, no como
 * dominio: lo usan muchas empresas.
 */
export async function genteCompartidaConOtrosClientes(
  clientId: string,
  o: { dominios: readonly string[]; correos: readonly string[]; desde?: Date },
): Promise<{ dominios: Set<string>; correos: Set<string> }> {
  const dominios = [...new Set(o.dominios.map((d) => d.trim().toLowerCase()).filter(Boolean))];
  const correos = [...new Set(o.correos.map((c) => c.trim().toLowerCase()).filter(Boolean))];
  const vacio = { dominios: new Set<string>(), correos: new Set<string>() };
  if (!dominios.length && !correos.length) return vacio;
  const desde = o.desde ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  // De otro: tiene dueño y no es de este cliente (ni por la resolución ni por el manual).
  const filas = await prisma.$queryRaw<{ correo: string }[]>`
    SELECT DISTINCT lower(p) AS "correo"
    FROM "FirefliesSession" s, unnest(s."participants") AS p
    WHERE s."date" >= ${desde}
      AND (s."resolvedClientId" IS NOT NULL OR s."manualClientId" IS NOT NULL)
      AND s."resolvedClientId" IS DISTINCT FROM ${clientId}
      AND s."manualClientId" IS DISTINCT FROM ${clientId}
      AND (lower(split_part(p, '@', 2)) = ANY(${dominios}::text[]) OR lower(p) = ANY(${correos}::text[]))`;
  const out = { dominios: new Set<string>(), correos: new Set<string>() };
  const pedidos = new Set(dominios);
  for (const f of filas) {
    const d = f.correo.split("@")[1] ?? "";
    if (pedidos.has(d)) out.dominios.add(d);
    out.correos.add(f.correo);
  }
  return out;
}

/**
 * Las reuniones de Meet de una ventana, con su DUEÑO y si tienen texto, para saber si una reunión o una llamada de
 * HubSpot ya llega por Meet (U7, 2026-10-25: lib/comunicaciones/reuniones.ts). Vive acá porque decide de quién es cada
 * reunión: el dueño es `duenoDeLaSesion`, el mismo de todas las lecturas, y la cancelada sin texto no sale (como en
 * todo el chokepoint). «Texto» = transcripción, resumen o minuta. Solo lee: ni el transcript viaja (se mide en SQL).
 */
export async function indiceDeReunionesDeMeet(o: { desde: Date; hasta: Date }): Promise<
  { id: string; googleEventId: string | null; conferenceId: string | null; inicio: number; clientId: string | null; conTexto: boolean }[]
> {
  const filas = await prisma.$queryRaw<
    { id: string; googleEventId: string | null; conferenceId: string | null; date: Date; resolvedClientId: string | null; manualClientId: string | null; conTexto: boolean }[]
  >(Prisma.sql`
    SELECT s."id", s."googleEventId", s."conferenceId", s."date", s."resolvedClientId", s."manualClientId",
      (coalesce(length(s."transcript"), 0) > 0
        OR (s."summary" IS NOT NULL AND s."summary" <> 'null'::jsonb)
        OR EXISTS (SELECT 1 FROM "SessionMinute" m WHERE m."sessionId" = s."id")) AS "conTexto"
    FROM "FirefliesSession" s
    WHERE s."date" >= ${o.desde} AND s."date" <= ${o.hasta} AND ${noEsCanceladaSinTextoSql("s")}`);
  return filas.map((f) => ({
    id: f.id,
    googleEventId: f.googleEventId,
    conferenceId: f.conferenceId,
    inicio: f.date.getTime(),
    clientId: duenoDeLaSesion(f),
    conTexto: f.conTexto,
  }));
}
