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
  /** El id del evento en Google Calendar (solo las del calendario): la clave de la sugerencia del siguiente paso. */
  eventoId?: string;
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

/** «hoy», «mañana» o «el jue 22» de un instante, mirado desde hoy (Costa Rica): para escribir «tiene reunión …». */
export function elDiaDeLaReunion(iso: string, hoyISO: string): string {
  const d = new Date(Date.parse(iso) - 6 * 3_600_000);
  const dia = d.toISOString().slice(0, 10);
  if (dia === hoyISO) return "hoy";
  if (dia === sumarDias(hoyISO, 1)) return "mañana";
  return `el ${DIAS[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()}`;
}

/** El día en Costa Rica (`AAAA-MM-DD`) de un instante. */
export function diaEnCostaRica(iso: string): string {
  return new Date(Date.parse(iso) - 6 * 3_600_000).toISOString().slice(0, 10);
}

// ── El siguiente paso que sugiere Nexus con la reunión (2026-10-19) ──────────────────────────────────────────────

/**
 * Es común que una cuenta tenga su reunión de la semana en el calendario y no tenga el siguiente paso puesto: casi
 * siempre es un problema de seteo (el paso existe, es esa reunión). Para esa cuenta, Nexus sugiere el siguiente paso
 * armado con la reunión (su título, la fecha de la reunión, para el equipo de quien la lleva) y la persona lo usa o lo
 * descarta. Sin IA: lo arma el código.
 *
 * Solo con una reunión del CALENDARIO de quien la lleva que cae DENTRO de la semana de la regla: una reunión planeada en
 * Tareas ya es una tarea (si cae en la semana, la cuenta ya tiene su acción), y una que cae la semana que viene no
 * resolvería la acción de esta semana. Una descartada (por esa persona, para ese evento) no se vuelve a sugerir.
 */
export interface SiguientePasoSugerido {
  /** El evento de Google Calendar del que sale. */
  eventoId: string;
  /** Lo que queda como siguiente paso: el título de la reunión. */
  titulo: string;
  /** `AAAA-MM-DD`: el día de la reunión en Costa Rica (vencimiento y semana de la tarea). */
  fecha: string;
  /** ISO: cuándo es la reunión. */
  inicio: string;
}

/** El tipo con que se guarda el «Descartar» de esta sugerencia (`SugerenciaDescartada.tipo`). */
export const TIPO_DESCARTE_DEL_PASO = "siguiente-paso-de-la-reunion";
/** Cuánto, como mucho, mide el título de la tarea que deja «Usar». */
export const MAX_TITULO_DEL_PASO = 200;

/** La clave de la sugerencia: la cuenta y el evento. Un evento nuevo es otra sugerencia. */
export function claveDelPasoSugerido(clientId: string, eventoId: string): string {
  return `${clientId}:${eventoId}`;
}

/** La clave con que «Usar» crea la tarea: dos clics no crean dos (`Tarea.origenId` es único). */
export function origenDelPasoSugerido(clientId: string, eventoId: string): string {
  return `paso-reunion:${clientId}:${eventoId}`;
}

/**
 * El siguiente paso que Nexus sugiere para una cuenta con reunión y sin acción, o null. `proximas` son todas las reuniones
 * con la cuenta de los próximos 8 días (la primera del calendario dentro de la semana es la que se sugiere).
 */
export function siguientePasoDeLaReunion(
  e: Pick<EstadoDeServicio, "clientId" | "falta" | "reunion">,
  proximas: readonly ReunionDeLaCuenta[],
  hoyISO: string,
  descartadas: ReadonlySet<string> = new Set(),
): SiguientePasoSugerido | null {
  if (!e.falta.includes("accion")) return null;
  const v = ventanaDeLaSemana(hoyISO);
  const r = [...proximas]
    .filter((x) => x.clientId === e.clientId && x.fuente === "calendario" && !!x.eventoId && x.titulo.trim())
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .find((x) => {
      const dia = diaEnCostaRica(x.inicio);
      return dia >= v.desde && dia <= v.hasta;
    });
  if (!r?.eventoId) return null;
  if (descartadas.has(claveDelPasoSugerido(e.clientId, r.eventoId))) return null;
  return { eventoId: r.eventoId, titulo: r.titulo.trim().slice(0, MAX_TITULO_DEL_PASO), fecha: diaEnCostaRica(r.inicio), inicio: r.inicio };
}

