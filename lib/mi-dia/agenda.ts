/**
 * lib/mi-dia/agenda.ts — las reuniones de hoy en el calendario de una persona, con la empresa de cada una (etapa 4c de
 * docs/mi-dia-plan.md). PURO: lo lee lib/mi-dia/agenda-server.ts.
 *
 * La empresa se reconoce por los invitados: primero por el correo exacto de un contacto de HubSpot, si no por el
 * dominio registrado de la empresa (nunca uno de correo personal). Un invitado que es de VARIAS empresas (alguien de
 * HubSpot, de una agencia) no decide nada si hay otro invitado que sí es de una sola: así una reunión con un cliente
 * y alguien de HubSpot es de ese cliente, no de todos los clientes de HubSpot (invariante 1).
 */
import { DOMINIOS_GENERICOS, invitadosDelEvento, isoDelEvento, type EventoDelCalendario } from "@/lib/exploraciones/agendadas";
import { esBloqueDeTarea } from "@/lib/google/meet-sync-cambios";

export interface ReunionDeHoy {
  id: string;
  titulo: string;
  /** ISO UTC. */
  inicio: string;
  fin: string | null;
  conMeet: boolean;
  /** Las empresas de Nexus de la reunión. Una = esa es; varias = no se sabe cuál (se elige al preparar). */
  empresas: string[];
  /** Los invitados de afuera (sin Smarteam, sin salas ni calendarios). */
  externos: number;
  internos: number;
}

const dominioDe = (email: string) => email.split("@")[1]?.trim().toLowerCase() ?? "";

/** Las empresas de un invitado: por su correo exacto; si no, por su dominio (no uno de correo personal). */
function empresasDelInvitado(
  correo: string,
  porCorreo: ReadonlyMap<string, readonly string[]>,
  porDominio: ReadonlyMap<string, readonly string[]>,
): readonly string[] {
  const exacto = porCorreo.get(correo);
  if (exacto?.length) return exacto;
  const d = dominioDe(correo);
  if (!d || DOMINIOS_GENERICOS.has(d)) return [];
  return porDominio.get(d) ?? [];
}

/** Las empresas de una reunión, con la regla de arriba. */
export function empresasDeLaReunion(
  externos: readonly string[],
  porCorreo: ReadonlyMap<string, readonly string[]>,
  porDominio: ReadonlyMap<string, readonly string[]>,
): string[] {
  const deUna = new Set<string>();
  const deVarias = new Set<string>();
  for (const c of externos) {
    const es = empresasDelInvitado(c, porCorreo, porDominio);
    if (es.length === 1) deUna.add(es[0]);
    else for (const e of es) deVarias.add(e);
  }
  return [...(deUna.size ? deUna : deVarias)].sort();
}

/**
 * Las reuniones del día: no canceladas, no rechazadas, que no sean el bloque de una tarea ni de todo el día, y con
 * alguien más invitado. Por hora.
 */
export function agendaDelDia(
  eventos: readonly EventoDelCalendario[],
  o: {
    porCorreo: ReadonlyMap<string, readonly string[]>;
    porDominio: ReadonlyMap<string, readonly string[]>;
    /** Los dominios de Smarteam. */
    internos: ReadonlySet<string>;
  },
): ReunionDeHoy[] {
  const out: ReunionDeHoy[] = [];
  for (const e of eventos) {
    if (!e.id || e.status === "cancelled" || esBloqueDeTarea(e)) continue;
    if (!e.start?.dateTime) continue; // de todo el día
    if (e.attendees?.some((a) => a.self && a.responseStatus === "declined")) continue;
    const inicio = isoDelEvento(e.start);
    if (!inicio) continue;
    const gente = invitadosDelEvento(e);
    if (gente.length < 2) continue; // sola en su calendario: no es una reunión
    const externos = gente.filter((c) => !o.internos.has(dominioDe(c)));
    out.push({
      id: e.id,
      titulo: e.summary?.trim() || "(Sin título)",
      inicio,
      fin: isoDelEvento(e.end),
      conMeet: e.conferenceData?.conferenceSolution?.key?.type === "hangoutsMeet",
      empresas: empresasDeLaReunion(externos, o.porCorreo, o.porDominio),
      externos: externos.length,
      internos: gente.length - externos.length,
    });
  }
  return out.sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/** El día en Costa Rica de un instante, y sus límites en UTC (00:00 a 24:00 CR). */
export function limitesDelDiaCR(ahora: Date): { dia: string; desde: Date; hasta: Date } {
  const dia = new Date(ahora.getTime() - 6 * 3_600_000).toISOString().slice(0, 10);
  const desde = new Date(`${dia}T00:00:00-06:00`);
  return { dia, desde, hasta: new Date(desde.getTime() + 86_400_000) };
}
