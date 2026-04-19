/**
 * lib/google/meet-sync.ts
 *
 * Sincronización de sesiones Google Meet → FirefliesSession DB.
 *
 * Guarda TODOS los eventos de Google Meet del dominio (90 días),
 * independientemente de si pertenecen a un cliente registrado.
 * El matching con cliente se hace en tiempo de consulta (analyze/route.ts).
 *
 * Flujo:
 *   1. Lista todos los usuarios del dominio via Admin SDK
 *   2. Para cada usuario (batches de 5): impersona y busca eventos de Calendar
 *      con conferenceData.conferenceSolution.key.type === 'hangoutsMeet'
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

const DAYS_BACK = 90;
const USER_BATCH_SIZE = 5;
const MIME_GOOGLE_DOC = "application/vnd.google-apps.document";

// ── Fetch de eventos Meet para un usuario ─────────────────────────────────────

async function fetchMeetEventsForUser(userEmail: string): Promise<MeetEvent[]> {
  try {
    const auth = getImpersonatedAuth(userEmail);
    const calendar = google.calendar({ version: "v3", auth });

    const timeMin = new Date();
    timeMin.setDate(timeMin.getDate() - DAYS_BACK);

    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin: timeMin.toISOString(),
      maxResults: 250,
      singleEvents: true,
      orderBy: "startTime",
      fields: "items(id,summary,start,end,attendees,organizer,conferenceData,attachments)",
    });

    const items = res.data.items ?? [];
    const events: MeetEvent[] = [];

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

    return events;
  } catch (err) {
    console.log(
      `[google/sync] Error obteniendo eventos de ${userEmail}:`,
      err instanceof Error ? err.message : err
    );
    return [];
  }
}

// ── Función principal de sync ─────────────────────────────────────────────────

/**
 * Sincroniza TODOS los eventos de Google Meet del dominio.
 * No filtra por cliente — cualquier reunión con Meet se guarda.
 * Deduplica por googleEventId para evitar duplicados entre usuarios del mismo evento.
 */
export async function syncGoogleMeetSessions(): Promise<MeetSyncResult> {
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

  // 2. Cargar googleEventIds ya en DB → Set O(1) para deduplicación rápida
  const existingByEventId = new Set<string>();
  const existingSessions = await prisma.firefliesSession.findMany({
    where: { source: "google_meet" },
    select: { googleEventId: true },
  });
  for (const s of existingSessions) {
    if (s.googleEventId) existingByEventId.add(s.googleEventId);
  }

  // 3. Procesar usuarios en batches de 5
  let synced = 0;
  let alreadyExisted = 0;

  for (let i = 0; i < domainUsers.length; i += USER_BATCH_SIZE) {
    const userBatch = domainUsers.slice(i, i + USER_BATCH_SIZE);
    const batchResults = await Promise.all(
      userBatch.map((u) => fetchMeetEventsForUser(u.email))
    );

    for (const events of batchResults) {
      for (const event of events) {
        // Deduplicar: el mismo evento aparece en el calendario de cada participante
        if (existingByEventId.has(event.eventId)) {
          alreadyExisted++;
          continue;
        }

        // Incluir organizerEmail en participants para matching de ventas en consultas
        const allParticipants = event.organizerEmail
          ? [...new Set([...event.participants, event.organizerEmail])]
          : event.participants;

        const sessionId = `gmeet_${event.eventId}`;

        try {
          await prisma.firefliesSession.upsert({
            where: { id: sessionId },
            update: {
              title: event.title,
              date: event.date,
              duration: event.durationMinutes,
              participants: allParticipants,
              googleEventId: event.eventId,
              googleDocId: event.googleDocId ?? null,
              organizerEmail: event.organizerEmail,
              source: "google_meet",
            },
            create: {
              id: sessionId,
              title: event.title,
              date: event.date,
              duration: event.durationMinutes,
              participants: allParticipants,
              source: "google_meet",
              googleEventId: event.eventId,
              googleDocId: event.googleDocId ?? null,
              organizerEmail: event.organizerEmail,
            },
          });

          existingByEventId.add(event.eventId);
          synced++;
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
  console.log(`[google/sync] Completado: ${synced} nuevas, ${alreadyExisted} ya existían`);
  return { synced, alreadyExisted, total };
}
