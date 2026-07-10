/**
 * lib/google/meet-sync.ts
 *
 * Sincronización de sesiones Google Meet → FirefliesSession DB.
 *
 * Guarda TODOS los eventos de Google Meet del dominio (365 días por defecto),
 * independientemente de si pertenecen a un cliente registrado.
 * El matching con cliente/empresa/categoría se hace en tiempo de consulta
 * (ver lib/sessions/categorize.ts).
 *
 * Flujo:
 *   1. Lista todos los usuarios del dominio via Admin SDK
 *   2. Para cada usuario (batches de 5): impersona y busca eventos de Calendar
 *      con conferenceData.conferenceSolution.key.type === 'hangoutsMeet'
 *      — pagina con nextPageToken hasta cubrir todo el rango DAYS_BACK
 *   3. Deduplica por googleEventId (el mismo evento aparece en calendarios de varios asistentes)
 *   4. Hace upsert en FirefliesSession con source='google_meet'
 */

import { google } from "googleapis";
import { prisma } from "@/lib/db/prisma";
import { getImpersonatedAuth, listDomainUsers } from "@/lib/google/auth";
import { buildCategorizeCtx, resolveSessionClientId } from "@/lib/sessions/resolve-client";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type MeetSyncResult = {
  synced: number;
  alreadyExisted: number;
  total: number;
};

interface MeetEvent {
  eventId: string;
  title: string;
  date: Date;
  durationMinutes: number;
  participants: string[];
  googleDocId?: string;
  organizerEmail: string;
}

// ── Constantes ────────────────────────────────────────────────────────────────

// Retención por defecto: 1 año hacia atrás.
// Configurable via env GOOGLE_MEET_DAYS_BACK para casos puntuales (backfill mayor).
const DAYS_BACK = Number(process.env.GOOGLE_MEET_DAYS_BACK ?? 365);
const USER_BATCH_SIZE = 5;
const PAGE_SIZE = 250; // máx que Google Calendar API permite por página
const MAX_PAGES_PER_USER = 20; // safety cap: 250 * 20 = 5000 eventos/usuario
const MIME_GOOGLE_DOC = "application/vnd.google-apps.document";

// ── Fetch de eventos Meet para un usuario (paginado) ──────────────────────────

async function fetchMeetEventsForUser(userEmail: string, daysBack: number = DAYS_BACK): Promise<MeetEvent[]> {
  try {
    const auth = getImpersonatedAuth(userEmail);
    const calendar = google.calendar({ version: "v3", auth });

    const timeMin = new Date();
    timeMin.setDate(timeMin.getDate() - daysBack);
    // timeMax = mañana. Sin este tope, `singleEvents: true` expande los eventos
    // RECURRENTES años hacia el futuro → la DB se llenó de sesiones fechadas
    // 2037-2038 (65% de la tabla) y la paginación quemaba su presupuesto
    // (MAX_PAGES_PER_USER) en instancias futuras en vez de eventos reales.
    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + 1);

    const events: MeetEvent[] = [];
    let pageToken: string | undefined = undefined;
    let pagesFetched = 0;

    do {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: { data: { items?: import("googleapis").calendar_v3.Schema$Event[]; nextPageToken?: string | null } } = await calendar.events.list({
        calendarId: "primary",
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        maxResults: PAGE_SIZE,
        singleEvents: true,
        orderBy: "startTime",
        pageToken,
        fields: "nextPageToken,items(id,summary,start,end,attendees,organizer,conferenceData,attachments)",
      });

      const items = res.data.items ?? [];
      processItems(items, userEmail, events, { timeMin, timeMax });

      pageToken = res.data.nextPageToken ?? undefined;
      pagesFetched += 1;
      if (pagesFetched >= MAX_PAGES_PER_USER) {
        console.log(`[google/sync] ${userEmail}: alcanzó MAX_PAGES_PER_USER (${MAX_PAGES_PER_USER}), corto la paginación.`);
        break;
      }
    } while (pageToken);

    return events;
  } catch (err) {
    console.log(
      `[google/sync] Error obteniendo eventos de ${userEmail}:`,
      err instanceof Error ? err.message : err
    );
    return [];
  }
}

