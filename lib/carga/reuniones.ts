/**
 * lib/carga/reuniones.ts — el tiempo en reuniones, por persona, por semana y por cuenta. PURO.
 *
 * ── DE DÓNDE SALE ────────────────────────────────────────────────────────────
 * De las reuniones de Google Meet que Nexus copia del calendario (`FirefliesSession`): inicio, duración (fin − inicio
 * del evento) e invitados. Es tiempo AGENDADO, no asistido: se cuenta a cada invitado del equipo aunque no haya
 * entrado o haya rechazado la invitación. Hasta leer el registro de Meet, la pantalla lo dice.
 *
 * ── LAS DOS REGLAS QUE EVITAN NÚMEROS INFLADOS ───────────────────────────────
 * 1. Una reunión de 8 horas o más es un evento de día completo (un feriado, un «fuera de oficina»): no cuenta. Las
 *    demás se topan en 4 horas, porque un bloque de agenda de medio día no es una reunión.
 * 2. Una persona cuenta en una reunión solo mientras está en el equipo: después de su baja, las invitaciones
 *    recurrentes la siguen nombrando y no le pasan a nadie.
 *
 * El dueño de la reunión es el que materializa el clasificador (`resolvedClientId`): este módulo no vuelve a
 * resolver de quién es una sesión (invariante #2 del repo).
 */
import { esDeNuestroEquipo, esRecursoDeCalendario } from "@/lib/sessions/dominio-propio";
import { lunesDe } from "./semana";

export const MINUTOS_DIA_COMPLETO = 480;
export const TOPE_MINUTOS = 240;

export type TipoDeEmpresa = "CLIENTE" | "PROSPECTO" | "ALIADO" | "INTERNO";
export type Destino = "cliente" | "comercial" | "interna";

export interface ReunionParaCarga {
  id: string;
  inicio: Date | string;
  duracionMin: number;
  titulo?: string;
  participantes: string[];
  cliente: { id: string; nombre: string; tipo: TipoDeEmpresa } | null;
}

export interface PersonaParaCarga {
  email: string;
  nombre: string;
  baja: Date | string | null;
}

/** Los minutos que cuenta una reunión, o null si no cuenta (sin duración o de día completo). */
export function minutosContables(duracionMin: number): number | null {
  if (!Number.isFinite(duracionMin) || duracionMin <= 0) return null;
  if (duracionMin >= MINUTOS_DIA_COMPLETO) return null;
  return Math.min(duracionMin, TOPE_MINUTOS);
}

/** A dónde va el tiempo de una reunión: a un cliente, a lo comercial (prospectos, aliados, externos sin empresa) o a lo interno. */
export function destinoDe(r: ReunionParaCarga): { destino: Destino; clienteId: string | null; sinEmpresa: boolean } {
  if (r.cliente) {
    if (r.cliente.tipo === "CLIENTE") return { destino: "cliente", clienteId: r.cliente.id, sinEmpresa: false };
    if (r.cliente.tipo === "INTERNO") return { destino: "interna", clienteId: null, sinEmpresa: false };
    return { destino: "comercial", clienteId: null, sinEmpresa: false };
  }
  const personas = r.participantes.filter((p) => !esRecursoDeCalendario(p));
  const todosNuestros = personas.length > 0 && personas.every((p) => esDeNuestroEquipo(p));
  return todosNuestros
    ? { destino: "interna", clienteId: null, sinEmpresa: false }
    : { destino: "comercial", clienteId: null, sinEmpresa: true };
}

export interface MinutosDeLaSemana {
  cliente: number;
  comercial: number;
  interna: number;
  /** Reuniones con clientes (para la preparación). */
  reunionesConCliente: number;
  /** Reuniones con clientes en las que esta persona fue la única del equipo de CS. */
  reunionesSinOtroDeCs: number;
  porCliente: Map<string, { minutos: number; reuniones: number }>;
}

