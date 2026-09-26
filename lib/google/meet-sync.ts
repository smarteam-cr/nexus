/**
 * lib/google/meet-sync.ts
 *
 * Sincronización de sesiones Google Meet → FirefliesSession DB.
 *
 * Guarda TODOS los eventos de Google Meet del dominio (30 días por defecto, ver
 * `diasHaciaAtras`), independientemente de si pertenecen a un cliente registrado.
 * El matching con cliente/empresa/categoría se hace en tiempo de consulta
 * (ver lib/sessions/categorize.ts).
 *
 * Flujo:
 *   1. Lista todos los usuarios del dominio via Admin SDK
 *   2. Para cada usuario (batches de 5): impersona y busca eventos de Calendar
 *      con conferenceData.conferenceSolution.key.type === 'hangoutsMeet'
 *      — pagina con nextPageToken hasta cubrir todo el rango DAYS_BACK
 *   3. Junta las copias de cada reunión por googleEventId (el mismo evento aparece en
 *      calendarios de varios asistentes) → UNA por corrida
 *   4. Lee de la base solo esas filas y solo las columnas que deciden si cambió
 *   5. Crea las nuevas y hace UPDATE SOLO de lo que difiere (lib/google/meet-sync-cambios.ts)
 *
 * ⚠ Incidente 2026-09-21 (821 % de CPU, 1,13 GiB, producción sin atender): esta corrida vive DENTRO
 * del proceso web. Con 365 días, un UPDATE incondicional por copia y la fila entera de vuelta en cada
 * UPDATE, cada corrida hacía 15.011 UPDATE y armaba ~221 MB para tirarlos, cada 20 minutos.
 */

// Import profundo a propósito, nunca la raíz "googleapis": la raíz carga los tipos de ~400 APIs y
// dejó sin memoria el build del VPS (2026-09-26). Ver lib/google/googleapis-sin-raiz.test.ts.
import { calendar as apiCalendar, type calendar_v3 } from "googleapis/build/src/apis/calendar";
import { prisma } from "@/lib/db/prisma";
import { getImpersonatedAuth, listDomainUsers } from "@/lib/google/auth";
import { buildCategorizeCtx, resolveSessionClientId } from "@/lib/sessions/resolve-client";
import {
  cambiosDeSesion,
  diasHaciaAtras,
  enLotes,
  eventIdDeFila,
  fusionarCopia,
  idDeSesion,
  participantesConOrganizador,
  SELECT_SESION_GUARDADA,
  type EventoMeet,
  type SesionGuardada,
} from "@/lib/google/meet-sync-cambios";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type MeetSyncResult = {
  /** Reuniones nuevas (filas creadas). */
  synced: number;
  /** Reuniones de la ventana que ya estaban en la base (cambiaran o no). */
  alreadyExisted: number;
  total: number;
  /** De las que ya existían, cuántas tuvieron un UPDATE porque algo cambió. */
  actualizadas: number;
  /** Cuántas veces aparecieron las reuniones en los calendarios (una por asistente interno). */
  apariciones: number;
};

// ── Constantes ────────────────────────────────────────────────────────────────

// Ventana por defecto: 30 días (antes 365). GOOGLE_MEET_DAYS_BACK sigue mandando si está.
// Qué se pierde y cómo hacer un backfill: ver `diasHaciaAtras` en meet-sync-cambios.ts.
const DAYS_BACK = diasHaciaAtras(process.env.GOOGLE_MEET_DAYS_BACK);
const USER_BATCH_SIZE = 5;
const PAGE_SIZE = 250; // máx que Google Calendar API permite por página
const MAX_PAGES_PER_USER = 20; // safety cap: 250 * 20 = 5000 eventos/usuario
const MIME_GOOGLE_DOC = "application/vnd.google-apps.document";
/** Ids por `IN (...)` al leer lo guardado. */
const LOTE_LECTURA = 500;
/** Reuniones entre dos cesiones del hilo al escribir (categorizar cuesta ~0,16 ms cada una). */
const LOTE_ESCRITURA = 100;

// ── Fetch de eventos Meet para un usuario (paginado) ──────────────────────────

