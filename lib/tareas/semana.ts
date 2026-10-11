/**
 * lib/tareas/semana.ts — las semanas de Tareas internas, en hora de Costa Rica. CLIENT-SAFE y puro.
 *
 * ⚠ LA REGLA DE LAS FECHAS (docs/tareas-plan.md §2): el contenedor de producción corre en UTC y la PC de
 * desarrollo en hora local, así que acá nunca se usa la zona del proceso.
 *   - `lunesDeFecha` para las columnas `@db.Date` (la semana de una tarea, su `venceEl`): son días de calendario.
 *   - `lunesDe` para la hora de una reunión o de un clic: es un instante.
 *   - `hoyEnCostaRica()` para «atrasada» y «vence».
 * Una semana se nombra por su lunes, `AAAA-MM-DD`. Costa Rica es UTC−6 todo el año (sin horario de verano).
 */
import { lunesDe, lunesDeFecha, sumarSemanas, etiquetaDelLunes } from "@/lib/carga/semana";
import { VENTANA_DE_REVISION } from "./reglas";

export { lunesDe, lunesDeFecha, sumarSemanas, etiquetaDelLunes };

const HORA_CR_MS = 6 * 3_600_000;
const DIA_MS = 86_400_000;

/** La hora de Costa Rica de un instante, como campos (día de la semana: lunes = 0). */
export function horaDeCostaRica(instante: Date | string): { fecha: string; diaDeLaSemana: number; hora: number; minuto: number } {
  const d = new Date(+new Date(instante) - HORA_CR_MS);
  return {
    fecha: d.toISOString().slice(0, 10),
    diaDeLaSemana: (d.getUTCDay() + 6) % 7,
    hora: d.getUTCHours(),
    minuto: d.getUTCMinutes(),
  };
}

/** El día de hoy en Costa Rica, `AAAA-MM-DD` (el mismo cálculo que `hoyEnCostaRica` de la exploración). */
export function hoyEnCostaRica(ahora: Date = new Date()): string {
  return horaDeCostaRica(ahora).fecha;
}

/** El lunes de la semana de hoy en Costa Rica. */
export function lunesDeHoy(ahora: Date = new Date()): string {
  return lunesDe(ahora);
}

/** Suma días a una fecha `AAAA-MM-DD`. */
export function sumarDias(fecha: string, n: number): string {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);
}

/** El viernes de la semana de un lunes. */
export function viernesDe(lunes: string): string {
  return sumarDias(lunes, 4);
}

