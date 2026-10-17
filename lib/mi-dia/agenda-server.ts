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
import { agendaDelDia, limitesDelDiaCR, type EventoConEnlaces, type ReunionDeHoy } from "./agenda";
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
}

const DIA_MS = 86_400_000;

/** Las reuniones del calendario de `email` entre dos instantes (como mucho 8 días), con su empresa. */
export async function agendaEntre(email: string, desde: Date, hasta: Date, dia: string): Promise<AgendaDeHoy> {
  const dias = Math.ceil((hasta.getTime() - desde.getTime()) / DIA_MS);
  const eventos = await eventosEntre(email, desde, hasta, { maxDias: dias });
  if (!eventos.ok) return { estado: eventos.motivo, dia, reuniones: [] };
  const { porCorreo, porDominio, internos, nombreDe } = await mapasDeEmpresas();
  const reuniones = agendaDelDia(eventos.datos as EventoConEnlaces[], { porCorreo, porDominio, internos }).map((r) => ({
    ...r,
    nombres: Object.fromEntries(r.empresas.map((id) => [id, nombreDe.get(id) ?? "Empresa"])),
  }));
  return { estado: "ok", dia, reuniones };
}

/** La agenda de hoy (el correo de la mañana la sigue usando así). */
export async function agendaDeHoy(email: string, ahora = new Date()): Promise<AgendaDeHoy> {
  const { dia, desde, hasta } = limitesDelDiaCR(ahora);
  return agendaEntre(email, desde, hasta, dia);
}

/** La agenda de un día `AAAA-MM-DD`. */
export async function agendaDelDiaDe(email: string, dia: string): Promise<AgendaDeHoy> {
  const desde = new Date(`${dia}T00:00:00-06:00`);
  return agendaEntre(email, desde, new Date(desde.getTime() + DIA_MS), dia);
}

/** La agenda de la semana (lunes a viernes) de un lunes `AAAA-MM-DD`. */
export async function agendaDeLaSemana(email: string, lunes: string): Promise<AgendaDeHoy> {
  const desde = new Date(`${lunes}T00:00:00-06:00`);
  return agendaEntre(email, desde, new Date(desde.getTime() + 5 * DIA_MS), lunes);
}
