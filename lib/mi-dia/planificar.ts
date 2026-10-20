/**
 * lib/mi-dia/planificar.ts — «Planifica tu semana» (fase 2.3 de docs/nexus-sistema-de-trabajo-plan.md, 2026-10-17).
 * PURO y client-safe: lo arma lib/mi-dia/planificar-server.ts y lo muestra components/tareas/PlanificaTuSemana.tsx.
 *
 * Para cada cuenta que llevas, Nexus arma la semana con las reglas de servicio (lib/mi-dia/servicio.ts), sin IA:
 *   · la ACCIÓN: la tarea abierta con fecha en la semana; si no hay, darle fecha a la tarea abierta más importante de la
 *     cuenta; si no hay ninguna, una tarea nueva («Seguimiento semanal con…» o lo que debe el cliente);
 *   · la REUNIÓN: la que ya está en tu calendario o planeada en Tareas; si no hay, una sugerida en el primer hueco
 *     laboral libre de la semana (de lunes a viernes, de 8:00 a 17:00), con su objetivo. Cada sugerida ocupa su hueco:
 *     no se pisan entre ellas. Primero las cuentas que llevan más tiempo sin reunión.
 *   · lo que NO CABE: una reunión sugerida sin hueco libre antes del viernes a las 17:00.
 * Una reunión que ya está en la semana ES el siguiente paso de la cuenta (2026-10-19, lib/mi-dia/servicio.ts): si no
 * tiene una tarea con fecha, la acción es esa reunión y no se le propone una tarea de más.
 * Cada sugerencia dice de dónde sale. La persona la ajusta en la pantalla; «Agendar» abre Google Calendar lleno (Nexus no
 * escribe en el calendario) y «Ya lo guardé» deja la reunión planeada en Tareas.
 */
import { HORA_FIN_LABORAL, HORA_INICIO_LABORAL } from "./constantes";
import { instante, minutoDelDia, primerHuecoLaboral, type EventoParaLaGrilla } from "./inicio";
import { accionDeLaSemana, esAccion, type ReunionDeLaCuenta, type TareaDeLaCuenta, type VentanaDeLaSemana } from "./servicio";

const DIA_MS = 86_400_000;
/** Cuánto dura una reunión sugerida. */
export const MINUTOS_DE_LA_REUNION_SUGERIDA = 60;

