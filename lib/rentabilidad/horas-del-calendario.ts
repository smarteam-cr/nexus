/**
 * lib/rentabilidad/horas-del-calendario.ts — las reuniones con clientes que están en el calendario y NO en Meet. PURO.
 *
 * La sync de Meet (lib/google/meet-sync.ts) copia a `FirefliesSession` solo los eventos con Meet. Una reunión
 * presencial, por Zoom o por Teams, o una llamada agendada, también es tiempo con el cliente y no llegaba al margen
 * (iniciativa C de docs/roadmap.md; plan en docs/rentabilidad-conectada-plan.md). Este módulo toma los eventos del
 * calendario de cada persona del equipo y devuelve las reuniones que faltan, con la misma forma que lee la carga
 * (`ReunionParaCarga`), para que el margen las cuente con las mismas reglas (lib/carga/reuniones.ts).
 *
 * ── LAS REGLAS QUE EVITAN CONTAR DOS VECES ───────────────────────────────────
 *  1. Un evento con Meet nunca entra: ya está en `FirefliesSession` (o la sync decidió no copiarlo).
 *  2. Un evento cuyo id ya es el `googleEventId` de una sesión tampoco.
 *  3. Una reunión agregada a mano del MISMO cliente que empieza a ±30 minutos lo deja fuera: es la misma reunión.
 *  4. Un bloque de una tarea de Nexus (`esBloqueDeTarea`) nunca es una reunión: cuenta por su tarea.
 *  5. El mismo evento en dos calendarios es UNA reunión con dos personas (cada una suma sus horas).
 *  6. La empresa la decide el resolvedor único (`empresasDeLaReunion` + `cuentaDelEvento`, lib/mi-dia/agenda.ts): con
 *     más de una, o ninguna, el evento no es de nadie (invariante 1).
 *  7. Cuenta solo quien no rechazó la invitación; los topes de duración los pone `minutosContables` al juntar.
 */
import { invitadosDelEvento, isoDelEvento } from "@/lib/exploraciones/agendadas";
import { cuentaDelEvento, empresasDeLaReunion, type EventoConEnlaces } from "@/lib/mi-dia/agenda";
import { esBloqueDeTarea } from "@/lib/google/meet-sync-cambios";
import type { ReunionParaCarga, TipoDeEmpresa } from "@/lib/carga/reuniones";

/** Prefijo del id de una reunión que salió del calendario (y no de Meet). */
export const PREFIJO_DEL_CALENDARIO = "cal:";

/** Una reunión agregada a mano a ±30 minutos del evento y del mismo cliente es la misma. */
export const VENTANA_DE_LA_MISMA_MS = 30 * 60_000;

export interface CalendarioDeUnaPersona {
  /** El dueño del calendario (correo del equipo). */
  email: string;
  eventos: readonly EventoConEnlaces[];
}

export interface DatosParaElCalendario {
  /** Correo exacto → empresas (contactos de HubSpot). */
  porCorreo: ReadonlyMap<string, readonly string[]>;
  /** Dominio → empresas (dominios registrados). */
  porDominio: ReadonlyMap<string, readonly string[]>;
  /** Los dominios de Smarteam. */
  internos: ReadonlySet<string>;
  /** Las empresas que se pueden cargar: id → nombre y tipo. Una empresa fuera de este mapa no carga horas. */
  empresas: ReadonlyMap<string, { nombre: string; tipo: TipoDeEmpresa }>;
  /** Los `googleEventId` de las sesiones de Meet que ya existen. */
  eventosDeSesiones: ReadonlySet<string>;
  /** Las reuniones agregadas a mano: su cliente y cuándo empezaron. */
  manuales: ReadonlyArray<{ clienteId: string; inicio: Date | string }>;
}

export interface LecturaDelCalendario {
  reuniones: ReunionParaCarga[];
  cuenta: {
    /** Eventos con hora, con otra gente invitada, leídos de todos los calendarios (cada uno una vez). */
    leidos: number;
    contados: number;
    conMeet: number;
    yaEnUnaSesion: number;
    agregadasAMano: number;
    /** Sin empresa, o con invitados de más de una: no son de nadie. */
    sinUnaEmpresa: number;
    bloquesDeTareas: number;
  };
}

