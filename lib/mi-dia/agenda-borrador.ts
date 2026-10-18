/**
 * lib/mi-dia/agenda-borrador.ts — el borrador de un evento en la agenda del inicio (2026-10-17). PURO y client-safe.
 *
 * Tocar una hora de la agenda (o «+ Crear evento», o «Agendar» de una cuenta sin reunión) deja ahí mismo un borrador de
 * una hora: título, invitados (contactos de HubSpot de las cuentas que ves) y la cuenta. Al confirmar, Nexus abre Google
 * Calendar con el evento ya configurado y la persona lo guarda allá: Nexus no escribe en el calendario de nadie ni manda
 * invitaciones (decisión 5 de docs/nexus-sistema-de-trabajo-plan.md, «Calendario por enlace»).
 *
 * El borrador vive en la pantalla (components/para-ti/inicio/borradores.ts): no se guarda en la base ni en el navegador.
 */
import { enlaceParaAgendarEnCalendar } from "./calendario";

export interface InvitadoDelBorrador {
  correo: string;
  /** null = solo se sabe el correo. */
  nombre: string | null;
  /** La cuenta del contacto, si se eligió de la lista. */
  clientId: string | null;
}

export interface CuentaDelBorrador {
  id: string;
  nombre: string;
}

export interface BorradorDeEvento {
  id: string;
  /** El correo de quien lo armó: Google Calendar abre en su cuenta, y otra persona en la misma pestaña no lo ve. */
  correo: string;
  /** ISO UTC. */
  inicio: string;
  fin: string;
  titulo: string;
  invitados: InvitadoDelBorrador[];
  cuenta: CuentaDelBorrador | null;
  /** Lo dejó «Agendar» en la primera hora libre (la hora la eligió Nexus) o una persona tocando la agenda. */
  origen: "agenda" | "agendar";
  /** Ya se abrió en Google Calendar: falta que la persona lo guarde allá. */
  abierto: boolean;
  /** Para qué es la reunión (lo sugiere «Planifica tu semana»): va a la descripción del evento. */
  objetivo?: string | null;
  /**
   * El bloque para avanzar una tarea (el hueco libre del inicio): no es una reunión con la cuenta, así que «Ya lo
   * guardé» no deja una reunión planeada. `numero` es su T-.
   */
  tarea?: { id: string; numero: number } | null;
  /** La reunión cuya próxima es (la que dejó sugerida): la reunión planeada queda atada a ella y no se repite. */
  deLaReunion?: string | null;
}

/** Un contacto de HubSpot para invitar (lo devuelve /api/para-ti/contactos). */
export interface ContactoParaAgendar {
  id: string;
  nombre: string;
  email: string;
  cargo: string | null;
  clientId: string;
  empresa: string;
}

export interface ResultadoParaAgendar {
  contactos: ContactoParaAgendar[];
  cuentas: CuentaDelBorrador[];
}

/** Las duraciones que se ofrecen, en minutos. */
export const DURACIONES_DEL_BORRADOR = [30, 45, 60, 90, 120] as const;
/** La duración de un borrador nuevo. */
export const MINUTOS_DEL_BORRADOR = 60;
/** Cuántos invitados se le pasan a Google Calendar (el mismo tope de `enlaceParaAgendarEnCalendar`). */
export const MAX_INVITADOS_DEL_BORRADOR = 10;

const MIN_MS = 60_000;

/** «Reunión con Wherex», o lo que escribió la persona. */
export function tituloDelBorrador(b: Pick<BorradorDeEvento, "titulo" | "cuenta">): string {
  const t = b.titulo.trim();
  if (t) return t;
  return b.cuenta ? `Reunión con ${b.cuenta.nombre}` : "Reunión";
}

/** La descripción del evento: el enlace a la cuenta en Nexus, si hay cuenta. `origen` = `https://nexus…` (sin barra final). */
export function detalleDelBorrador(b: Pick<BorradorDeEvento, "cuenta" | "objetivo" | "tarea">, origen: string): string {
  const lineas: string[] = [];
  const base = origen.replace(/\/+$/, "");
  if (b.objetivo?.trim()) lineas.push(`Objetivo: ${b.objetivo.trim()}`);
  if (b.tarea) lineas.push(`La tarea en Nexus (T-${b.tarea.numero}): ${base}/tareas?t=${encodeURIComponent(b.tarea.id)}`);
  if (b.cuenta) lineas.push(`La cuenta en Nexus: ${base}/clients/${encodeURIComponent(b.cuenta.id)}`);
  lineas.push("Creado desde Nexus.");
  return lineas.join("\n");
}