const sumarDias = (fecha: string, n: number) => new Date(Date.parse(`${fecha}T00:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);
const diaDeLaSemana = (fecha: string) => (new Date(`${fecha}T00:00:00Z`).getUTCDay() + 6) % 7; // lunes = 0

export interface SemanaAPlanificar extends VentanaDeLaSemana {
  /** El viernes. */
  viernes: string;
  /** Los días de trabajo que quedan para planificar (de hoy, o del lunes, al viernes). */
  dias: string[];
  /** «la semana que viene» o «esta semana». */
  cual: "proxima" | "esta";
}

/**
 * La semana que se planifica: desde el viernes, la que viene (el viernes se planifica la siguiente); de lunes a jueves,
 * lo que queda de esta.
 */
export function semanaAPlanificar(hoyISO: string): SemanaAPlanificar {
  const d = diaDeLaSemana(hoyISO);
  const proxima = d >= 4;
  const lunes = proxima ? sumarDias(hoyISO, 7 - d) : sumarDias(hoyISO, -d);
  const viernes = sumarDias(lunes, 4);
  const primero = proxima ? lunes : hoyISO;
  const dias: string[] = [];
  for (let x = primero; x <= viernes; x = sumarDias(x, 1)) dias.push(x);
  return { desde: lunes, hasta: sumarDias(lunes, 6), viernes, dias, cual: proxima ? "proxima" : "esta" };
}

/**
 * La invitación de «Para ti» a planificar (2026-10-18): de viernes a domingo, que es cuando se planifica la semana que
 * viene (`semanaAPlanificar`). De lunes a jueves, null. `hoyISO` es el día de Costa Rica.
 */
export function invitacionAPlanificar(hoyISO: string): string | null {
  switch (diaDeLaSemana(hoyISO)) {
    case 4:
      return "Es viernes: planifica la semana que viene";
    case 5:
      return "Es sábado: planifica la semana que viene";
    case 6:
      return "Mañana empieza la semana: planifícala";
    default:
      return null;
  }
}

/** Una tarea de la cuenta con lo que el plan necesita (la versión, para darle fecha). */
export type TareaDelPlan = TareaDeLaCuenta & { prioridad: string; clase: string; lado: string; version: number };

/** Lo que hace falta de una cuenta para planificarla. */
export interface CuentaParaPlanificar {
  clientId: string;
  empresa: string;
  proyectos: string[];
  /** Las tareas abiertas de la cuenta (de cualquier equipo, sin lo «Solo para mí»). */
  tareas: readonly TareaDelPlan[];
  /** Las reuniones con la cuenta que vienen (tu calendario y las planeadas en Tareas). */
  reuniones: readonly ReunionDeLaCuenta[];
  /** Los correos del cliente de la última reunión (para invitarlos). */
  invitados: readonly string[];
  /** ISO de la última reunión con el cliente. */
  ultimaReunion: string | null;
  /** La próxima reunión que dejó sugerida la última reunión (la página de la reunión), si nadie la agendó ni descartó. */
  proximaSugerida: { titulo: string | null; objetivo: string; deLaReunion: string; sessionId: string } | null;
}

export type AccionDelPlan =
  | { tipo: "tiene"; tarea: TareaDelPlan; dia: string }
  /** La cuenta ya tiene una reunión esta semana: esa reunión es su siguiente paso. */
  | { tipo: "reunion"; reunion: ReunionDeLaCuenta; dia: string }
  | { tipo: "darle-fecha"; tarea: TareaDelPlan; dia: string; porque: string }
  | { tipo: "nueva"; titulo: string; dia: string; porque: string };

export type ReunionDelPlan =
  | { tipo: "tiene"; reunion: ReunionDeLaCuenta }
  | {
      tipo: "sugerida" | "no-cabe";
      /** ISO; null si no cabe. */
      inicio: string | null;
      fin: string | null;
      titulo: string;
      objetivo: string;
      /** De dónde sale el objetivo. */
      objetivoDe: string;
      invitados: string[];
      /** La reunión cuya próxima es (para marcarla agendada al guardarla). */
      sessionId: string | null;
    };

export interface PlanDeLaCuenta {
  clientId: string;
  empresa: string;
  proyectos: string[];
  ultimaReunion: string | null;
  accion: AccionDelPlan;
  reunion: ReunionDelPlan;
}

export interface PlanDeLaSemana {
  semana: SemanaAPlanificar;
  cuentas: PlanDeLaCuenta[];
  /** false = tu calendario no se pudo leer: las reuniones que ya tienes pueden no verse, y los huecos son sin tu agenda. */
  calendarioLeido: boolean;
}

const PESO_DE_PRIORIDAD: Record<string, number> = { alta: 0, media: 1, baja: 2 };
const enLaSemana = (iso: string, s: SemanaAPlanificar) => {
  const dia = minutoDelDia(iso).dia;
  return dia >= s.desde && dia <= s.viernes;
};
const listar = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

function accionDelPlan(c: CuentaParaPlanificar, s: SemanaAPlanificar, diaDeLaReunion: string | null, yaHay: ReunionDeLaCuenta | null): AccionDelPlan {
  const id = accionDeLaSemana(c.tareas, s)?.id;
  const tiene = id ? c.tareas.find((t) => t.id === id) : undefined;
  if (tiene) return { tipo: "tiene", tarea: tiene, dia: tiene.reunionDia ?? tiene.venceEl ?? tiene.semana ?? s.desde };
  if (yaHay && diaDeLaReunion) return { tipo: "reunion", reunion: yaHay, dia: diaDeLaReunion };
  const dia = diaDeLaReunion && s.dias.includes(diaDeLaReunion) ? diaDeLaReunion : s.dias[0];
  // La abierta más importante de la cuenta que no es una reunión ni lo que debe el cliente: darle fecha.
  const candidata = c.tareas
    .filter((t) => esAccion(t) && t.clase !== "reunion" && t.lado !== "cliente")
    .sort((a, b) => (PESO_DE_PRIORIDAD[a.prioridad] ?? 1) - (PESO_DE_PRIORIDAD[b.prioridad] ?? 1) || a.numero - b.numero)[0];
  if (candidata) {
    const porque = candidata.prioridad === "alta" ? "es la tarea abierta de prioridad alta de la cuenta" : "es la tarea abierta más antigua de la cuenta";
    return { tipo: "darle-fecha", tarea: candidata, dia, porque: `${porque} y no tiene fecha esta semana` };
  }
  const delCliente = c.tareas.find((t) => esAccion(t) && t.lado === "cliente");
  if (delCliente) {
    return { tipo: "nueva", titulo: `Darle seguimiento con ${c.empresa} a «${delCliente.titulo}»`, dia, porque: `el cliente tiene pendiente T-${delCliente.numero}` };
  }
  return { tipo: "nueva", titulo: `Seguimiento semanal con ${c.empresa}`, dia, porque: "la cuenta no tiene ninguna tarea abierta" };
}

function objetivoDeLaReunion(c: CuentaParaPlanificar, accion: AccionDelPlan): { objetivo: string; objetivoDe: string } {
  if (c.proximaSugerida?.objetivo.trim()) return { objetivo: c.proximaSugerida.objetivo.trim(), objetivoDe: `lo que dejó sugerido ${c.proximaSugerida.deLaReunion}` };
  const delCliente = c.tareas.filter((t) => esAccion(t) && t.lado === "cliente").slice(0, 2);
  if (delCliente.length) {
    return { objetivo: `Revisar lo que tiene pendiente el cliente: ${listar(delCliente.map((t) => `«${t.titulo}»`))}, y acordar el siguiente paso.`, objetivoDe: "las tareas del cliente en Tareas" };
  }
  if (accion.tipo === "tiene" || accion.tipo === "darle-fecha") return { objetivo: `Avanzar en «${accion.tarea.titulo}» y acordar el siguiente paso.`, objetivoDe: "la acción de la semana" };
  return { objetivo: "Revisar cómo va la cuenta y acordar el siguiente paso.", objetivoDe: "la regla de servicio: una reunión cada semana" };
}

/**
 * El plan de la semana para tus cuentas. `ocupado`: tu calendario de la semana (lo que no se pisa). `ahora`: lo que ya
 * pasó no se sugiere.
 */
export function planificarLaSemana(
  cuentas: readonly CuentaParaPlanificar[],
  o: { hoyISO: string; ahora: Date; ocupado: readonly EventoParaLaGrilla[] | null },
): PlanDeLaSemana {
  const semana = semanaAPlanificar(o.hoyISO);
  const ocupado: EventoParaLaGrilla[] = [...(o.ocupado ?? [])];
  const inicioDeLaSemana = Date.parse(instante(semana.dias[0], HORA_INICIO_LABORAL * 60));
  const desde = new Date(Math.max(o.ahora.getTime(), inicioDeLaSemana - 60_000));
  const finDeLaSemana = Date.parse(instante(semana.viernes, HORA_FIN_LABORAL * 60));
  // Primero las que llevan más tiempo sin reunión (sin ninguna, primero de todas): toman los primeros huecos.
  const orden = [...cuentas].sort((a, b) => (a.ultimaReunion ?? "").localeCompare(b.ultimaReunion ?? "") || a.empresa.localeCompare(b.empresa, "es"));
  const planes = new Map<string, PlanDeLaCuenta>();
  for (const c of orden) {
    const yaHay = c.reuniones.filter((r) => enLaSemana(r.inicio, semana) && Date.parse(r.inicio) >= o.ahora.getTime() - 3_600_000).sort((a, b) => a.inicio.localeCompare(b.inicio))[0];
    let reunion: ReunionDelPlan;
    let diaDeLaReunion: string | null = null;
    if (yaHay) {
      reunion = { tipo: "tiene", reunion: yaHay };
      diaDeLaReunion = minutoDelDia(yaHay.inicio).dia;
    } else {
      const h = primerHuecoLaboral(ocupado, desde, { minutos: MINUTOS_DE_LA_REUNION_SUGERIDA });
      const cabe = Date.parse(h.fin) <= finDeLaSemana;
      if (cabe) {
        ocupado.push({ id: `plan:${c.clientId}`, inicio: h.inicio, fin: h.fin });
        diaDeLaReunion = minutoDelDia(h.inicio).dia;
      }
      reunion = {
        tipo: cabe ? "sugerida" : "no-cabe",
        inicio: cabe ? h.inicio : null,
        fin: cabe ? h.fin : null,
        titulo: c.proximaSugerida?.titulo?.trim() || `Seguimiento con ${c.empresa}`,
        objetivo: "",
        objetivoDe: "",
        invitados: [...c.invitados],
        sessionId: c.proximaSugerida?.sessionId ?? null,
      };
    }
    const accion = accionDelPlan(c, semana, diaDeLaReunion, yaHay ?? null);
    if (reunion.tipo !== "tiene") Object.assign(reunion, objetivoDeLaReunion(c, accion));
    planes.set(c.clientId, { clientId: c.clientId, empresa: c.empresa, proyectos: c.proyectos, ultimaReunion: c.ultimaReunion, accion, reunion });
  }
  // En pantalla, por nombre: el orden de arriba es solo para repartir los huecos.
  const lista = [...planes.values()].sort((a, b) => a.empresa.localeCompare(b.empresa, "es"));
  return { semana, cuentas: lista, calendarioLeido: o.ocupado !== null };
}

/**
 * Cuántas cuentas ya tienen su siguiente paso (una tarea con fecha o una reunión en la semana), cuántas su reunión, y
 * cuántas reuniones no caben.
 */
export function resumenDelPlan(p: PlanDeLaSemana): { cuentas: number; conAccion: number; conReunion: number; noCaben: number } {
  return {
    cuentas: p.cuentas.length,
    conAccion: p.cuentas.filter((c) => c.accion.tipo === "tiene" || c.accion.tipo === "reunion").length,
    conReunion: p.cuentas.filter((c) => c.reunion.tipo === "tiene").length,
    noCaben: p.cuentas.filter((c) => c.reunion.tipo === "no-cabe").length,
  };
}
