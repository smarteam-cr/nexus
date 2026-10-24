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
 * U1 (2026-10-25) suma, con la misma regla: el código de la reunión, la respuesta de cada invitado
 * (`cambiosDeInvitados`) y los eventos cancelados (`canceladasDeLaCorrida`).
 *
 * Sin dependencias de base ni de red: lo prueba `meet-sync-cambios.test.ts`.
 */
import { esRecursoDeCalendario } from "@/lib/sessions/dominio-propio";

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
  /** El código de Meet (`conferenceData.conferenceId`, abc-defg-hij). undefined = el evento no lo trae. */
  conferenceId?: string;
  /** Los invitados con su respuesta, tal como los trae el evento (sin salas). undefined = no se pidieron. */
  invitados?: InvitadoDelEvento[];
}

/** La respuesta de un invitado, con los valores del enum `RespuestaAlEvento` del schema. */
export type Respuesta = "ACEPTO" | "TENTATIVA" | "RECHAZO" | "SIN_RESPONDER";

/** Un invitado del evento. `correo` en minúsculas; `respuesta` null = el calendario no la dijo. */
export interface InvitadoDelEvento {
  correo: string;
  respuesta: Respuesta | null;
}

/** El `responseStatus` de Google Calendar en el enum de Nexus. Un valor que Google sume mañana queda en null. */
export function respuestaDe(responseStatus: string | null | undefined): Respuesta | null {
  switch (responseStatus) {
    case "accepted":
      return "ACEPTO";
    case "tentative":
      return "TENTATIVA";
    case "declined":
      return "RECHAZO";
    case "needsAction":
      return "SIN_RESPONDER";
    default:
      return null;
  }
}

/**
 * Los invitados de un evento como los guarda Nexus: en minúsculas, uno por correo, sin las salas ni los calendarios de
 * grupo (`resource`, o un correo de `esRecursoDeCalendario`: no son personas), y con el organizador aunque Google no lo
 * liste como invitado (sin respuesta).
 */
export function invitadosDelEvento(
  attendees: readonly { email?: string | null; responseStatus?: string | null; resource?: boolean | null }[] | null | undefined,
  organizerEmail: string | null | undefined,
): InvitadoDelEvento[] {
  const porCorreo = new Map<string, InvitadoDelEvento>();
  for (const a of attendees ?? []) {
    if (a.resource) continue;
    const correo = a.email?.trim().toLowerCase();
    if (!correo || porCorreo.has(correo) || esRecursoDeCalendario(correo)) continue;
    porCorreo.set(correo, { correo, respuesta: respuestaDe(a.responseStatus) });
  }
  const organizador = organizerEmail?.trim().toLowerCase();
  if (organizador && !porCorreo.has(organizador) && !esRecursoDeCalendario(organizador)) porCorreo.set(organizador, { correo: organizador, respuesta: null });
  return [...porCorreo.values()];
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
  conferenceId: string | null;
  canceladaEn: Date | null;
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
  conferenceId: true,
  canceladaEn: true,
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
  conferenceId?: string;
  canceladaEn?: null;
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
    conferenceId: previa.conferenceId ?? copia.conferenceId,
    invitados: unirInvitados(previa.invitados, copia.invitados),
  };
}

/** Los invitados de dos copias: todos, uno por correo; la respuesta, la primera que la diga. */
function unirInvitados(a: InvitadoDelEvento[] | undefined, b: InvitadoDelEvento[] | undefined): InvitadoDelEvento[] | undefined {
  if (!a) return b;
  if (!b) return a;
  const porCorreo = new Map(a.map((i) => [i.correo, i]));
  for (const i of b) {
    const ya = porCorreo.get(i.correo);
    if (!ya || (ya.respuesta === null && i.respuesta !== null)) porCorreo.set(i.correo, i);
  }
  return [...porCorreo.values()];
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
  // El código de la reunión: como el Doc, nunca se borra con un evento que no lo trae.
  if (evento.conferenceId && evento.conferenceId !== guardada.conferenceId) c.conferenceId = evento.conferenceId;
  // El evento está vivo en algún calendario: si estaba marcada como cancelada, volvió (alguien la restauró).
  if (guardada.canceladaEn !== null) c.canceladaEn = null;

  const docNuevo = !!evento.googleDocId && evento.googleDocId !== guardada.googleDocId;
  if (docNuevo) {
    c.googleDocId = evento.googleDocId;
    c.enrichedAt = null;
    c.enrichAttempts = 0;
    c.enrichError = null;
  }
  return { cambios: Object.keys(c).length > 0 ? c : null, docNuevo };
}

