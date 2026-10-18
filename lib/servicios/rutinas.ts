/**
 * lib/servicios/rutinas.ts — LAS RUTINAS de un servicio recurrente: cuándo cae cada una y qué toca ahora. PURO.
 *
 * (Iniciativa 4, paso 3.) Al arrancar un servicio, Nexus propone sus rutinas (lib/servicios/catalogo.ts):
 *  · las REUNIONES FIJAS, para guardarlas en Google Calendar por enlace, ya como serie. ⛔ Nexus nunca escribe en el
 *    calendario: la persona guarda el evento y dice «Ya la agendé».
 *  · las TAREAS QUE SE REPITEN para el CSE, que se crean por el escritor único de Tareas, de a una ventana de semanas
 *    (`SEMANAS_DE_TAREAS`). Cada tarea lleva su clave (`servicio:<proyecto>:<rutina>:<lunes>`), así crear las de la
 *    ventana siguiente nunca duplica las que ya están. Tareas no tiene tareas que se repitan solas, y no hace falta:
 *    la guía del Resumen avisa cuando la ventana se está terminando.
 *
 * Lo que la persona hizo con las rutinas vive en `Project.servicioRutinas` (Json), con quién y cuándo.
 * Las fechas son días de Costa Rica (`AAAA-MM-DD`); una semana se nombra por su lunes.
 */
import { lunesDe, lunesDeFecha, sumarSemanas } from "@/lib/carga/semana";
import { enlaceParaAgendarEnCalendar } from "@/lib/mi-dia/calendario";
import type { Cadencia, ReunionFija, ServicioRecurrente, TareaQueSeRepite } from "./catalogo";

/** Cuántas semanas de tareas crea «Crear las tareas»: dos meses. */
export const SEMANAS_DE_TAREAS = 8;
/** Con la ventana de tareas a menos de esto de terminarse, la guía pide crear las siguientes. */
export const SEMANAS_PARA_RENOVAR = 2;

/** Lo que se guarda en `Project.servicioRutinas`. */
export interface EstadoDeLasRutinas {
  version: 1;
  /** Por clave de reunión: cuándo dijo la persona que ya la agendó. */
  reuniones: Record<string, { agendadaAt: string; por: string }>;
  /** Hasta qué lunes (incluido) hay tareas creadas, y quién las creó. null = todavía ninguna. */
  tareas: { hasta: string; por: string; en: string } | null;
}

export const RUTINAS_VACIAS: EstadoDeLasRutinas = { version: 1, reuniones: {}, tareas: null };

/** Lee el Json de la base con tolerancia: lo que no se entiende se ignora, nunca rompe la guía. */
export function leerRutinas(v: unknown): EstadoDeLasRutinas {
  if (!v || typeof v !== "object" || Array.isArray(v)) return RUTINAS_VACIAS;
  const o = v as Record<string, unknown>;
  const reuniones: EstadoDeLasRutinas["reuniones"] = {};
  if (o.reuniones && typeof o.reuniones === "object" && !Array.isArray(o.reuniones)) {
    for (const [k, r] of Object.entries(o.reuniones as Record<string, unknown>)) {
      if (r && typeof r === "object" && typeof (r as { agendadaAt?: unknown }).agendadaAt === "string") {
        reuniones[k] = { agendadaAt: String((r as { agendadaAt: string }).agendadaAt), por: String((r as { por?: unknown }).por ?? "") };
      }
    }
  }
  const t = o.tareas as Record<string, unknown> | null | undefined;
  const tareas =
    t && typeof t === "object" && typeof t.hasta === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.hasta)
      ? { hasta: t.hasta, por: String(t.por ?? ""), en: String(t.en ?? "") }
      : null;
  return { version: 1, reuniones, tareas };
}