async function fetchMeetEventsForUser(userEmail: string, daysBack: number = DAYS_BACK): Promise<EventoMeet[]> {
  try {
    const auth = getImpersonatedAuth(userEmail);
    const calendar = apiCalendar({ version: "v3", auth });

    const timeMin = new Date();
    timeMin.setDate(timeMin.getDate() - daysBack);
    // timeMax = mañana. Sin este tope, `singleEvents: true` expande los eventos
    // RECURRENTES años hacia el futuro → la DB se llenó de sesiones fechadas
    // 2037-2038 (65% de la tabla) y la paginación quemaba su presupuesto
    // (MAX_PAGES_PER_USER) en instancias futuras en vez de eventos reales.
    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + 1);

    const events: EventoMeet[] = [];
    let pageToken: string | undefined = undefined;
    let pagesFetched = 0;

    do {
      const res: { data: { items?: calendar_v3.Schema$Event[]; nextPageToken?: string | null } } = await calendar.events.list({
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
  items: calendar_v3.Schema$Event[],
  userEmail: string,
  events: EventoMeet[],
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

/* Una sola corrida a la vez en el proceso (2026-09-21): el auto-sync tiene su propio candado, pero
   el botón «Sincronizar» de Integraciones llama acá directo y podía arrancar una segunda corrida
   en paralelo. Quien llega con una corrida en vuelo recibe el resultado de esa, no arranca otra. */
let corridaEnVuelo: Promise<MeetSyncResult> | null = null;

/**
 * Sincroniza TODOS los eventos de Google Meet del dominio.
 * No filtra por cliente — cualquier reunión con Meet se guarda.
 *
 * @param options.daysBack Días hacia atrás a sincronizar (default: 30 o GOOGLE_MEET_DAYS_BACK).
 *                         Útil para backfill puntual con rangos mayores (scripts/backfill-meet.ts).
 */
export function syncGoogleMeetSessions(options: { daysBack?: number } = {}): Promise<MeetSyncResult> {
  if (corridaEnVuelo) {
    console.log("[google/sync] ya hay una corrida en vuelo en este proceso — devuelvo la suya");
    return corridaEnVuelo;
  }
  const corrida = correrSync(options.daysBack ?? DAYS_BACK).finally(() => {
    corridaEnVuelo = null;
  });
  corridaEnVuelo = corrida;
  return corrida;
}

/** Deja correr al resto de los pedidos entre lotes: una corrida larga no congela el proceso. */
function cederElHilo(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function correrSync(daysBack: number): Promise<MeetSyncResult> {
  const t0 = Date.now();
  console.log(`[google/sync] Iniciando sync con daysBack=${daysBack}`);
  const vacio: MeetSyncResult = { synced: 0, alreadyExisted: 0, total: 0, actualizadas: 0, apariciones: 0 };

  const adminEmail = process.env.GOOGLE_ADMIN_EMAIL;
  const serviceKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (!adminEmail || !serviceKey) {
    console.log("[google/sync] Variables GOOGLE_ADMIN_EMAIL o GOOGLE_SERVICE_ACCOUNT_KEY no configuradas");
    return vacio;
  }

  // 1. Listar usuarios del dominio
  let domainUsers: { email: string; name: string }[] = [];
  try {
    domainUsers = await listDomainUsers();
  } catch (err) {
    console.log("[google/sync] Error listando usuarios del dominio:", err instanceof Error ? err.message : err);
    return vacio;
  }

  if (domainUsers.length === 0) {
    console.log("[google/sync] No se encontraron usuarios en el dominio");
    return vacio;
  }

  console.log(`[google/sync] Procesando ${domainUsers.length} usuarios del dominio`);

  // 2. Traer los calendarios (batches de 5 usuarios) y juntar las copias de cada reunión.
  //    La misma reunión aparece en el calendario de cada asistente interno: antes se escribía una
  //    vez por copia (15.011 UPDATE por corrida para 6.176 reuniones). Ahora queda UNA por eventId.
  const eventos = new Map<string, EventoMeet>();
  let apariciones = 0;
  for (let i = 0; i < domainUsers.length; i += USER_BATCH_SIZE) {
    const userBatch = domainUsers.slice(i, i + USER_BATCH_SIZE);
    const batchResults = await Promise.all(userBatch.map((u) => fetchMeetEventsForUser(u.email, daysBack)));
    for (const events of batchResults) {
      for (const event of events) {
        apariciones++;
        eventos.set(event.eventId, fusionarCopia(eventos.get(event.eventId), event));
      }
    }
  }

  // 3. Leer de la base SOLO las filas de esas reuniones y SOLO las columnas que deciden si algo
  //    cambió (SELECT_SESION_GUARDADA: ni transcripción ni resumen). Antes se precargaban las
  //    7.767 filas de Meet aunque la ventana trajera 656.
  //    Se incluyen las filas PRE-REFACTOR (id "gmeet_…" con googleEventId nulo o source distinto):
  //    si quedaran afuera, el upsert de abajo las trataría como nuevas; la comparación las «sana»
  //    (les escribe googleEventId y source) preservando su manualClientId.
  const guardadas = new Map<string, SesionGuardada>();
  for (const lote of enLotes([...eventos.keys()], LOTE_LECTURA)) {
    const filas = await prisma.firefliesSession.findMany({
      where: {
        AND: [
          { OR: [{ source: "google_meet" }, { id: { startsWith: "gmeet_" } }] },
          { OR: [{ googleEventId: { in: lote } }, { id: { in: lote.map(idDeSesion) } }] },
        ],
      },
      select: SELECT_SESION_GUARDADA,
    });
    for (const fila of filas) {
      const eventId = eventIdDeFila(fila);
      if (eventId) guardadas.set(eventId, fila);
    }
  }

  // PERF #1: ctx de categorización una vez por corrida → resolvedClientId inline en cada write.
  const categorizeCtx = await buildCategorizeCtx();

  // 4. Escribir solo lo nuevo o lo que cambió.
  let synced = 0;
  let alreadyExisted = 0;
  let actualizadas = 0;
  let docDiscovered = 0; // contador de docs nuevos encontrados en sesiones existentes

  for (const lote of enLotes([...eventos.values()], LOTE_ESCRITURA)) {
    for (const event of lote) {
      const allParticipants = participantesConOrganizador(event);
      const existing = guardadas.get(event.eventId);

      try {
        if (existing) {
          alreadyExisted++;
          const { cambios, docNuevo } = cambiosDeSesion(
            existing,
            event,
            allParticipants,
            // PERF #1: re-resolver el cliente (honra el override manualClientId existente).
            resolveSessionClientId({ title: event.title, participants: allParticipants, manualClientId: existing.manualClientId }, categorizeCtx),
          );
          if (!cambios) continue; // nada cambió → ningún UPDATE

          // ⚠ `select: { id: true }`: sin él, Prisma devuelve la fila ENTERA (transcripción y
          // resumen incluidos) por cada UPDATE — eran ~221 MB armados en memoria por corrida.
          await prisma.firefliesSession.update({ where: { id: existing.id }, data: cambios, select: { id: true } });
          actualizadas++;
          if (docNuevo) {
            docDiscovered++;
            console.log(`[google/sync] Doc descubierto post-sync para ${event.eventId} (${event.title}). enrichedAt reset.`);
          }
        } else {
          // Sesión nueva. UPSERT (no create): si otra corrida (otro proceso, un script de backfill)
          // creó la fila entre nuestra lectura y este write, el create fallaba con P2002.
          // En la rama update NO se toca resolvedClientId: no conocemos el manualClientId de esa
          // fila y recalcularlo con null podría pisar una asignación manual — la próxima corrida
          // la lee y la compara completa por la rama de arriba.
          const sessionId = idDeSesion(event.eventId);
          const eventDocId = event.googleDocId ?? null;
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
              // Mismo criterio que la comparación: el Doc nunca se borra con el null de Google.
              ...(eventDocId ? { googleDocId: eventDocId } : {}),
              organizerEmail: event.organizerEmail,
            },
            select: { id: true },
          });
          synced++;
        }
      } catch (err) {
        console.log(
          `[google/sync] WARN error persistiendo sesión ${event.eventId} ("${event.title}", ${event.date.toISOString()}):`,
          err instanceof Error ? err.message : err
        );
      }
    }
    await cederElHilo();
  }

  const total = synced + alreadyExisted;
  console.log(
    `[google/sync] Completado en ${Math.round((Date.now() - t0) / 1000)} s: ${eventos.size} reuniones (${apariciones} apariciones en calendarios), ` +
      `${synced} nuevas, ${actualizadas} actualizadas, ${alreadyExisted - actualizadas} sin cambios (${docDiscovered} con Doc nuevo descubierto)`
  );
  return { synced, alreadyExisted, total, actualizadas, apariciones };
}
