/**
 * lib/mi-dia/servicio.ts — las reglas de servicio de cada cuenta (ficha D, 2026-10-17; decisión 2 de
 * docs/nexus-sistema-de-trabajo-plan.md y fase 2.1). PURO y client-safe.
 *
 * Cada cuenta con servicio activo tiene, cada semana:
 *   · su ACCIÓN: una tarea abierta (pendiente o en curso, no «Solo para mí») de la cuenta, de cualquier equipo, con
 *     fecha dentro de la semana. La fecha de una tarea es la de su reunión, su vencimiento o, si no, su semana (la
 *     misma regla del siguiente paso, lib/siguiente-paso/desde-tareas.ts).
 *   · su REUNIÓN: una reunión con la cuenta en los próximos 8 días (en el calendario de quien la lleva, o una reunión
 *     planeada en Tareas).
 * Si falta una de las dos, la cuenta aparece en el inicio de quien la lleva como «Cuenta sin acción» (peso 80 en
 * lib/para-ti/importa.ts).
 *
 * ⚠ «La semana» es la de hoy, de lunes a domingo; desde el sábado se mira la siguiente: el fin de semana ya no se
 * hace nada de la que termina, y lo que importa es que la que viene tenga su acción.
 */
import { DIAS_PARA_LA_REUNION } from "./constantes";
import { enlaceParaAgendarEnCalendar } from "./calendario";
import type { Pendiente } from "@/lib/para-ti/tipos";

export { DIAS_PARA_LA_REUNION };

const DIA_MS = 86_400_000;

/** La clave de la fuente en «Para ti» (su peso está en lib/para-ti/importa.ts). */
export const FUENTE_CUENTA_SIN_ACCION = "cuenta-sin-accion";

/** Una tarea de la cuenta, con lo que hace falta para la regla. Fechas `AAAA-MM-DD`. */
export interface TareaDeLaCuenta {
  id: string;
  numero: number;
  titulo: string;
  clientId: string;
  estado: string;
  privada: boolean;
  venceEl: string | null;
  semana: string | null;
  /** Una reunión planeada: su día en Costa Rica. */
  reunionDia: string | null;
  equipo: string | null;
  responsableEmail: string | null;
}

/** Una reunión con la cuenta que viene. */
export interface ReunionDeLaCuenta {
  clientId: string;
  titulo: string;
  /** ISO UTC. */
  inicio: string;
  /** De dónde salió: el calendario de quien la lleva o una reunión planeada en Tareas. */
  fuente: "calendario" | "tarea";
}

export interface VentanaDeLaSemana {
  /** El lunes, `AAAA-MM-DD`. */
  desde: string;
  /** El domingo. */
  hasta: string;
}