/** Lo que dice una fila de «Tus cuentas» sobre la acción y la reunión. */
export function marcasDeServicio(e: EstadoDeServicio, hoyISO: string): { accion: string | null; reunion: string | null } {
  return {
    accion: e.accion ? "✓" : null,
    reunion: e.reunion ? `✓ ${cuandoEsLaReunion(e.reunion.inicio, hoyISO)}` : null,
  };
}

/**
 * El pendiente «Cuenta sin acción» de una cuenta, o null si está al día. Con lo que falta en el título y qué hacer en el
 * botón:
 *   · sin acción ni reunión → «Agendar» (abre Google Calendar con todo lleno: título, invitados y, si se sabe, la primera
 *     hora libre en horario laboral, `hueco`);
 *   · con reunión esta semana y sin acción → «tiene reunión el jue 22, falta el siguiente paso», con el siguiente paso que
 *     sugiere Nexus (`siguientePaso`: la reunión misma) para usar o descartar ahí mismo;
 *   · con reunión la semana que viene y sin acción → «falta la acción de esta semana» (la reunión no la resuelve);
 *   · con acción y sin reunión → «Agendar».
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
    /** El siguiente paso que sugiere Nexus con la reunión (`siguientePasoDeLaReunion`). */
    siguientePaso?: SiguientePasoSugerido | null;
    /** De quién es la reunión que se sugiere (quien la lleva): «Usar» crea la tarea para esa persona. */
    llevaEmail?: string | null;
  },
): Pendiente | null {
  if (e.falta.length === 0) return null;
  const sinAccion = e.falta.includes("accion");
  const sinReunion = e.falta.includes("reunion");
  const ultima = o.ultimaReunion ? `la última reunión fue el ${diaCorto(o.ultimaReunion)}` : "no hay reuniones registradas con la cuenta";
  // Lo que falta va en el título, con la empresa adelante, como lo demás de «Lo que importa hoy»: en la línea gris de
  // arriba no se encontraba (Elías, 2026-10-19). Debajo, por qué y qué hacer. Con reunión y sin acción, el título dice
  // cuándo es la reunión: no es lo mismo que no tener ni acción ni reunión (2026-10-19).
  const v = ventanaDeLaSemana(o.hoyISO);
  const reunionEnLaSemana = !!e.reunion && diaEnCostaRica(e.reunion.inicio) <= v.hasta;
  const paso = sinAccion && !sinReunion ? (o.siguientePaso ?? null) : null;
  const que =
    sinAccion && sinReunion
      ? "sin acción ni reunión"
      : sinAccion && e.reunion
        ? reunionEnLaSemana
          ? `tiene reunión ${elDiaDeLaReunion(e.reunion.inicio, o.hoyISO)}, falta el siguiente paso`
          : `tiene reunión ${elDiaDeLaReunion(e.reunion.inicio, o.hoyISO)}, falta la acción de esta semana`
        : sinAccion
          ? "sin acción esta semana"
          : `sin reunión en ${DIAS_PARA_LA_REUNION} días`;
  const titulo = `${cuenta.empresa}: ${que}`;
  const porque = sinReunion
    ? `Nada agendado en los próximos ${DIAS_PARA_LA_REUNION} días; ${ultima}.`
    : paso
      ? `Nexus sugiere dejar esa reunión como el siguiente paso: «${paso.titulo}», ${elDiaDeLaReunion(paso.inicio, o.hoyISO)}.`
      : reunionEnLaSemana
        ? `Tiene reunión ${elDiaDeLaReunion(e.reunion!.inicio, o.hoyISO)}, pero ninguna tarea con fecha esta semana.`
        : `La reunión es la semana que viene y esta semana no tiene ninguna tarea con fecha.`;
  const queHacer =
    sinAccion && sinReunion
      ? "Agenda la próxima reunión y deja una tarea con fecha esta semana."
      : paso
        ? "Úsalo si el siguiente paso es esa reunión; si no, descártalo y deja otra tarea con fecha esta semana."
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
    accion: sinReunion ? "Agendar" : paso ? "Crear otra acción" : "Crear la acción",
    href,
    desde: o.ultimaReunion,
    ...(paso
      ? {
          siguientePaso: {
            eventoId: paso.eventoId,
            titulo: paso.titulo,
            fecha: paso.fecha,
            cuando: elDiaDeLaReunion(paso.inicio, o.hoyISO),
            llevaEmail: o.llevaEmail ?? null,
          },
        }
      : {}),
  };
}
