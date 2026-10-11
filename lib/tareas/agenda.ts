/**
 * lib/tareas/agenda.ts — los horarios que propone Nexus y el enlace de respaldo a Google Calendar. CLIENT-SAFE y puro.
 *
 * Una tarea, su bloque (decisión de Elías, 8 oct): nunca varias tareas en un bloque. Nexus PROPONE un horario y la
 * dueña de la tarea lo confirma con su clic; el servidor crea el bloque (lib/google/agenda.ts). Si el permiso de
 * escritura falta, la pantalla ofrece el enlace de plantilla de este archivo.
 *
 * Todo en hora de Costa Rica (UTC−6, sin horario de verano), sin depender de la zona del proceso.
 */
import { FRANJA_DE_AGENDA, PASO_DE_AGENDA_MIN } from "./reglas";
import { ORDEN_DE_PRIORIDAD, leerPrioridad } from "./estados";
import { sumarDias } from "./semana";

const HORA_CR_MS = 6 * 3_600_000;
const MIN_MS = 60_000;

/** El instante UTC de una hora de Costa Rica en un día `AAAA-MM-DD`. */
export function instanteCR(fecha: string, hora: number, minuto = 0): Date {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + HORA_CR_MS + (hora * 60 + minuto) * MIN_MS);
}

export interface Intervalo {
  inicio: string; // ISO
  fin: string; // ISO
}

export interface TareaParaAgendar {
  id: string;
  minutos: number;
  prioridad: string;
  /** `AAAA-MM-DD` o null. */
  venceEl: string | null;
  /** Las tareas de la misma tanda que deben ir antes. */
  despuesDe?: readonly string[];
}

export interface HorarioPropuesto {
  tareaId: string;
  inicio: string | null;
  fin: string | null;
  /** Por qué no hay horario: no cabe en la semana o la semana ya pasó. */
  motivo?: "sin_hueco" | "sin_duracion";
}

const seSolapan = (a: { i: number; f: number }, b: { i: number; f: number }) => a.i < b.f && b.i < a.f;

function redondearArriba(ms: number): number {
  const paso = PASO_DE_AGENDA_MIN * MIN_MS;
  return Math.ceil(ms / paso) * paso;
}

/** Orden de la tanda: primero lo que otra espera, después por prioridad (alta primero), después por vencimiento. */
function ordenar(tareas: readonly TareaParaAgendar[]): TareaParaAgendar[] {
  const porId = new Map(tareas.map((t) => [t.id, t]));
  const base = [...tareas].sort(
    (a, b) =>
      ORDEN_DE_PRIORIDAD[leerPrioridad(a.prioridad)] - ORDEN_DE_PRIORIDAD[leerPrioridad(b.prioridad)] ||
      (a.venceEl ?? "9999").localeCompare(b.venceEl ?? "9999"),
  );
  const listo = new Set<string>();
  const salida: TareaParaAgendar[] = [];
  const visitar = (t: TareaParaAgendar, pila: Set<string>) => {
    if (listo.has(t.id) || pila.has(t.id)) return;
    pila.add(t.id);
    for (const d of t.despuesDe ?? []) {
      const dep = porId.get(d);
      if (dep) visitar(dep, pila);
    }
    pila.delete(t.id);
    listo.add(t.id);
    salida.push(t);
  };
  for (const t of base) visitar(t, new Set());
  return salida;
}

/**
 * El primer hueco libre entre las 8:00 y las 17:00 de cada día hábil de la semana, con la duración de cada tarea,
 * antes de su vencimiento si vence esa semana, siempre después de sus dependencias y nunca en una hora que ya pasó.
 */
