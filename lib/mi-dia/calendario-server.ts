/**
 * lib/mi-dia/calendario-server.ts — el calendario de una persona de los próximos 8 días, con la cuenta de cada reunión
 * (fase 2.2 de docs/nexus-sistema-de-trabajo-plan.md, 2026-10-17). SERVER-ONLY, solo lectura.
 *
 * Una sola lectura por persona para todo lo que pregunta «¿qué viene?»: la regla de servicio (¿la cuenta tiene
 * reunión?), las próximas reuniones de la ficha del cliente, «Planifica tu semana» y el «Agendar» con hora. Lee con el
 * permiso de siempre (`calendar.readonly`) y nunca escribe en el calendario. La cuenta de cada reunión la decide el
 * resolvedor único de lib/mi-dia/agenda.ts (`cuentaDelEvento`: de UNA empresa, o de ninguna).
 *
 * Se guarda dos minutos por persona, con la lectura en curso compartida: «Para ti» mide y arma el inicio en paralelo
 * sobre la misma persona, y el número del menú pide cada minuto y medio (RUNBOOK, invariante #1: un solo proceso).
 */
import "server-only";
import { eventosProximos } from "@/lib/google/agenda-de-la-empresa";
import { agendaDelDia, ocupadoDelCalendario, type EventoConEnlaces, type RatoOcupado, type ReunionDeHoy } from "./agenda";
import { mapasDeEmpresas } from "./empresas-server";
import { DIAS_PARA_LA_REUNION } from "./constantes";

export interface CalendarioDeLosProximosDias {
  /** Desde cuándo se leyó (ISO): lo de antes no está. */
  desde: string;
  /** Las reuniones de los próximos 8 días, con sus empresas (y sus invitados de Smarteam). */
  reuniones: ReunionDeHoy[];
  /** Todo lo ocupado (también lo que no es una reunión): para no pisarlo al sugerir una hora. */
  ocupado: RatoOcupado[];
}

const VIDA_MS = 2 * 60_000;
const guardados = new Map<string, { at: number; cal: CalendarioDeLosProximosDias | null }>();
const enVuelo = new Map<string, Promise<CalendarioDeLosProximosDias | null>>();

async function leer(k: string, ahora: Date): Promise<CalendarioDeLosProximosDias | null> {
  const eventos = await eventosProximos(k, { semanas: DIAS_PARA_LA_REUNION / 7, ahora });
  let cal: CalendarioDeLosProximosDias | null = null;
  if (eventos.ok) {
    const mapas = await mapasDeEmpresas(ahora);
    const datos = eventos.datos as EventoConEnlaces[];
    cal = { desde: ahora.toISOString(), reuniones: agendaDelDia(datos, mapas), ocupado: ocupadoDelCalendario(datos) };
  }
  guardados.set(k, { at: ahora.getTime(), cal });
  return cal;
}

/** El calendario de `email` de los próximos 8 días. null = no se pudo leer (sin Google, sin permiso o una falla). */
export function calendarioDeLosProximosDias(email: string, ahora = new Date()): Promise<CalendarioDeLosProximosDias | null> {
  const k = email.trim().toLowerCase();
  const g = guardados.get(k);
  if (g && ahora.getTime() - g.at < VIDA_MS) return Promise.resolve(g.cal);
  const enCurso = enVuelo.get(k);
  if (enCurso) return enCurso;
  const p = leer(k, ahora)
    .catch(() => null)
    .finally(() => {
      enVuelo.delete(k);
    });
  enVuelo.set(k, p);
  return p;
}
