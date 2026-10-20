/**
 * lib/mi-dia/servicio.ts — las reglas de servicio de cada cuenta (ficha D, 2026-10-17; decisión 2 de
 * docs/nexus-sistema-de-trabajo-plan.md y fase 2.1). PURO y client-safe.
 *
 * ── UNA SOLA REGLA: ¿LA CUENTA TIENE SIGUIENTE PASO? (2026-10-19, tarde) ──────────────────────────────────────────
 * Una cuenta tiene siguiente paso si tiene, de cualquier equipo:
 *   · una TAREA abierta (pendiente o en curso, no «Solo para mí») con fecha dentro de la semana. La fecha de una tarea es
 *     la de su reunión, su vencimiento o, si no, su semana (la misma regla de lib/siguiente-paso/desde-tareas.ts); o
 *   · una REUNIÓN con la cuenta en los próximos 8 días (en el calendario de quien la lleva, de UNA sola empresa por
 *     `cuentaDelEvento`, o planeada en Tareas). Una que la persona eligió de su calendario con «Ya la agendé» (2026-10-20)
 *     cuenta hasta 30 días: es una reunión planeada con `origenId` «elegida:…».
 * Una reunión agendada ES el siguiente paso (Elías, 2026-10-19): no se pide además una tarea. Sin ninguna de las dos, la
 * cuenta aparece en «Cuentas sin siguiente paso» de quien la lleva, con «Agendar». Todo lo que pregunta «¿tiene siguiente
 * paso?» (el inicio, la cartera de CS, «Sugerencias» del chat, el correo de la mañana, «Planifica tu semana») usa
 * `siguientePasoDeLaCuenta` / `tieneSiguientePaso`. Reemplaza a la regla de dos mitades del 2026-10-17 («falta la acción»
 * o «falta la reunión») y a la sugerencia del 2026-10-19 de crear la tarea con la reunión, que se retiró.
 *
 * ⚠ «La semana» es la de hoy, de lunes a domingo; desde el sábado se mira la siguiente: el fin de semana ya no se
 * hace nada de la que termina, y lo que importa es que la que viene tenga su acción.
 */
import { DIAS_PARA_LA_REUNION, DIAS_PARA_UNA_REUNION_ELEGIDA } from "./constantes";
import { enlaceParaAgendarEnCalendar } from "./calendario";
import type { Pendiente } from "@/lib/para-ti/tipos";

export { DIAS_PARA_LA_REUNION };

const DIA_MS = 86_400_000;

/** La clave de la fuente «Cuentas sin siguiente paso» en «Para ti» (su peso está en lib/para-ti/importa.ts). Se conserva
 *  el nombre de antes («cuenta sin acción»): es identidad, no texto. */
