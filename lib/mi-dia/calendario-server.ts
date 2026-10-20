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
import { recortarCalendario } from "./calendario";

export interface CalendarioDeLosProximosDias {
  /** Desde cuándo se leyó (ISO): lo de antes no está. */
  desde: string;
  /** Las reuniones de los próximos 8 días, con sus empresas (y sus invitados de Smarteam). */
  reuniones: ReunionDeHoy[];
  /** Todo lo ocupado (también lo que no es una reunión): para no pisarlo al sugerir una hora. */
  ocupado: RatoOcupado[];
}

const VIDA_MS = 2 * 60_000;
/**
 * Lo leído, por persona y por cuántos días: una lectura de 30 días («Seguimiento de cuentas») también contesta la de 8
 * (la regla de servicio), recortada. Así la misma página no le pide a Google dos veces el calendario de la misma persona.
 */
const guardados = new Map<string, { at: number; dias: number; cal: CalendarioDeLosProximosDias | null }[]>();
const enVuelo = new Map<string, { dias: number; p: Promise<CalendarioDeLosProximosDias | null> }[]>();

async function leer(correo: string, dias: number, ahora: Date): Promise<CalendarioDeLosProximosDias | null> {
  const eventos = await eventosProximos(correo, { semanas: dias / 7, ahora });
  let cal: CalendarioDeLosProximosDias | null = null;
  if (eventos.ok) {
    const mapas = await mapasDeEmpresas(ahora);
    const datos = eventos.datos as EventoConEnlaces[];
    cal = { desde: ahora.toISOString(), reuniones: agendaDelDia(datos, mapas), ocupado: ocupadoDelCalendario(datos) };
  }
  guardados.set(correo, [...(guardados.get(correo) ?? []).filter((g) => g.dias !== dias), { at: ahora.getTime(), dias, cal }]);
  return cal;
}

/**
 * El calendario de `email` de los próximos 8 días (o `dias`: «Seguimiento de cuentas» mira 30 para la próxima sesión;
 * la lectura de Google llega como mucho a 8 semanas). null = no se pudo leer (sin Google, sin permiso o una falla).
 */
export function calendarioDeLosProximosDias(email: string, ahora = new Date(), dias = DIAS_PARA_LA_REUNION): Promise<CalendarioDeLosProximosDias | null> {
  const correo = email.trim().toLowerCase();
  const fresco = (guardados.get(correo) ?? []).filter((g) => g.dias >= dias && ahora.getTime() - g.at < VIDA_MS).sort((a, b) => a.dias - b.dias)[0];
  if (fresco) return Promise.resolve(fresco.dias === dias ? fresco.cal : recortarCalendario(fresco.cal, ahora, dias));
  const enCurso = (enVuelo.get(correo) ?? []).filter((v) => v.dias >= dias).sort((a, b) => a.dias - b.dias)[0];
  if (enCurso) return enCurso.dias === dias ? enCurso.p : enCurso.p.then((c) => recortarCalendario(c, ahora, dias));
  const p = leer(correo, dias, ahora)
    .catch(() => null)
    .finally(() => {
      enVuelo.set(correo, (enVuelo.get(correo) ?? []).filter((v) => v.p !== p));
    });
  enVuelo.set(correo, [...(enVuelo.get(correo) ?? []), { dias, p }]);
  return p;
}