/** ¿Cae la rutina en la semana de este lunes? Se cuenta desde el lunes de arranque del servicio. */
export function caeEnLaSemana(cada: Cadencia, lunes: string, arranque: string): boolean {
  const desde = lunesDeFecha(arranque);
  if (lunes < desde) return false;
  const semanas = Math.round((Date.parse(`${lunes}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / (7 * 86_400_000));
  switch (cada) {
    case "semana":
      return true;
    case "quincena":
      return semanas % 2 === 0;
    case "mes":
      // El primer lunes del mes: el día del mes del lunes es 1 a 7.
      return Number(lunes.slice(8, 10)) <= 7;
    case "trimestre":
      // Cada tres meses desde el MES del arranque (no el de su lunes, que puede caer en el mes anterior).
      return Number(lunes.slice(8, 10)) <= 7 && (Number(lunes.slice(5, 7)) - 1) % 3 === (Number(arranque.slice(5, 7)) - 1) % 3;
  }
}

/** Las semanas (lunes) en que cae una tarea dentro de [desde, hasta], las dos incluidas. */
export function semanasDeLaTarea(t: Pick<TareaQueSeRepite, "cada">, desde: string, hasta: string, arranque: string): string[] {
  const fuera: string[] = [];
  for (let l = lunesDeFecha(desde); l <= hasta; l = sumarSemanas(l, 1)) {
    if (caeEnLaSemana(t.cada, l, arranque)) fuera.push(l);
  }
  return fuera;
}

/** La clave de una tarea de rutina: estable por proyecto, rutina y semana. */
export function claveDeLaTarea(projectId: string, rutina: string, lunes: string): string {
  return `servicio:${projectId}:${rutina}:${lunes}`;
}

export interface TareaPorCrear {
  clave: string;
  rutina: string;
  titulo: string;
  lunes: string;
}

/**
 * Las tareas de la ventana que sigue: desde el lunes de hoy (o el siguiente al último creado) hasta `SEMANAS_DE_TAREAS`
 * semanas después. Cada rutina con al menos una: una que cae menos seguido que la ventana (trimestral) va en su próxima
 * semana, aunque quede afuera.
 */
export function tareasDeLaVentana(o: {
  projectId: string;
  servicio: Pick<ServicioRecurrente, "tareas">;
  /** Día en que arrancó el servicio (`AAAA-MM-DD`). */
  arranque: string;
  hoy: string;
  estado: EstadoDeLasRutinas;
}): { desde: string; hasta: string; tareas: TareaPorCrear[] } {
  const lunesHoy = lunesDeFecha(o.hoy);
  const desde = o.estado.tareas && o.estado.tareas.hasta >= lunesHoy ? sumarSemanas(o.estado.tareas.hasta, 1) : lunesHoy;
  const hasta = sumarSemanas(desde, SEMANAS_DE_TAREAS - 1);
  const tareas: TareaPorCrear[] = [];
  for (const t of o.servicio.tareas) {
    let semanas = semanasDeLaTarea(t, desde, hasta, o.arranque);
    if (semanas.length === 0) {
      // Una sola: la próxima semana en que cae, buscada hasta un año adelante.
      for (let l = sumarSemanas(hasta, 1), n = 0; n < 53; l = sumarSemanas(l, 1), n++) {
        if (caeEnLaSemana(t.cada, l, o.arranque)) {
          semanas = [l];
          break;
        }
      }
    }
    for (const lunes of semanas) tareas.push({ clave: claveDeLaTarea(o.projectId, t.clave, lunes), rutina: t.clave, titulo: t.titulo, lunes });
  }
  tareas.sort((a, b) => a.lunes.localeCompare(b.lunes) || a.titulo.localeCompare(b.titulo));
  const ultimo = tareas.reduce((m, t) => (t.lunes > m ? t.lunes : m), hasta);
  return { desde, hasta: ultimo, tareas };
}

const RRULE: Record<Cadencia, string> = {
  semana: "RRULE:FREQ=WEEKLY",
  quincena: "RRULE:FREQ=WEEKLY;INTERVAL=2",
  mes: "RRULE:FREQ=MONTHLY;BYDAY=1TU",
  trimestre: "RRULE:FREQ=MONTHLY;INTERVAL=3;BYDAY=1TU",
};

/**
 * La primera instancia propuesta de una reunión fija: el martes a las 10:00 de Costa Rica de la semana que sigue (el
 * primer martes del mes siguiente si es mensual o trimestral). Martes y no lunes: el lunes es el planning de los equipos.
 * La persona la mueve en Calendar antes de guardarla.
 */
export function primeraInstancia(cada: Cadencia, hoy: string): { inicio: string } {
  let lunes = sumarSemanas(lunesDeFecha(hoy), 1);
  if (cada === "mes" || cada === "trimestre") {
    while (Number(lunes.slice(8, 10)) > 7 || lunes.slice(0, 7) === hoy.slice(0, 7)) lunes = sumarSemanas(lunes, 1);
  }
  const martes = new Date(Date.parse(`${lunes}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  // 10:00 en Costa Rica = 16:00 UTC (UTC−6 todo el año).
  return { inicio: `${martes}T16:00:00.000Z` };
}

/** El enlace de Google Calendar de una reunión fija, ya como serie. Nexus no guarda nada: lo guarda la persona. */
export function enlaceDeLaReunion(o: {
  reunion: ReunionFija;
  servicio: Pick<ServicioRecurrente, "nombre">;
  empresa: string;
  hoy: string;
  invitados: readonly string[];
  correo?: string | null;
}): string {
  const { inicio } = primeraInstancia(o.reunion.cada, o.hoy);
  const fin = new Date(Date.parse(inicio) + o.reunion.duracionMin * 60_000).toISOString();
  const base = enlaceParaAgendarEnCalendar({
    titulo: `${o.empresa} · ${o.reunion.titulo}`,
    detalle: `${o.servicio.nombre}: ${o.reunion.paraQue}\nCon: ${o.reunion.conQuien}.`,
    inicio,
    fin,
    invitados: o.invitados,
    correo: o.correo,
  });
  return `${base}&recur=${encodeURIComponent(RRULE[o.reunion.cada])}`;
}

export type QueTocaAhora =
  | { tipo: "reunion"; clave: string; texto: string }
  | { tipo: "tareas"; texto: string }
  | { tipo: "ciclo"; texto: string }
  | { tipo: "al-dia"; texto: string };

/**
 * Lo primero que toca, en una línea. En orden: lo que falta del ciclo (si avanza por ciclos y Nexus lo sabe), una
 * reunión fija sin agendar, las tareas sin crear, la ventana de tareas por terminarse; si no, al día.
 */
export function queTocaAhora(o: {
  servicio: Pick<ServicioRecurrente, "reuniones" | "tareas">;
  estado: EstadoDeLasRutinas;
  hoy: string;
  /** Lo primero que falta en la etapa del ciclo abierto (lib/servicios/guia.ts › primeroQueFalta). */
  faltaDelCiclo?: string | null;
}): QueTocaAhora {
  if (o.faltaDelCiclo) return { tipo: "ciclo", texto: `En esta etapa del ciclo falta: ${o.faltaDelCiclo.charAt(0).toLowerCase()}${o.faltaDelCiclo.slice(1)}.` };
  const sinAgendar = o.servicio.reuniones.find((r) => !o.estado.reuniones[r.clave]);
  if (sinAgendar) return { tipo: "reunion", clave: sinAgendar.clave, texto: `Agenda «${sinAgendar.titulo}» en tu calendario.` };
  if (o.servicio.tareas.length > 0) {
    if (!o.estado.tareas) return { tipo: "tareas", texto: "Crea las tareas que se repiten: Nexus las deja en tu semana." };
    const limite = sumarSemanas(lunesDeFecha(o.hoy), SEMANAS_PARA_RENOVAR);
    if (o.estado.tareas.hasta <= limite) return { tipo: "tareas", texto: `Las tareas de la rutina llegan hasta la semana del ${o.estado.tareas.hasta}: crea las siguientes.` };
  }
  return { tipo: "al-dia", texto: "Las rutinas están al día." };
}

/** El lunes de un instante, para quien necesite la semana de hoy sin importar Tareas. */
export const lunesDeHoy = (ahora: Date): string => lunesDe(ahora);