/** El enlace de Google Calendar con el evento ya configurado. */
export function enlaceDelBorrador(b: BorradorDeEvento, origen: string): string {
  return enlaceParaAgendarEnCalendar({
    titulo: tituloDelBorrador(b),
    detalle: detalleDelBorrador(b, origen),
    inicio: b.inicio,
    fin: b.fin,
    invitados: b.invitados.map((i) => i.correo),
    correo: b.correo,
  });
}

/** Cuántos minutos dura. */
export function duracionDelBorrador(b: Pick<BorradorDeEvento, "inicio" | "fin">): number {
  return Math.max(15, Math.round((Date.parse(b.fin) - Date.parse(b.inicio)) / MIN_MS));
}

/** Lo mueve a otra hora sin cambiar cuánto dura. */
export function moverBorrador<T extends Pick<BorradorDeEvento, "inicio" | "fin">>(b: T, inicio: string): T {
  const dura = Date.parse(b.fin) - Date.parse(b.inicio);
  return { ...b, inicio: new Date(Date.parse(inicio)).toISOString(), fin: new Date(Date.parse(inicio) + dura).toISOString() };
}

/** Le cambia la duración. */
export function conDuracion<T extends Pick<BorradorDeEvento, "inicio" | "fin">>(b: T, minutos: number): T {
  return { ...b, fin: new Date(Date.parse(b.inicio) + minutos * MIN_MS).toISOString() };
}

const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Suma un invitado sin repetir el correo. Un correo inválido no entra. */
export function conInvitado(invitados: readonly InvitadoDelBorrador[], nuevo: InvitadoDelBorrador): InvitadoDelBorrador[] {
  const correo = nuevo.correo.trim().toLowerCase();
  if (!CORREO.test(correo)) return [...invitados];
  const ya = invitados.findIndex((i) => i.correo === correo);
  if (ya >= 0) {
    // Ya estaba solo con el correo: ahora se sabe el nombre.
    return invitados.map((i, k) => (k === ya ? { ...i, nombre: i.nombre ?? nuevo.nombre, clientId: i.clientId ?? nuevo.clientId } : i));
  }
  if (invitados.length >= MAX_INVITADOS_DEL_BORRADOR) return [...invitados];
  return [...invitados, { ...nuevo, correo }];
}

/**
 * Lo que trae el enlace de «Agendar» que arma el servidor (lib/mi-dia/servicio.ts): el título, los invitados y la
 * cuenta de Google. null = no es un enlace de Google Calendar.
 */
export function datosDelEnlaceDeAgendar(href: string): { titulo: string; invitados: string[]; correo: string | null } | null {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  if (u.hostname !== "calendar.google.com") return null;
  const q = u.searchParams;
  return {
    titulo: q.get("text") ?? "",
    invitados: (q.get("add") ?? "")
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter((x) => CORREO.test(x)),
    correo: q.get("authuser"),
  };
}

/**
 * ¿«Ya lo guardé» deja una reunión planeada en Tareas? Solo un evento con cuenta que no es el bloque de una tarea: esa
 * reunión hace que la cuenta cuente como con reunión (lib/mi-dia/servicio.ts).
 */
export function dejaReunionPlaneada(b: Pick<BorradorDeEvento, "cuenta" | "tarea">): boolean {
  return !!b.cuenta && !b.tarea;
}

/** Lo que se manda a /api/tareas/reuniones-planeadas. */
export function reunionPlaneadaDelBorrador(
  b: BorradorDeEvento,
): { clientId: string; titulo: string; inicio: string; invitados: string[]; objetivo: string | null; deLaReunion: string | null } | null {
  if (!dejaReunionPlaneada(b) || !b.cuenta) return null;
  return {
    clientId: b.cuenta.id,
    titulo: tituloDelBorrador(b),
    inicio: b.inicio,
    invitados: b.invitados.map((i) => i.correo),
    objetivo: b.objetivo?.trim() || null,
    deLaReunion: b.deLaReunion ?? null,
  };
}

/** ¿Se pisa con este rango? */
export function sePisan(a: { inicio: string; fin: string }, b: { inicio: string; fin: string }): boolean {
  return Date.parse(a.inicio) < Date.parse(b.fin) && Date.parse(b.inicio) < Date.parse(a.fin);
}