/** El día de la semana (lunes = 0) de una fecha `AAAA-MM-DD`. */
export function diaDeLaSemanaDe(fecha: string): number {
  return (new Date(`${fecha}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** «semana del 5 oct». */
export function nombreDeLaSemana(lunes: string): string {
  return `semana del ${etiquetaDelLunes(lunes)}`;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «5 al 9 oct» (o «28 sep al 2 oct»). */
export function rangoDeLaSemana(lunes: string): string {
  const a = new Date(`${lunes}T00:00:00Z`);
  const b = new Date(`${viernesDe(lunes)}T00:00:00Z`);
  const ma = MESES[a.getUTCMonth()];
  const mb = MESES[b.getUTCMonth()];
  return ma === mb ? `${a.getUTCDate()} al ${b.getUTCDate()} ${mb}` : `${a.getUTCDate()} ${ma} al ${b.getUTCDate()} ${mb}`;
}

/** «jue 8 oct» para una fecha `AAAA-MM-DD`. */
export function diaCortoConSemana(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  const dias = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
  return `${dias[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

/** «9:30» o «14:05», en hora de Costa Rica. */
export function horaCorta(instante: Date | string): string {
  const h = horaDeCostaRica(instante);
  return `${h.hora}:${String(h.minuto).padStart(2, "0")}`;
}

/** «lun 5 oct · 9:30», en hora de Costa Rica (sin `Intl`: el servidor y el navegador lo escriben igual). */
export function diaYHora(instante: Date | string): string {
  return `${diaCortoConSemana(horaDeCostaRica(instante).fecha)} · ${horaCorta(instante)}`;
}

/** Una columna `@db.Date` (o `AAAA-MM-DD`) como `AAAA-MM-DD`. */
export function comoFecha(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  if (typeof v === "string") return v.slice(0, 10);
  return v.toISOString().slice(0, 10);
}

/** Un `AAAA-MM-DD` como el `Date` que Prisma guarda en una columna `@db.Date` (medianoche UTC). */
export function aDate(fecha: string): Date {
  return new Date(`${fecha}T00:00:00Z`);
}

/* ── La semana de una reunión ─────────────────────────────────────────────────────── */

export type RolDeReunion = "planning" | "cierre" | "ambos";

/**
 * A qué semana van las propuestas de una reunión. De lunes a jueves, esa semana; de viernes a domingo, la
 * siguiente (lo que se acuerda el viernes es para el lunes).
 */
export function semanaDeLaReunion(inicio: Date | string): string {
  const { diaDeLaSemana } = horaDeCostaRica(inicio);
  const lunes = lunesDe(inicio);
  return diaDeLaSemana >= 4 ? sumarSemanas(lunes, 1) : lunes;
}

/** Qué semana revisa una reunión de cierre: de viernes a domingo, esa misma; de lunes a jueves, la anterior. */
export function semanaQueCierra(inicio: Date | string): string {
  const { diaDeLaSemana } = horaDeCostaRica(inicio);
  const lunes = lunesDe(inicio);
  return diaDeLaSemana >= 4 ? lunes : sumarSemanas(lunes, -1);
}

const PALABRAS_DE_CIERRE = /\b(retro\w*|cierre|revisi[oó]n|review|weekly)\b/i;

/** El rol por defecto: con «retro», «cierre», «revisión», «review» o «weekly» en el título, las dos; si no, por el día. Una persona lo confirma. */
export function rolPorDefecto(inicio: Date | string, titulo: string): RolDeReunion {
  if (PALABRAS_DE_CIERRE.test(titulo)) return "ambos";
  return horaDeCostaRica(inicio).diaDeLaSemana >= 4 ? "cierre" : "planning";
}

/* ── La revisión ──────────────────────────────────────────────────────────────────── */

/** ¿Estamos entre el viernes a las 15:00 y el lunes a las 6:00 (hora de CR)? */
export function enVentanaDeRevision(ahora: Date = new Date()): boolean {
  const { diaDeLaSemana, hora } = horaDeCostaRica(ahora);
  if (diaDeLaSemana === 4) return hora >= VENTANA_DE_REVISION.desdeViernesHora;
  if (diaDeLaSemana === 5 || diaDeLaSemana === 6) return true;
  if (diaDeLaSemana === 0) return hora < VENTANA_DE_REVISION.hastaLunesHora;
  return false;
}

/** La semana que se revisa en la ventana: la que termina este viernes (o la que terminó, si es lunes temprano). */
export function semanaEnRevision(ahora: Date = new Date()): string {
  const { diaDeLaSemana } = horaDeCostaRica(ahora);
  const lunes = lunesDe(ahora);
  return diaDeLaSemana === 0 ? sumarSemanas(lunes, -1) : lunes;
}

/**
 * La semana a la que va algo de una persona (`semanaDestino`, docs/tareas-plan.md §2): la primera que esa persona
 * NO revisó, desde la deseada en adelante. Con `conPiso`, lo que sigue nunca cae en el pasado: la deseada nunca es
 * anterior al lunes de hoy («Sigue», «Es esa», mover de semana, «Más adelante»).
 */
export function primeraSemanaSinRevisar(
  deseada: string,
  revisadas: ReadonlySet<string>,
  opciones: { lunesDeHoy: string; conPiso: boolean },
): string {
  let w = lunesDeFecha(deseada);
  if (opciones.conPiso && w < opciones.lunesDeHoy) w = opciones.lunesDeHoy;
  for (let i = 0; i < 520 && revisadas.has(w); i++) w = sumarSemanas(w, 1);
  return w;
}

/**
 * Al ACEPTAR una propuesta: conserva su semana mientras no haya terminado. Si ya terminó, va a la de hoy, salvo que
 * la propuesta salga de una reunión cuya semana la persona todavía no revisó (el piloto retroactivo: la retro todavía
 * puede decir cómo fue).
 */
export function semanaAlAceptar(
  semanaDeLaPropuesta: string | null,
  opciones: { lunesDeHoy: string; revisadas: ReadonlySet<string>; deUnaReunion: boolean },
): string {
  const deseada = semanaDeLaPropuesta ?? opciones.lunesDeHoy;
  const terminada = deseada < opciones.lunesDeHoy;
  const conservar = !terminada || (opciones.deUnaReunion && !opciones.revisadas.has(deseada));
  return primeraSemanaSinRevisar(deseada, opciones.revisadas, { lunesDeHoy: opciones.lunesDeHoy, conPiso: !conservar });
}

/** ¿Atrasada? `venceEl` anterior a hoy y la tarea abierta. */
export function estaAtrasada(venceEl: string | null, abierta: boolean, hoy: string = hoyEnCostaRica()): boolean {
  return abierta && !!venceEl && venceEl < hoy;
}
