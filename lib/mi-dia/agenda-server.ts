/**
 * lib/mi-dia/agenda-server.ts — la agenda de una persona, con la empresa de cada reunión (etapa 4c de
 * docs/mi-dia-plan.md; el día y la semana desde la ficha D, 2026-10-17). Solo lee: el calendario de la persona (con el
 * permiso de siempre) y la base.
 *
 * La empresa la decide lib/mi-dia/agenda.ts con los contactos de HubSpot (lib/contactos) y los dominios registrados de
 * los clientes y prospectos (lib/mi-dia/empresas-server.ts). No muestra nada de la empresa más que su nombre: la
 * información de una reunión se abre en el panel del inicio, que pide acceso al cliente.
 */
import "server-only";
import { eventosEntre, type MotivoSinAgenda } from "@/lib/google/agenda-de-la-empresa";
import {
  agendaDelDia,
  eventosDeTodoElDia,
  eventosPropios,
  limitesDelDiaCR,
  type EventoConEnlaces,
  type EventoDeTodoElDia,
  type EventoPropio,
  type ReunionDeHoy,
} from "./agenda";
import { mapasDeEmpresas } from "./empresas-server";

export interface ReunionDeLaAgenda extends ReunionDeHoy {
  /** El nombre de cada empresa de la reunión, por id. */
  nombres: Record<string, string>;
}

export interface AgendaDeHoy {
  estado: "ok" | MotivoSinAgenda;
  /** El día (o el lunes, en la semana), `AAAA-MM-DD`. */
  dia: string;
  reuniones: ReunionDeLaAgenda[];
  /** Lo demás con hora («Tenis», «Cita Médica», el bloque de una tarea): se pinta y ocupa, como en Google Calendar. */
  propios: EventoPropio[];
  /** Los de todo el día (no ocupan horas). */
  todoElDia: EventoDeTodoElDia[];
}

/** Una agenda sin nada (mientras se lee, o cuando no se pudo leer). */
export function agendaVacia(estado: AgendaDeHoy["estado"], dia: string): AgendaDeHoy {
  return { estado, dia, reuniones: [], propios: [], todoElDia: [] };
}

const DIA_MS = 86_400_000;

/**
 * Lo leído del calendario, por persona y rango, un minuto (2026-10-17): moverse por la agenda (‹ ›, Día ↔ Semana) y
 * volver a una semana ya vista no vuelve a pedirle a Google. La página entera lee siempre fresco (`fresco`) y deja lo
 * leído para la navegación, así un evento recién guardado en Calendar aparece al recargar (RUNBOOK, invariante #1).
 */
const VIDA_MS = 60_000;
const MAX_GUARDADOS = 300;
const guardados = new Map<string, { at: number; agenda: AgendaDeHoy }>();
const enVuelo = new Map<string, Promise<AgendaDeHoy>>();

/** Las reuniones del calendario de `email` entre dos instantes (como mucho 8 días), con su empresa. */
export async function agendaEntre(email: string, desde: Date, hasta: Date, dia: string, o: { fresco?: boolean } = {}): Promise<AgendaDeHoy> {
  const k = `${email.trim().toLowerCase()}|${desde.toISOString()}|${hasta.toISOString()}`;
  if (!o.fresco) {
    const g = guardados.get(k);
    if (g && Date.now() - g.at < VIDA_MS) return g.agenda;
    const enCurso = enVuelo.get(k);
    if (enCurso) return enCurso;
  }
  const p = leerAgenda(email, desde, hasta, dia)
    .then((agenda) => {
      // Una lectura fallida no se guarda: la próxima vuelve a intentar.
      if (agenda.estado === "ok") {
        if (guardados.size >= MAX_GUARDADOS) guardados.delete(guardados.keys().next().value!);
        guardados.set(k, { at: Date.now(), agenda });
      }
      return agenda;
    })
    .finally(() => {
      if (enVuelo.get(k) === p) enVuelo.delete(k);
    });
  enVuelo.set(k, p);
  return p;
}

async function leerAgenda(email: string, desde: Date, hasta: Date, dia: string): Promise<AgendaDeHoy> {
  const dias = Math.ceil((hasta.getTime() - desde.getTime()) / DIA_MS);
  const eventos = await eventosEntre(email, desde, hasta, { maxDias: dias });
  if (!eventos.ok) return agendaVacia(eventos.motivo, dia);
  const { porCorreo, porDominio, internos, nombreDe } = await mapasDeEmpresas();
  const datos = eventos.datos as EventoConEnlaces[];
  const reuniones = agendaDelDia(datos, { porCorreo, porDominio, internos }).map((r) => ({
    ...r,
    nombres: Object.fromEntries(r.empresas.map((id) => [id, nombreDe.get(id) ?? "Empresa"])),
  }));
  return { estado: "ok", dia, reuniones, propios: eventosPropios(datos), todoElDia: eventosDeTodoElDia(datos) };
}

/** La agenda de hoy (el correo de la mañana la sigue usando así). */
export async function agendaDeHoy(email: string, ahora = new Date()): Promise<AgendaDeHoy> {
  const { dia, desde, hasta } = limitesDelDiaCR(ahora);
  return agendaEntre(email, desde, hasta, dia);
}

/** La agenda de un día `AAAA-MM-DD`. */
export async function agendaDelDiaDe(email: string, dia: string, o: { fresco?: boolean } = {}): Promise<AgendaDeHoy> {
  const desde = new Date(`${dia}T00:00:00-06:00`);
  return agendaEntre(email, desde, new Date(desde.getTime() + DIA_MS), dia, o);
}

/** La agenda de la semana (lunes a viernes) de un lunes `AAAA-MM-DD`. */
export async function agendaDeLaSemana(email: string, lunes: string, o: { fresco?: boolean } = {}): Promise<AgendaDeHoy> {
  const desde = new Date(`${lunes}T00:00:00-06:00`);
  return agendaEntre(email, desde, new Date(desde.getTime() + 5 * DIA_MS), lunes, o);
}

/** Lo que muestra la agenda en una vista: el día, o la semana de ese lunes. */
export function agendaDeLaVista(email: string, vista: "dia" | "semana", dia: string, o: { fresco?: boolean } = {}): Promise<AgendaDeHoy> {
  return vista === "semana" ? agendaDeLaSemana(email, dia, o) : agendaDelDiaDe(email, dia, o);
}
