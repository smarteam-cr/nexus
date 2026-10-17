/**
 * lib/google/meet-sync-cambios.ts — qué escribe la sync de Meet, como lógica pura.
 *
 * Incidente del 2026-09-21: producción quemó 821 % de CPU con 1,13 GiB y dejó de atender. La
 * sync de Meet corría dentro del proceso web y, en cada corrida, hacía un UPDATE incondicional por
 * reunión Y por calendario interno donde aparecía: 15.011 UPDATE sobre 6.176 reuniones de la
 * ventana de 365 días, y cada UPDATE (sin `select`) devolvía la fila entera con transcripción y
 * resumen: ~221 MB armados en memoria por corrida para tirarlos. Acá vive la regla que lo evita:
 *   1. una reunión se procesa UNA vez por corrida aunque aparezca en varios calendarios
 *      (`fusionarCopia` junta las copias, sin perder el Doc ni asistentes de ninguna);
 *   2. se escribe SOLO lo que difiere de lo guardado (`cambiosDeSesion`); si nada cambió, no hay
 *      UPDATE.
 *
 * Sin dependencias de base ni de red: lo prueba `meet-sync-cambios.test.ts`.
 */

/** Una reunión de Google Meet tal como la trae el calendario de UN usuario. */
export interface EventoMeet {
  eventId: string;
  title: string;
  date: Date;
  durationMinutes: number;
  participants: string[];
  googleDocId?: string;
  organizerEmail: string;
  /** La descripción del evento, ya limpia (lib/sessions/descripcion-del-evento.ts): la agenda. null = sin descripción. */
  descripcion?: string | null;
}

/** Lo guardado de una sesión que hace falta para decidir si cambió. Nada pesado: ni transcripción ni resumen. */
export interface SesionGuardada {
  id: string;
  title: string;
  date: Date;
  duration: number;
  participants: string[];
  googleEventId: string | null;
  googleDocId: string | null;
  organizerEmail: string | null;
  source: string;
  manualClientId: string | null;
  resolvedClientId: string | null;
  descripcionDelEvento: string | null;
}

/** El `select` de Prisma que arma una `SesionGuardada`: la sync no necesita más que esto. */
export const SELECT_SESION_GUARDADA = {
  id: true,
  title: true,
  date: true,
  duration: true,
  participants: true,
  googleEventId: true,
  googleDocId: true,
  organizerEmail: true,
  source: true,
  manualClientId: true,
  resolvedClientId: true,
  descripcionDelEvento: true,
} as const;

/** Solo los campos que cambiaron. Si el Doc es nuevo, además se reinicia el enriquecimiento. */
export interface CambiosDeSesion {
  title?: string;
  date?: Date;
  duration?: number;
  participants?: string[];
  googleEventId?: string;
  googleDocId?: string;
  organizerEmail?: string;
  source?: "google_meet";
  resolvedClientId?: string | null;
  descripcionDelEvento?: string | null;
  enrichedAt?: null;
  enrichAttempts?: number;
  enrichError?: null;
}

const PREFIJO_ID = "gmeet_";

/** Días hacia atrás por defecto de la sync automática (ver el comentario de `diasHaciaAtras`). */
export const DIAS_POR_DEFECTO = 30;

/**
 * La ventana de la sync: `GOOGLE_MEET_DAYS_BACK` si es un número positivo; si no, 30 días.
 *
 * Por qué 30 y no 365 (2026-09-21): con 365 cada corrida pedía un año de calendario por usuario
 * y repasaba 6.176 reuniones (15.011 apariciones) cada 20 minutos. Con 30 son 656 reuniones.
 * ⚠ Lo que se pierde: una reunión de hace más de 30 días ya no se refresca sola. Si le cambian el
 * título, le agregan asistentes o su Doc de Gemini aparece tarde, Nexus no se entera.
 * Backfill puntual, fuera de horario (⚠ escribe en la base compartida, que es la de producción):
 *   - desde una PC de desarrollo: `npx tsx --env-file=.env scripts/backfill-meet.ts 365` — corre en
 *     ESE proceso, no en el web, y con esta misma regla solo escribe lo que cambió;
 *   - o el botón «Sincronizar» de Integraciones con `GOOGLE_MEET_DAYS_BACK=365` en el `.env` del VPS
 *     (y sacarla después: con ella la sync automática vuelve a mirar un año cada 20 minutos).
 */
export function diasHaciaAtras(valor: string | undefined): number {
  const n = Number(valor);
  return valor !== undefined && valor.trim() !== "" && Number.isFinite(n) && n > 0 ? n : DIAS_POR_DEFECTO;
}

/** El eventId de una fila guardada: el propio, o el que se deriva de un id `gmeet_…` (filas previas al refactor). */
export function eventIdDeFila(fila: { id: string; googleEventId: string | null }): string | null {
  if (fila.googleEventId) return fila.googleEventId;
  return fila.id.startsWith(PREFIJO_ID) ? fila.id.slice(PREFIJO_ID.length) : null;
}

/** El id de la fila que se crea para un evento nuevo. */
export function idDeSesion(eventId: string): string {
  return `${PREFIJO_ID}${eventId}`;
}