const sumarDias = (fecha: string, n: number) => new Date(Date.parse(`${fecha}T00:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);
const diaDeLaSemana = (fecha: string) => (new Date(`${fecha}T00:00:00Z`).getUTCDay() + 6) % 7; // lunes = 0

/** La semana de la regla: la de hoy; desde el sábado, la que viene. */
export function ventanaDeLaSemana(hoyISO: string): VentanaDeLaSemana {
  const dia = diaDeLaSemana(hoyISO);
  const lunes = sumarDias(hoyISO, dia >= 5 ? 7 - dia : -dia);
  return { desde: lunes, hasta: sumarDias(lunes, 6) };
}

/** La fecha de una tarea para la regla: la de su reunión, su vencimiento o su semana. */
export function fechaDeLaTarea(t: Pick<TareaDeLaCuenta, "reunionDia" | "venceEl" | "semana">): string | null {
  return t.reunionDia ?? t.venceEl ?? t.semana ?? null;
}

const ABIERTAS = new Set(["pendiente", "en_curso"]);

/** ¿Cuenta como acción? Abierta y no privada. */
export function esAccion(t: Pick<TareaDeLaCuenta, "estado" | "privada">): boolean {
  return ABIERTAS.has(t.estado) && !t.privada;
}

/** La acción de la semana: la tarea abierta con la fecha más temprana dentro de la semana. null = no hay. */
export function accionDeLaSemana(tareas: readonly TareaDeLaCuenta[], v: VentanaDeLaSemana): TareaDeLaCuenta | null {
  const enLaSemana = tareas
    .filter((t) => esAccion(t))
    .map((t) => ({ t, f: fechaDeLaTarea(t) }))
    .filter((x): x is { t: TareaDeLaCuenta; f: string } => !!x.f && x.f >= v.desde && x.f <= v.hasta)
    .sort((a, b) => a.f.localeCompare(b.f) || a.t.numero - b.t.numero);
  return enLaSemana[0]?.t ?? null;
}

/** La próxima reunión con la cuenta en los próximos `DIAS_PARA_LA_REUNION` días. null = no hay. */
export function reunionEnLosProximosDias(reuniones: readonly ReunionDeLaCuenta[], ahora: Date): ReunionDeLaCuenta | null {
  const desde = ahora.getTime();
  const hasta = desde + DIAS_PARA_LA_REUNION * DIA_MS;
  return (
    reuniones
      .filter((r) => {
        const t = Date.parse(r.inicio);
        return Number.isFinite(t) && t >= desde && t <= hasta;
      })
      .sort((a, b) => a.inicio.localeCompare(b.inicio))[0] ?? null
  );
}

export type FaltaDeServicio = "accion" | "reunion";

export interface EstadoDeServicio {
  clientId: string;
  accion: TareaDeLaCuenta | null;
  reunion: ReunionDeLaCuenta | null;
  /** Lo que falta, en orden. Vacío = la cuenta está al día. */
  falta: FaltaDeServicio[];
}

export function estadoDeServicio(
  clientId: string,
  tareas: readonly TareaDeLaCuenta[],
  reuniones: readonly ReunionDeLaCuenta[],
  o: { hoyISO: string; ahora: Date },
): EstadoDeServicio {
  const accion = accionDeLaSemana(
    tareas.filter((t) => t.clientId === clientId),
    ventanaDeLaSemana(o.hoyISO),
  );
  const reunion = reunionEnLosProximosDias(
    reuniones.filter((r) => r.clientId === clientId),
    o.ahora,
  );
  const falta: FaltaDeServicio[] = [];
  if (!accion) falta.push("accion");
  if (!reunion) falta.push("reunion");
  return { clientId, accion, reunion, falta };
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

/** «2 oct» de un instante, en Costa Rica. */
export function diaCorto(iso: string): string {
  const d = new Date(Date.parse(iso) - 6 * 3_600_000);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

/** «hoy», «mañana», «jue» o «jue 22» de un instante, mirado desde hoy (Costa Rica). */
export function cuandoEsLaReunion(iso: string, hoyISO: string): string {
  const d = new Date(Date.parse(iso) - 6 * 3_600_000);
  const dia = d.toISOString().slice(0, 10);
  if (dia === hoyISO) return "hoy";
  if (dia === sumarDias(hoyISO, 1)) return "mañana";
  const nombre = DIAS[(d.getUTCDay() + 6) % 7];
  return dia <= sumarDias(hoyISO, 6) ? nombre : `${nombre} ${d.getUTCDate()}`;
}

/** Lo que dice una fila de «Tus cuentas» sobre la acción y la reunión. */
export function marcasDeServicio(e: EstadoDeServicio, hoyISO: string): { accion: string | null; reunion: string | null } {
  return {
    accion: e.accion ? "✓" : null,
    reunion: e.reunion ? `✓ ${cuandoEsLaReunion(e.reunion.inicio, hoyISO)}` : null,
  };
}

/**
 * El pendiente «Cuenta sin acción» de una cuenta, o null si está al día. Con lo que falta en el título y qué
 * hacer en el botón: sin reunión → «Agendar» (abre Google Calendar con todo lleno: título, invitados y, si se sabe, la
 * primera hora libre en horario laboral, `hueco`); con reunión y sin acción → crear la tarea en la ficha de la cuenta.
 */
export function pendienteDeCuentaSinAccion(
  cuenta: { clientId: string; empresa: string },
  e: EstadoDeServicio,
  o: {
    ultimaReunion: string | null;
    invitados?: readonly string[];
    hoyISO: string;
    correo?: string | null;
    /** La primera hora libre en horario laboral de quien la lleva (lib/mi-dia/inicio.ts › primerHuecoLaboral). */
    hueco?: { inicio: string; fin: string } | null;
  },
): Pendiente | null {
  if (e.falta.length === 0) return null;
  const sinAccion = e.falta.includes("accion");
  const sinReunion = e.falta.includes("reunion");
  const ultima = o.ultimaReunion ? `la última reunión fue el ${diaCorto(o.ultimaReunion)}` : "no hay reuniones registradas con la cuenta";
  // Lo que falta va en el título, con la empresa adelante, como lo demás de «Lo que importa hoy»: en la línea gris de
  // arriba no se encontraba (Elías, 2026-10-19). Debajo, por qué y qué hacer.
  const que = sinAccion && sinReunion ? "sin acción ni reunión" : sinAccion ? "sin acción esta semana" : `sin reunión en ${DIAS_PARA_LA_REUNION} días`;
  const titulo = `${cuenta.empresa}: ${que}`;
  const porque = sinReunion
    ? `Nada agendado en los próximos ${DIAS_PARA_LA_REUNION} días; ${ultima}.`
    : `Tiene reunión ${cuandoEsLaReunion(e.reunion!.inicio, o.hoyISO)}, pero ninguna tarea con fecha esta semana.`;
  const queHacer =
    sinAccion && sinReunion
      ? "Agenda la próxima reunión y deja una tarea con fecha esta semana."
      : sinAccion
        ? "Deja una tarea con fecha esta semana: lo que vas a hacer con la cuenta."
        : "Agenda la próxima reunión: Nexus la arma en tu agenda y la abres en Google Calendar.";
  const detalle = `${porque} ${queHacer}`;
  const href = sinReunion
    ? enlaceParaAgendarEnCalendar({
        titulo: `Reunión con ${cuenta.empresa}`,
        detalle: `Seguimiento de la cuenta ${cuenta.empresa}.`,
        inicio: o.hueco?.inicio ?? null,
        fin: o.hueco?.fin ?? null,
        invitados: o.invitados ?? [],
        correo: o.correo ?? null,
      })
    : `/clients/${encodeURIComponent(cuenta.clientId)}?tab=__tareas__`;
  return {
    clave: `${FUENTE_CUENTA_SIN_ACCION}:${cuenta.clientId}`,
    fuente: FUENTE_CUENTA_SIN_ACCION,
    cuando: "hoy",
    delAgente: false,
    clientId: cuenta.clientId,
    titulo,
    detalle,
    meta: `${cuenta.empresa} · Cuenta sin acción`,
    accion: sinReunion ? "Agendar" : "Crear la acción",
    href,
    desde: o.ultimaReunion,
  };
}