/**
 * Los eventos que la corrida vio cancelados en TODOS los calendarios donde aparecieron: los cancelados que no tienen
 * ninguna copia viva. Una copia cancelada sola no alcanza: a un invitado que sacan del evento Google se lo muestra
 * cancelado en SU calendario, y la reunión sigue para los demás. Antes de marcar, cada una pasa por
 * `frenadaPorUnCalendarioSinLeer`.
 *
 * ⚠ `vivas` son TODAS las copias no canceladas que trajo Google, también las que la sync descarta para guardar (fuera
 * de la ventana de fechas, sin Meet porque le cambiaron la herramienta, un bloque de tarea): en el borde de los 30 días
 * la copia viva de una reunión vieja queda afuera de la ventana y la cancelada del invitado que sacaron, adentro.
 */
export function canceladasDeLaCorrida(canceladas: ReadonlySet<string>, vivas: ReadonlySet<string>): string[] {
  return [...canceladas].filter((id) => !vivas.has(id));
}

/**
 * ¿No se puede marcar esta reunión como cancelada porque el calendario de alguien que estaba invitado no se leyó entero
 * (falló, o se cortó la paginación)? Su copia viva pudo quedar sin ver. La corrida siguiente la vuelve a mirar.
 *
 * ⚠ Por reunión y no por corrida: con «un calendario sin leer frena todo», una cuenta suspendida del dominio (que falla
 * en cada corrida) apagaba la marca de canceladas para siempre y sin aviso. Se mira con quiénes estaban invitados según
 * lo GUARDADO: un calendario que no se leyó no puede tener la copia de una reunión a la que su dueño no estaba invitado.
 */
export function frenadaPorUnCalendarioSinLeer(
  fila: { participants: readonly string[]; organizerEmail: string | null },
  calendariosSinLeer: ReadonlySet<string>,
): boolean {
  if (calendariosSinLeer.size === 0) return false;
  return [...fila.participants, fila.organizerEmail ?? ""].some((c) => calendariosSinLeer.has(c.trim().toLowerCase()));
}

/** Un invitado guardado en `ParticipanteDeReunion`: lo que decide si cambió, y si U3 ya le anotó la asistencia. */
export interface InvitadoGuardado {
  id: string;
  correo: string;
  esDelEquipo: boolean;
  respuesta: Respuesta | null;
  entro: Date | null;
}

/** Lo que hay que escribir en `ParticipanteDeReunion` para UNA reunión. Las tres listas vacías = ninguna escritura. */
export interface CambiosDeInvitados {
  crear: { correo: string; esDelEquipo: boolean; respuesta: Respuesta | null }[];
  actualizar: { id: string; esDelEquipo: boolean; respuesta: Respuesta | null }[];
  /** Los que ya no están invitados. Nunca uno con asistencia anotada (U3): estuvo, aunque lo hayan sacado después. */
  borrar: string[];
}

/** Cómo se ponen al día. `borrar: false` cuando algún calendario no se leyó: el que falta pudo ser el único que lo veía. */
export interface OpcionesDeInvitados {
  borrar: boolean;
}

/**
 * Los dominios «del equipo»: los de la categoría `internal` de /sessions/categories, la MISMA definición que usa la
 * atribución de la reunión (lib/sessions/dominio-propio.ts: «la verdad en caliente»). Sin ninguno, el de arranque
 * (`DOMINIO_PROPIO`). No se le suman las cuentas del Workspace: sería una definición más de «nosotros».
 */
export function dominiosDelEquipoDe(internos: Iterable<string>, porDefecto: string): Set<string> {
  const out = new Set<string>();
  for (const d of internos) if (d.trim()) out.add(d.trim().toLowerCase());
  if (out.size === 0) out.add(porDefecto.toLowerCase());
  return out;
}

/** El dominio de un correo, en minúsculas. */
export function dominioDe(correo: string): string {
  return correo.slice(correo.lastIndexOf("@") + 1).toLowerCase();
}

/**
 * Qué escribir para que los invitados guardados de una reunión sean los del evento. Como `cambiosDeSesion`: solo lo
 * que difiere. `dominiosDelEquipo` = los de `dominiosDelEquipoDe`.
 */
export function cambiosDeInvitados(
  guardados: readonly InvitadoGuardado[],
  invitados: readonly InvitadoDelEvento[],
  dominiosDelEquipo: ReadonlySet<string>,
  opciones: OpcionesDeInvitados = { borrar: true },
): CambiosDeInvitados {
  const out: CambiosDeInvitados = { crear: [], actualizar: [], borrar: [] };
  const guardadoDe = new Map(guardados.map((g) => [g.correo, g]));
  const siguen = new Set<string>();
  for (const i of invitados) {
    siguen.add(i.correo);
    const esDelEquipo = dominiosDelEquipo.has(dominioDe(i.correo));
    const g = guardadoDe.get(i.correo);
    if (!g) out.crear.push({ correo: i.correo, esDelEquipo, respuesta: i.respuesta });
    else if (g.esDelEquipo !== esDelEquipo || g.respuesta !== i.respuesta) out.actualizar.push({ id: g.id, esDelEquipo, respuesta: i.respuesta });
  }
  if (opciones.borrar) for (const g of guardados) if (!siguen.has(g.correo) && g.entro === null) out.borrar.push(g.id);
  return out;
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