export function proponerHorarios(
  lunes: string,
  tareas: readonly TareaParaAgendar[],
  ocupado: readonly Intervalo[],
  ahora: Date = new Date(),
): HorarioPropuesto[] {
  const tomados = ocupado.map((o) => ({ i: Date.parse(o.inicio), f: Date.parse(o.fin) })).filter((o) => o.f > o.i);
  const finDe = new Map<string, number>();
  const desde = redondearArriba(+ahora);
  const salida: HorarioPropuesto[] = [];

  for (const t of ordenar(tareas)) {
    if (!t.minutos || t.minutos <= 0) {
      salida.push({ tareaId: t.id, inicio: null, fin: null, motivo: "sin_duracion" });
      continue;
    }
    const largo = t.minutos * MIN_MS;
    const piso = Math.max(desde, ...(t.despuesDe ?? []).map((d) => finDe.get(d) ?? 0));
    let elegido: { i: number; f: number } | null = null;

    for (let dia = 0; dia < 5 && !elegido; dia++) {
      const fecha = sumarDias(lunes, dia);
      if (t.venceEl && fecha > t.venceEl && dia > 0 && t.venceEl >= lunes) break;
      const abre = +instanteCR(fecha, FRANJA_DE_AGENDA.desdeHora);
      const cierra = +instanteCR(fecha, FRANJA_DE_AGENDA.hastaHora);
      let i = redondearArriba(Math.max(abre, piso));
      while (i + largo <= cierra) {
        const candidato = { i, f: i + largo };
        const choque = tomados.find((o) => seSolapan(candidato, o));
        if (!choque) {
          elegido = candidato;
          break;
        }
        i = redondearArriba(choque.f);
      }
    }

    if (!elegido) {
      salida.push({ tareaId: t.id, inicio: null, fin: null, motivo: "sin_hueco" });
      continue;
    }
    tomados.push(elegido);
    finDe.set(t.id, elegido.f);
    salida.push({ tareaId: t.id, inicio: new Date(elegido.i).toISOString(), fin: new Date(elegido.f).toISOString() });
  }
  return salida;
}

/* ── El enlace de respaldo ────────────────────────────────────────────────────────── */

/** «20261008T150000Z». */
function enFormatoDeGoogle(instante: Date | string): string {
  return new Date(instante).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** La marca que reconoce `esBloqueDeTarea` en la descripción de un evento. */
export function marcaDeTarea(tareaId: string): string {
  return `nexustarea ${tareaId}`;
}

/** El título de un bloque: «Tarea · <título>». */
export function tituloDelBloque(titulo: string): string {
  return `Tarea · ${titulo}`.slice(0, 200);
}

/**
 * El enlace de PLANTILLA de Google Calendar: abre el formulario de un evento nuevo ya lleno, en la cuenta de la
 * persona. Es solo el respaldo cuando Nexus no puede crear el bloque: la persona lo guarda en Calendar. Sin `vcon`
 * (no agrega Meet) ni `add` (no invita a nadie).
 */
export function enlaceDePlantilla(opciones: {
  titulo: string;
  inicio: Date | string;
  fin: Date | string;
  tareaId: string;
  urlDeLaTarea: string;
  correo: string;
}): string {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: tituloDelBloque(opciones.titulo),
    dates: `${enFormatoDeGoogle(opciones.inicio)}/${enFormatoDeGoogle(opciones.fin)}`,
    details: `${opciones.urlDeLaTarea}\n\n${marcaDeTarea(opciones.tareaId)}`,
    ctz: "America/Costa_Rica",
    authuser: opciones.correo,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/* ── La geometría de la grilla ────────────────────────────────────────────────────── */

export interface PosicionEnLaGrilla {
  /** 0 = lunes … 4 = viernes. */
  dia: number;
  /** De 0 a 1, desde el inicio de la grilla (las 8:00). */
  arriba: number;
  /** De 0 a 1. */
  alto: number;
}

/**
 * Dónde cae un intervalo en la grilla de la semana (lunes a viernes, de 8:00 a 18:00 en hora de CR). Lo que cae fuera
 * de la semana o de la franja devuelve null; lo que la cruza se recorta.
 */
export function posicionEnLaGrilla(intervalo: Intervalo, lunes: string): PosicionEnLaGrilla | null {
  const i = Date.parse(intervalo.inicio);
  const f = Date.parse(intervalo.fin);
  if (!(f > i)) return null;
  for (let dia = 0; dia < 5; dia++) {
    const fecha = sumarDias(lunes, dia);
    const abre = +instanteCR(fecha, FRANJA_DE_AGENDA.desdeHora);
    const cierra = +instanteCR(fecha, FRANJA_DE_AGENDA.grillaHastaHora);
    if (f <= abre || i >= cierra) continue;
    const a = Math.max(i, abre);
    const b = Math.min(f, cierra);
    const total = cierra - abre;
    return { dia, arriba: (a - abre) / total, alto: (b - a) / total };
  }
  return null;
}