/**
 * Junta dos copias de la MISMA reunión vistas en calendarios distintos. La primera manda en título,
 * fecha, duración y organizador (son del evento, iguales en todas las copias); los asistentes se
 * unen y el Doc se toma de la primera copia que lo traiga.
 * ⚠ Antes cada copia pisaba a la anterior: si una copia traía el Doc y otra no, la última escritura
 * podía dejar `googleDocId` en null, y la corrida siguiente lo «descubría» otra vez y reiniciaba el
 * enriquecimiento.
 */
export function fusionarCopia(previa: EventoMeet | undefined, copia: EventoMeet): EventoMeet {
  if (!previa) return { ...copia, participants: [...new Set(copia.participants)] };
  return {
    ...previa,
    participants: [...new Set([...previa.participants, ...copia.participants])],
    googleDocId: previa.googleDocId ?? copia.googleDocId,
    organizerEmail: previa.organizerEmail || copia.organizerEmail,
    // La descripción es del evento (igual en todas las copias): la primera que la traiga.
    descripcion: previa.descripcion ?? copia.descripcion,
  };
}

/** Los asistentes que se guardan: los del evento más el organizador (para el matching de ventas en consultas). */
export function participantesConOrganizador(evento: EventoMeet): string[] {
  return evento.organizerEmail ? [...new Set([...evento.participants, evento.organizerEmail])] : [...new Set(evento.participants)];
}

/** ¿Son los mismos asistentes? El orden no importa: Google puede devolverlos en otro orden sin que nada haya cambiado. */
export function mismosParticipantes(a: string[], b: string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const x of sa) if (!sb.has(x)) return false;
  return true;
}

/**
 * Qué hay que escribir en una sesión que ya existe, o `null` si nada cambió (y entonces NO hay UPDATE).
 *
 * @param participantes los de `participantesConOrganizador(evento)`.
 * @param resolvedClientId el cliente que resuelve la sync con el contexto de la corrida (honra el
 *        override manual). Se compara igual que el resto: si difiere, se escribe, como siempre.
 *
 * ⚠ El Doc nunca se borra: si Google no trae ninguno, se conserva el guardado. Antes se escribía
 * el null de Google y se perdía el enlace al Doc de una reunión ya enriquecida (y con las copias sin
 * adjunto, oscilaba). Si Google trae un Doc distinto o nuevo, se escribe y se reinicia el
 * enriquecimiento COMPLETO (auditoría 2026-08-08: con solo `enrichedAt: null`, una fila sellada por
 * tope quedaba en limbo).
 */
export function cambiosDeSesion(
  guardada: SesionGuardada,
  evento: EventoMeet,
  participantes: string[],
  resolvedClientId: string | null,
): { cambios: CambiosDeSesion | null; docNuevo: boolean } {
  const c: CambiosDeSesion = {};
  if (guardada.title !== evento.title) c.title = evento.title;
  if (guardada.date.getTime() !== evento.date.getTime()) c.date = evento.date;
  if (guardada.duration !== evento.durationMinutes) c.duration = evento.durationMinutes;
  if (!mismosParticipantes(guardada.participants, participantes)) c.participants = participantes;
  if (guardada.googleEventId !== evento.eventId) c.googleEventId = evento.eventId;
  if (guardada.organizerEmail !== evento.organizerEmail) c.organizerEmail = evento.organizerEmail;
  if (guardada.source !== "google_meet") c.source = "google_meet";
  if (guardada.resolvedClientId !== resolvedClientId) c.resolvedClientId = resolvedClientId;
  // La agenda (ficha G): si Google la cambió o la borró, se copia tal cual. Un evento sin el dato no la toca.
  if (evento.descripcion !== undefined && (guardada.descripcionDelEvento ?? null) !== (evento.descripcion ?? null)) c.descripcionDelEvento = evento.descripcion ?? null;

  const docNuevo = !!evento.googleDocId && evento.googleDocId !== guardada.googleDocId;
  if (docNuevo) {
    c.googleDocId = evento.googleDocId;
    c.enrichedAt = null;
    c.enrichAttempts = 0;
    c.enrichError = null;
  }
  return { cambios: Object.keys(c).length > 0 ? c : null, docNuevo };
}

/** Parte una lista en lotes de `tamano` (para los `IN (...)` de la lectura y para ceder el hilo entre lotes). */
export function enLotes<T>(lista: T[], tamano: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) lotes.push(lista.slice(i, i + tamano));
  return lotes;
}

/**
 * ¿Este evento es un BLOQUE de una tarea de Nexus (lib/google/agenda.ts)? Tareas internas crea un bloque privado por
 * tarea en el calendario de su dueña. Un bloque nunca se vuelve sesión ni se le adjudica a un cliente: meet-sync lo
 * salta aunque Google le haya agregado un Meet. Se reconoce por su marca (`nexusTareaId`), por la descripción
 * («nexustarea <id>», la del enlace de plantilla) o por el título «Tarea · …» sin más asistentes que el organizador.
 */
export function esBloqueDeTarea(e: {
  summary?: string | null;
  description?: string | null;
  extendedProperties?: { private?: Record<string, string> | null } | null;
  attendees?: readonly unknown[] | null;
}): boolean {
  if (e.extendedProperties?.private?.nexusTareaId) return true;
  if ((e.description ?? "").includes("nexustarea ")) return true;
  const sinInvitados = !e.attendees || e.attendees.length <= 1;
  return sinInvitados && /^tarea\s*·/i.test((e.summary ?? "").trim());
}