// Helper: procesa items de una página y los agrega al array de eventos
function processItems(
  items: import("googleapis").calendar_v3.Schema$Event[],
  userEmail: string,
  events: MeetEvent[],
  bounds: { timeMin: Date; timeMax: Date }
): void {
  let outOfRange = 0;
  for (const item of items) {
    // Solo eventos con Google Meet
    const confType = item.conferenceData?.conferenceSolution?.key?.type;
    if (confType !== "hangoutsMeet") continue;

    const eventId = item.id;
    if (!eventId) continue;

    const title = item.summary ?? "(Sin título)";

    const startStr = item.start?.dateTime ?? item.start?.date;
    const endStr = item.end?.dateTime ?? item.end?.date;
    if (!startStr) continue;

    const startDate = new Date(startStr);
    // Validación de rango (defensa en profundidad del timeMax del fetch): NUNCA
    // persistir fechas inválidas o fuera de [timeMin, timeMax] — así es imposible
    // que vuelvan a entrar sesiones futuras (2037-2038) aunque la API o el parseo
    // cambien. Se cuenta y loguea al final (no por evento, para no inundar logs).
    if (isNaN(startDate.getTime()) || startDate < bounds.timeMin || startDate > bounds.timeMax) {
      outOfRange++;
      continue;
    }
    const durationMinutes = endStr
      ? Math.round((new Date(endStr).getTime() - startDate.getTime()) / 60000)
      : 0;

    const participants = (item.attendees ?? [])
      .map((a) => a.email)
      .filter((e): e is string => !!e);

    const organizerEmail = item.organizer?.email ?? userEmail;

    const attachments = item.attachments ?? [];
    const docAttachment = attachments.find((a) => a.mimeType === MIME_GOOGLE_DOC);
    const googleDocId = docAttachment?.fileId ?? undefined;

    events.push({
      eventId,
      title,
      date: startDate,
      durationMinutes,
      participants,
      googleDocId,
      organizerEmail,
    });
  }
  if (outOfRange > 0) {
    console.log(`[google/sync] WARN ${userEmail}: ${outOfRange} eventos con fecha inválida/fuera de rango descartados.`);
  }
}

// ── Función principal de sync ─────────────────────────────────────────────────

/**
 * Sincroniza TODOS los eventos de Google Meet del dominio.
 * No filtra por cliente — cualquier reunión con Meet se guarda.
 * Deduplica por googleEventId para evitar duplicados entre usuarios del mismo evento.
 *
 * @param options.daysBack Días hacia atrás a sincronizar (default: 365 o GOOGLE_MEET_DAYS_BACK).
 *                         Útil para backfill puntual con rangos mayores.
 */