export interface CuentaVista {
  clienteId: string;
  nombre: string;
  /** Minutos de calendario (la reunión una vez, aunque fueran tres personas). */
  minutos: number;
  /** Minutos-persona: cada persona del equipo que estuvo cuenta. Es lo que cuesta. */
  minutosPersona: number;
  reuniones: number;
  ultima: string | null;
  porPersona: Map<string, { minutos: number; reuniones: number }>;
}

export interface TiempoEnReuniones {
  /** email → lunes → minutos. */
  porPersona: Map<string, Map<string, MinutosDeLaSemana>>;
  porCuenta: Map<string, CuentaVista>;
  /** Reuniones que contaron (con al menos alguien del equipo vigente). */
  reunionesContadas: number;
  /** De día completo o sin duración: no cuentan. */
  reunionesDescartadas: number;
}

function vacia(): MinutosDeLaSemana {
  return { cliente: 0, comercial: 0, interna: 0, reunionesConCliente: 0, reunionesSinOtroDeCs: 0, porCliente: new Map() };
}

/**
 * Junta el tiempo en reuniones. `equipoCs` son los correos de quienes llevan cuentas (CSE y CSL): con eso se sabe en
 * qué reuniones con clientes una persona estuvo sola, sin otro de CS (la CSL cubriendo cuentas sin CSE, por ejemplo).
 */
export function tiempoEnReuniones(
  reuniones: ReunionParaCarga[],
  personas: PersonaParaCarga[],
  equipoCs: Iterable<string> = [],
): TiempoEnReuniones {
  const porEmail = new Map(personas.map((p) => [p.email.trim().toLowerCase(), p]));
  const cs = new Set([...equipoCs].map((e) => e.trim().toLowerCase()));
  const porPersona = new Map<string, Map<string, MinutosDeLaSemana>>();
  const porCuenta = new Map<string, CuentaVista>();
  let reunionesContadas = 0;
  let reunionesDescartadas = 0;

  for (const r of reuniones) {
    const min = minutosContables(r.duracionMin);
    if (min === null) {
      reunionesDescartadas++;
      continue;
    }
    const cuando = new Date(r.inicio);
    const presentes = [...new Set(r.participantes.map((p) => p.trim().toLowerCase()))].filter((e) => {
      const p = porEmail.get(e);
      return !!p && (!p.baja || new Date(p.baja) > cuando);
    });
    if (presentes.length === 0) continue;
    reunionesContadas++;
    const { destino, clienteId } = destinoDe(r);
    const lunes = lunesDe(cuando);
    const deCs = presentes.filter((e) => cs.has(e));

    if (destino === "cliente" && clienteId) {
      const c = porCuenta.get(clienteId) ?? {
        clienteId,
        nombre: r.cliente?.nombre ?? clienteId,
        minutos: 0,
        minutosPersona: 0,
        reuniones: 0,
        ultima: null,
        porPersona: new Map(),
      };
      c.minutos += min;
      c.minutosPersona += min * presentes.length;
      c.reuniones++;
      const iso = cuando.toISOString();
      if (!c.ultima || iso > c.ultima) c.ultima = iso;
      for (const e of presentes) {
        const pp = c.porPersona.get(e) ?? { minutos: 0, reuniones: 0 };
        pp.minutos += min;
        pp.reuniones++;
        c.porPersona.set(e, pp);
      }
      porCuenta.set(clienteId, c);
    }

    for (const e of presentes) {
      const semanas = porPersona.get(e) ?? new Map<string, MinutosDeLaSemana>();
      const s = semanas.get(lunes) ?? vacia();
      s[destino] += min;
      if (destino === "cliente" && clienteId) {
        s.reunionesConCliente++;
        if (cs.has(e) && deCs.length === 1) s.reunionesSinOtroDeCs++;
        const pc = s.porCliente.get(clienteId) ?? { minutos: 0, reuniones: 0 };
        pc.minutos += min;
        pc.reuniones++;
        s.porCliente.set(clienteId, pc);
      }
      semanas.set(lunes, s);
      porPersona.set(e, semanas);
    }
  }
  return { porPersona, porCuenta, reunionesContadas, reunionesDescartadas };
}