const dominioDe = (email: string) => email.split("@")[1]?.trim().toLowerCase() ?? "";

const conMeet = (e: EventoConEnlaces) => e.conferenceData?.conferenceSolution?.key?.type === "hangoutsMeet" || !!e.hangoutLink;

/** ¿La dueña del calendario rechazó el evento? */
const rechazado = (e: EventoConEnlaces) => !!e.attendees?.some((a) => a.self && a.responseStatus === "declined");

interface EnArmado {
  inicio: string;
  fin: string;
  titulo: string;
  clienteId: string;
  personas: Set<string>;
}

/** Las reuniones con clientes del calendario que no están en Meet, juntando los calendarios de todo el equipo. */
export function reunionesDelCalendario(calendarios: readonly CalendarioDeUnaPersona[], d: DatosParaElCalendario): LecturaDelCalendario {
  const cuenta = { leidos: 0, contados: 0, conMeet: 0, yaEnUnaSesion: 0, agregadasAMano: 0, sinUnaEmpresa: 0, bloquesDeTareas: 0 };
  const vistos = new Set<string>();
  const armadas = new Map<string, EnArmado>();
  const descartados = new Set<string>();

  for (const cal of calendarios) {
    const duena = cal.email.trim().toLowerCase();
    for (const e of cal.eventos) {
      if (!e.id || e.status === "cancelled" || !e.start?.dateTime) continue;
      const inicio = isoDelEvento(e.start);
      const fin = isoDelEvento(e.end);
      if (!inicio || !fin) continue;
      const gente = invitadosDelEvento(e);
      if (gente.length < 2) continue; // sola en su calendario: no es una reunión
      const nuevo = !vistos.has(e.id);
      vistos.add(e.id);
      if (nuevo) cuenta.leidos++;

      const armada = armadas.get(e.id);
      if (armada) {
        if (!rechazado(e)) armada.personas.add(duena);
        continue;
      }
      if (descartados.has(e.id)) continue;

      const descartar = (motivo: keyof typeof cuenta) => {
        descartados.add(e.id!);
        cuenta[motivo]++;
      };
      if (esBloqueDeTarea(e)) {
        descartar("bloquesDeTareas");
        continue;
      }
      if (conMeet(e)) {
        descartar("conMeet");
        continue;
      }
      if (d.eventosDeSesiones.has(e.id) || (e.recurringEventId && d.eventosDeSesiones.has(e.recurringEventId))) {
        descartar("yaEnUnaSesion");
        continue;
      }
      const externos = gente.filter((c) => !d.internos.has(dominioDe(c)));
      const clienteId = cuentaDelEvento({ empresas: empresasDeLaReunion(externos, d.porCorreo, d.porDominio) });
      if (!clienteId || !d.empresas.has(clienteId)) {
        descartar("sinUnaEmpresa");
        continue;
      }
      const ms = Date.parse(inicio);
      const mismaAMano = d.manuales.some((m) => m.clienteId === clienteId && Math.abs(+new Date(m.inicio) - ms) <= VENTANA_DE_LA_MISMA_MS);
      if (mismaAMano) {
        descartar("agregadasAMano");
        continue;
      }
      armadas.set(e.id, {
        inicio,
        fin,
        titulo: e.summary?.trim() || "(Sin título)",
        clienteId,
        personas: new Set(rechazado(e) ? [] : [duena]),
      });
    }
  }

  const reuniones: ReunionParaCarga[] = [];
  for (const [id, a] of armadas) {
    if (a.personas.size === 0) continue; // todos los del equipo la rechazaron
    const empresa = d.empresas.get(a.clienteId)!;
    reuniones.push({
      id: `${PREFIJO_DEL_CALENDARIO}${id}`,
      inicio: a.inicio,
      duracionMin: Math.max(0, (Date.parse(a.fin) - Date.parse(a.inicio)) / 60_000),
      titulo: a.titulo,
      participantes: [...a.personas],
      cliente: { id: a.clienteId, nombre: empresa.nombre, tipo: empresa.tipo },
    });
  }
  cuenta.contados = reuniones.length;
  return { reuniones: reuniones.sort((x, y) => String(x.inicio).localeCompare(String(y.inicio))), cuenta };
}