export const FUENTE_CUENTA_SIN_ACCION = "cuenta-sin-accion";
/** Una reunión con una de tus cuentas en los próximos días hábiles (el primer bloque del inicio de Customer Success). */
export const FUENTE_REUNION_CON_LA_CUENTA = "reunion-con-la-cuenta";
/** Las tareas vencidas de una de tus cuentas (el tercer bloque). */
export const FUENTE_TAREAS_VENCIDAS = "tareas-vencidas-de-la-cuenta";

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
  /** El id del evento en Google Calendar (solo las del calendario): con él, «Preparar» abre el resumen de la reunión. */
  eventoId?: string;
  /** La tarea de la reunión planeada (solo las de Tareas). */
  tareaId?: string;
  /** La eligió la persona de su calendario con «Ya la agendé»: cuenta hasta 30 días, no solo 8. */
  elegida?: boolean;
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
  return (
    reuniones
      .filter((r) => {
        const t = Date.parse(r.inicio);
        // La elegida con «Ya la agendé» cuenta hasta 30 días; las demás, 8.
        const hasta = desde + (r.elegida ? DIAS_PARA_UNA_REUNION_ELEGIDA : DIAS_PARA_LA_REUNION) * DIA_MS;
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
  /** El siguiente paso de la cuenta: la tarea o la reunión, la que va antes. null = no tiene. */
  paso: PasoDeLaCuenta | null;
  /**
   * Lo que no tiene, en orden. Es INFORMATIVO (las marcas de la cartera): lo que se le pide a la cuenta lo decide `paso`.
   * Vacío = tiene las dos.
   */
  falta: FaltaDeServicio[];
}

/** El siguiente paso de una cuenta: una tarea con fecha esta semana o una reunión en los próximos 8 días. */
export type PasoDeLaCuenta =
  | { tipo: "reunion"; /** `AAAA-MM-DD`, en Costa Rica. */ dia: string; reunion: ReunionDeLaCuenta }
  | { tipo: "accion"; dia: string; accion: TareaDeLaCuenta };

/**
 * LA REGLA: el siguiente paso de una cuenta es su tarea con fecha de la semana o su reunión de los próximos 8 días, la
 * que va antes; si caen el mismo día, la reunión. null = la cuenta no tiene siguiente paso.
 */
export function siguientePasoDeLaCuenta(accion: TareaDeLaCuenta | null, reunion: ReunionDeLaCuenta | null): PasoDeLaCuenta | null {
  const diaAccion = accion ? fechaDeLaTarea(accion) : null;
  const diaReunion = reunion ? diaEnCostaRica(reunion.inicio) : null;
  if (reunion && diaReunion && (!accion || !diaAccion || diaReunion <= diaAccion)) return { tipo: "reunion", dia: diaReunion, reunion };
  if (accion && diaAccion) return { tipo: "accion", dia: diaAccion, accion };
  return null;
}

/** ¿La cuenta tiene siguiente paso? (`siguientePasoDeLaCuenta`). */
export function tieneSiguientePaso(e: { paso: PasoDeLaCuenta | null }): boolean {
  return e.paso !== null;
}

/** «Siguiente paso: reunión el jue 22» / «Siguiente paso: T-12 · Enviar la propuesta, mañana». */
export function textoDelSiguientePaso(paso: PasoDeLaCuenta, hoyISO: string): string {
  if (paso.tipo === "reunion") return `Siguiente paso: reunión ${elDiaDeLaReunion(paso.reunion.inicio, hoyISO)}`;
  return `Siguiente paso: T-${paso.accion.numero} · ${paso.accion.titulo}, ${elDia(paso.dia, hoyISO)}`;
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
  return { clientId, accion, reunion, paso: siguientePasoDeLaCuenta(accion, reunion), falta };
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
  return elDia(diaEnCostaRica(iso), hoyISO);
}

/** «hoy», «mañana» o «el jue 22» de un día `AAAA-MM-DD`, mirado desde hoy. */
export function elDia(dia: string, hoyISO: string): string {
  if (dia === hoyISO) return "hoy";
  if (dia === sumarDias(hoyISO, 1)) return "mañana";
  const d = new Date(`${dia}T00:00:00Z`);
  return `el ${DIAS[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()}`;
}

/** El día en Costa Rica (`AAAA-MM-DD`) de un instante. */
export function diaEnCostaRica(iso: string): string {
  return new Date(Date.parse(iso) - 6 * 3_600_000).toISOString().slice(0, 10);
}


const HORA_CR = (iso: string) => new Date(Date.parse(iso) - 6 * 3_600_000).toISOString().slice(11, 16).replace(/^0/, "");

/** Lo que dice una fila de «Tus cuentas» sobre la acción y la reunión. */
export function marcasDeServicio(e: EstadoDeServicio, hoyISO: string): { accion: string | null; reunion: string | null } {
  return {
    accion: e.accion ? "✓" : null,
    reunion: e.reunion ? `✓ ${cuandoEsLaReunion(e.reunion.inicio, hoyISO)}` : null,
  };
}

// ── «Cuentas sin siguiente paso» ────────────────────────────────────────────────────────────────────────────────

/** El grupo de una cuenta que no lleva nadie (lo que ve quien lidera Customer Success). */
export const SIN_CSE = "Sin CSE";

/**
 * El pendiente «Cuentas sin siguiente paso» de una cuenta, o null si tiene siguiente paso (`siguientePasoDeLaCuenta`).
 * «Agendar» abre Google Calendar con todo lleno: título, invitados y, si se sabe, la primera hora libre en horario laboral
 * (`hueco`). Una cuenta con reunión agendada NUNCA sale acá: esa reunión es su siguiente paso.
 */
export function pendienteDeCuentaSinPaso(
  cuenta: { clientId: string; empresa: string },
  e: Pick<EstadoDeServicio, "paso">,
  o: {
    ultimaReunion: string | null;
    invitados?: readonly string[];
    hoyISO: string;
    correo?: string | null;
    /** La primera hora libre en horario laboral de quien la lleva (lib/mi-dia/inicio.ts › primerHuecoLaboral). */
    hueco?: { inicio: string; fin: string } | null;
    /** false = el calendario de quien la lleva no se pudo leer: puede tener una reunión que Nexus no ve. */
    calendarioLeido?: boolean;
    /** El CSE que la lleva (lo ve quien lidera Customer Success, agrupado por CSE). */
    grupo?: string | null;
  },
): Pendiente | null {
  if (tieneSiguientePaso(e)) return null;
  const ultima = o.ultimaReunion ? `la última reunión fue el ${diaCorto(o.ultimaReunion)}` : "no hay reuniones registradas con la cuenta";
  const calendario = o.calendarioLeido === false ? " No se pudo leer el calendario: si ya tiene una reunión agendada, ignora esto." : "";
  return {
    clave: `${FUENTE_CUENTA_SIN_ACCION}:${cuenta.clientId}`,
    fuente: FUENTE_CUENTA_SIN_ACCION,
    cuando: "hoy",
    delAgente: false,
    clientId: cuenta.clientId,
    titulo: `${cuenta.empresa}: sin siguiente paso`,
    detalle: `Ni una tarea con fecha esta semana ni una reunión en los próximos ${DIAS_PARA_LA_REUNION} días; ${ultima}. Agenda la próxima reunión: esa reunión es el siguiente paso.${calendario}`,
    meta: `${cuenta.empresa} · Sin siguiente paso`,
    accion: "Agendar",
    href: enlaceParaAgendarEnCalendar({
      titulo: `Reunión con ${cuenta.empresa}`,
      detalle: `Seguimiento de la cuenta ${cuenta.empresa}.`,
      inicio: o.hueco?.inicio ?? null,
      fin: o.hueco?.fin ?? null,
      invitados: o.invitados ?? [],
      correo: o.correo ?? null,
    }),
    desde: o.ultimaReunion,
    ...(o.grupo !== undefined ? { grupo: o.grupo ?? SIN_CSE } : {}),
  };
}

// ── Las reuniones con tus cuentas de los próximos días ─────────────────────────────────────────────────────────

/** Cuántos días hábiles, contando hoy, mira el primer bloque del inicio de Customer Success. */
export const DIAS_HABILES_DE_REUNIONES = 3;

/** Hoy y los días hábiles que siguen (`DIAS_HABILES_DE_REUNIONES` en total; un fin de semana empieza el lunes). */
export function diasDeLasReuniones(hoyISO: string, n = DIAS_HABILES_DE_REUNIONES): string[] {
  const out: string[] = [];
  for (let d = hoyISO; out.length < n; d = sumarDias(d, 1)) if (diaDeLaSemana(d) < 5) out.push(d);
  return out;
}

/** Las reuniones que van al primer bloque: las que no empezaron todavía, de hoy y los días hábiles que siguen, en orden. */
export function reunionesDeLosProximosDias(reuniones: readonly ReunionDeLaCuenta[], hoyISO: string, ahora: Date): ReunionDeLaCuenta[] {
  const dias = new Set(diasDeLasReuniones(hoyISO));
  return reuniones
    .filter((r) => {
      const t = Date.parse(r.inicio);
      return Number.isFinite(t) && t >= ahora.getTime() && dias.has(diaEnCostaRica(r.inicio));
    })
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/**
 * El panel de una reunión en la agenda de «Para ti» (2026-10-20): «Preparar» lo abre ahí, con la guía y los pendientes,
 * y no en una página aparte. `dia` lleva la agenda al día de la reunión; `reunion` abre su panel.
 */
export function enlaceAlPanelDeLaReunion(eventoId: string, inicioISO: string | null): string {
  const q = new URLSearchParams();
  if (inicioISO) q.set("dia", diaEnCostaRica(inicioISO));
  q.set("reunion", eventoId);
  return `/para-ti?${q.toString()}`;
}

/** La reunión que pide abrir un enlace de `enlaceAlPanelDeLaReunion`, o null si el enlace es otro. */
export function reunionDelEnlace(href: string): { eventoId: string; dia: string | null } | null {
  if (!href.startsWith("/para-ti?")) return null;
  const q = new URLSearchParams(href.slice("/para-ti?".length));
  const eventoId = q.get("reunion");
  return eventoId ? { eventoId, dia: q.get("dia") } : null;
}

/** Una reunión con una cuenta, como pendiente del primer bloque: «Preparar» abre su panel en la agenda. */
export function pendienteDeReunion(cuenta: { clientId: string; empresa: string }, r: ReunionDeLaCuenta, hoyISO: string, grupo?: string | null): Pendiente {
  const cuando = cuandoEsLaReunion(r.inicio, hoyISO);
  const href = r.eventoId
    ? enlaceAlPanelDeLaReunion(r.eventoId, r.inicio)
    : r.tareaId
      ? `/tareas?t=${encodeURIComponent(r.tareaId)}`
      : `/clients/${encodeURIComponent(cuenta.clientId)}`;
  return {
    clave: `${FUENTE_REUNION_CON_LA_CUENTA}:${cuenta.clientId}:${r.eventoId ?? r.tareaId ?? r.inicio}`,
    fuente: FUENTE_REUNION_CON_LA_CUENTA,
    cuando: "hoy",
    delAgente: false,
    clientId: cuenta.clientId,
    titulo: `${cuenta.empresa}: ${r.titulo.trim() || "reunión"}`,
    detalle: `${cuando.charAt(0).toUpperCase()}${cuando.slice(1)}, ${HORA_CR(r.inicio)}${r.fuente === "tarea" ? " · planeada en Tareas" : ""}`,
    meta: `${cuenta.empresa} · Reunión`,
    accion: r.eventoId ? "Preparar" : "Abrir",
    href,
    desde: r.inicio,
    ...(grupo !== undefined ? { grupo: grupo ?? SIN_CSE } : {}),
  };
}

// ── Las tareas vencidas de tus cuentas ────────────────────────────────────────────────────────────────────────

/** Una tarea abierta de la cuenta, con lo que hace falta para saber si venció. Fechas `AAAA-MM-DD`. */
export interface TareaParaVencer {
  id: string;
  numero: number;
  titulo: string;
  estado: string;
  privada: boolean;
  clase: string;
  venceEl: string | null;
  /** El lunes de su semana. */
  semana: string | null;
}

/**
 * ¿Venció? Abierta (pendiente o en curso), no «Solo para mí», no una reunión planeada, y con su vencimiento antes de
 * hoy; sin vencimiento, con su semana antes de la de hoy.
 */
export function estaVencida(t: TareaParaVencer, hoyISO: string): boolean {
  if (!ABIERTAS.has(t.estado) || t.privada || t.clase === "reunion") return false;
  if (t.venceEl) return t.venceEl < hoyISO;
  if (t.semana) return t.semana < sumarDias(hoyISO, -diaDeLaSemana(hoyISO));
  return false;
}

/** Cuántas tareas vencidas se nombran en el detalle. */
const TAREAS_EN_EL_DETALLE = 3;

/** Las tareas vencidas de una cuenta, en una línea (las más viejas primero). null = no tiene. */
export function pendienteDeTareasVencidas(
  cuenta: { clientId: string; empresa: string },
  tareas: readonly TareaParaVencer[],
  hoyISO: string,
  grupo?: string | null,
): Pendiente | null {
  const vencidas = tareas
    .filter((t) => estaVencida(t, hoyISO))
    .sort((a, b) => (a.venceEl ?? a.semana ?? "").localeCompare(b.venceEl ?? b.semana ?? "") || a.numero - b.numero);
  if (vencidas.length === 0) return null;
  const n = vencidas.length;
  const fecha = (t: TareaParaVencer) => (t.venceEl ? `venció el ${diaCorto(`${t.venceEl}T18:00:00Z`)}` : "de una semana pasada");
  return {
    clave: `${FUENTE_TAREAS_VENCIDAS}:${cuenta.clientId}`,
    fuente: FUENTE_TAREAS_VENCIDAS,
    cuando: "hoy",
    delAgente: false,
    clientId: cuenta.clientId,
    titulo: `${cuenta.empresa}: ${n === 1 ? "1 tarea vencida" : `${n} tareas vencidas`}`,
    detalle: `${vencidas
      .slice(0, TAREAS_EN_EL_DETALLE)
      .map((t) => `T-${t.numero} · ${t.titulo} (${fecha(t)})`)
      .join(" · ")}${n > TAREAS_EN_EL_DETALLE ? ` · y ${n - TAREAS_EN_EL_DETALLE} más` : ""}. Ciérralas si ya están, o dales una fecha nueva.`,
    meta: `${cuenta.empresa} · Tareas`,
    accion: "Ver las tareas",
    href: `/clients/${encodeURIComponent(cuenta.clientId)}?tab=__tareas__`,
    enlaces: vencidas.slice(0, 5).map((t) => ({ texto: `T-${t.numero}`, href: `/tareas?t=${encodeURIComponent(t.id)}` })),
    desde: vencidas[0].venceEl ?? vencidas[0].semana,
    ...(grupo !== undefined ? { grupo: grupo ?? SIN_CSE } : {}),
  };
}