export async function syncGoogleMeetSessions(
  options: { daysBack?: number } = {}
): Promise<MeetSyncResult> {
  const daysBack = options.daysBack ?? DAYS_BACK;
  console.log(`[google/sync] Iniciando sync con daysBack=${daysBack}`);

  const adminEmail = process.env.GOOGLE_ADMIN_EMAIL;
  const serviceKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (!adminEmail || !serviceKey) {
    console.log("[google/sync] Variables GOOGLE_ADMIN_EMAIL o GOOGLE_SERVICE_ACCOUNT_KEY no configuradas");
    return { synced: 0, alreadyExisted: 0, total: 0 };
  }

  // 1. Listar usuarios del dominio
  let domainUsers: { email: string; name: string }[] = [];
  try {
    domainUsers = await listDomainUsers();
  } catch (err) {
    console.log("[google/sync] Error listando usuarios del dominio:", err instanceof Error ? err.message : err);
    return { synced: 0, alreadyExisted: 0, total: 0 };
  }

  if (domainUsers.length === 0) {
    console.log("[google/sync] No se encontraron usuarios en el dominio");
    return { synced: 0, alreadyExisted: 0, total: 0 };
  }

  console.log(`[google/sync] Procesando ${domainUsers.length} usuarios del dominio`);

  // 2. Cargar sesiones ya en DB (con googleDocId actual) → Map O(1) por eventId.
  //    Necesitamos el googleDocId actual para detectar si apareció uno NUEVO
  //    post-reunión y resetear `enrichedAt: null` para que el enrich lo procese.
  //    IMPORTANTE: se incluyen también las filas PRE-REFACTOR (id "gmeet_…" pero
  //    googleEventId nulo o source distinto) — antes quedaban fuera del mapa y el
  //    create() de abajo chocaba con P2002 contra ellas EN CADA corrida, para
  //    siempre (visible en logs de prod: los mismos IDs fallando en cada boot).
  //    Para esas filas el eventId se deriva del propio id; el UPDATE las "sana"
  //    (les escribe googleEventId) preservando su manualClientId.
  const existingByEventId = new Map<string, { id: string; googleDocId: string | null; manualClientId: string | null }>();
  const existingSessions = await prisma.firefliesSession.findMany({
    where: { OR: [{ source: "google_meet" }, { id: { startsWith: "gmeet_" } }] },
    select: { id: true, googleEventId: true, googleDocId: true, manualClientId: true },
  });
  for (const s of existingSessions) {
    const eventId = s.googleEventId ?? (s.id.startsWith("gmeet_") ? s.id.slice("gmeet_".length) : null);
    if (eventId) {
      existingByEventId.set(eventId, { id: s.id, googleDocId: s.googleDocId, manualClientId: s.manualClientId });
    }
  }

  // PERF #1: ctx de categorización una vez por corrida → resolvedClientId inline en cada upsert.
  const categorizeCtx = await buildCategorizeCtx();

  // 3. Procesar usuarios en batches de 5
  let synced = 0;
  let alreadyExisted = 0;
  let docDiscovered = 0; // contador de docs nuevos encontrados en sesiones existentes

  for (let i = 0; i < domainUsers.length; i += USER_BATCH_SIZE) {
    const userBatch = domainUsers.slice(i, i + USER_BATCH_SIZE);
    const batchResults = await Promise.all(
      userBatch.map((u) => fetchMeetEventsForUser(u.email, daysBack))
    );

    for (const events of batchResults) {
      for (const event of events) {
        // Incluir organizerEmail en participants para matching de ventas en consultas
        const allParticipants = event.organizerEmail
          ? [...new Set([...event.participants, event.organizerEmail])]
          : event.participants;

        const sessionId = `gmeet_${event.eventId}`;
        const existing = existingByEventId.get(event.eventId);
        const eventDocId = event.googleDocId ?? null;

        try {
          if (existing) {
            // Sesión ya existe en DB. Detectar si apareció un Doc NUEVO
            // (típicamente Gemini Notes generado post-reunión).
            const docJustAppeared = !existing.googleDocId && !!eventDocId;
            const docChanged = !!existing.googleDocId && !!eventDocId && existing.googleDocId !== eventDocId;
            const shouldResetEnrichment = docJustAppeared || docChanged;

            await prisma.firefliesSession.update({
              where: { id: existing.id },
              data: {
                title: event.title,
                date: event.date,
                duration: event.durationMinutes,
                participants: allParticipants,
                googleEventId: event.eventId,
                googleDocId: eventDocId,
                organizerEmail: event.organizerEmail,
                source: "google_meet",
                // PERF #1: re-resolver el cliente (honra el override manualClientId existente).
                resolvedClientId: resolveSessionClientId({ title: event.title, participants: allParticipants, manualClientId: existing.manualClientId }, categorizeCtx),
                // Si el Doc apareció (o cambió) post-sync inicial, resetear
                // `enrichedAt: null` para forzar que el enrich lo procese
                // en la próxima pasada y descargue transcript + summary.
                ...(shouldResetEnrichment ? { enrichedAt: null } : {}),
              },
            });

            alreadyExisted++;
            if (shouldResetEnrichment) {
              docDiscovered++;
              console.log(`[google/sync] Doc descubierto post-sync para ${event.eventId} (${event.title}). enrichedAt reset.`);
            }
          } else {
            // Sesión nueva. UPSERT (no create): si otra corrida concurrente creó la
            // fila entre nuestra precarga del mapa y este write (cooldown reseteado
            // por deploy, disparo manual en paralelo…), el create fallaba con P2002.
            // En la rama update NO se toca resolvedClientId: no conocemos el
            // manualClientId de esa fila (no estaba en el mapa) y recalcularlo con
            // null podría pisar una asignación manual — la próxima corrida la ve
            // en el mapa y la actualiza completa por la rama de arriba.
            await prisma.firefliesSession.upsert({
              where: { id: sessionId },
              create: {
                id: sessionId,
                title: event.title,
                date: event.date,
                duration: event.durationMinutes,
                participants: allParticipants,
                source: "google_meet",
                googleEventId: event.eventId,
                googleDocId: eventDocId,
                organizerEmail: event.organizerEmail,
                // PERF #1: resolver el cliente al crear (sesión nueva → sin override).
                resolvedClientId: resolveSessionClientId({ title: event.title, participants: allParticipants, manualClientId: null }, categorizeCtx),
              },
              update: {
                title: event.title,
                date: event.date,
                duration: event.durationMinutes,
                participants: allParticipants,
                source: "google_meet",
                googleEventId: event.eventId,
                googleDocId: eventDocId,
                organizerEmail: event.organizerEmail,
              },
            });

            existingByEventId.set(event.eventId, { id: sessionId, googleDocId: eventDocId, manualClientId: null });
            synced++;
          }
        } catch (err) {
          console.log(
            `[google/sync] WARN error persistiendo sesión ${event.eventId} ("${event.title}", ${event.date.toISOString()}):`,
            err instanceof Error ? err.message : err
          );
        }
      }
    }
  }

  const total = synced + alreadyExisted;
  console.log(
    `[google/sync] Completado: ${synced} nuevas, ${alreadyExisted} actualizadas (${docDiscovered} con Doc nuevo descubierto)`
  );
  return { synced, alreadyExisted, total };
}
