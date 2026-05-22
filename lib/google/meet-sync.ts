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

    const events: MeetEvent[] = [];
    let pageToken: string | undefined = undefined;
    let pagesFetched = 0;

    do {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: { data: { items?: import("googleapis").calendar_v3.Schema$Event[]; nextPageToken?: string | null } } = await calendar.events.list({
        calendarId: "primary",
        timeMin: timeMin.toISOString(),
        maxResults: PAGE_SIZE,
        singleEvents: true,
        orderBy: "startTime",
        pageToken,
        fields: "nextPageToken,items(id,summary,start,end,attendees,organizer,conferenceData,attachments)",
      });

      const items = res.data.items ?? [];
      processItems(items, userEmail, events);

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
  events: MeetEvent[]
): void {
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
  const existingByEventId = new Map<string, { id: string; googleDocId: string | null }>();
  const existingSessions = await prisma.firefliesSession.findMany({
    where: { source: "google_meet" },
    select: { id: true, googleEventId: true, googleDocId: true },
  });
  for (const s of existingSessions) {
    if (s.googleEventId) {
      existingByEventId.set(s.googleEventId, { id: s.id, googleDocId: s.googleDocId });
    }
  }

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
            // Sesión nueva
            await prisma.firefliesSession.create({
              data: {
                id: sessionId,
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

            existingByEventId.set(event.eventId, { id: sessionId, googleDocId: eventDocId });
            synced++;
          }
        } catch (err) {
          console.log(
            `[google/sync] Error upserting sesión ${event.eventId}:`,
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
