/**
 * lib/tareas/lectura-personal.ts — la lectura PERSONAL: las reuniones internas de una persona le proponen tareas a ella
 * (roadmap H1 y P5, 2026-10-27). CLIENT-SAFE y puro; lo que lee y escribe está en lectura-personal-server.ts.
 *
 * Hasta hoy Nexus leía solo las reuniones con un cliente o un prospecto (la cola de seguimiento) y las series de sprint
 * que configuró quien lidera cada equipo. Las internas sueltas (una reunión de dirección, una revisión con alguien) no
 * las leía nadie. Esto las lee para cada persona del piloto (`TAREAS_LECTURA_PERSONAL`, por ahora solo Elías), con
 * la MISMA lectura de siempre (lib/tareas/lectura.ts) y dos reglas propias:
 *
 *   · Solo para ella. Lo que le toca a otra persona no se le propone a esa persona (el piloto es de una sola): si quien
 *     lee organizó la reunión, le queda una tarea de REVISIÓN («Revisar con Lidia: …»): la tercera puerta de D2, lo
 *     dicho puertas adentro deja una tarea para quien la hace y una de revisión para quien la pidió. Lo que no tiene
 *     dueño («Por asignar») no sale.
 *   · Solo lo de puertas adentro (todos los que estuvieron son de la casa) y que no sea de una serie que ya lee un
 *     sprint: esa la lee el sprint, una sola vez (la fila de la lectura es única por reunión).
 *
 * La fila que la marca es una `FuenteDeTareas` con `equipo = null` (el modelo ya la describía: «fuente personal») y la
 * serie `SERIE_PERSONAL`: así la lectura sabe de quién es, se puede pausar como cualquier fuente, y el sprint no la ve
 * (todas sus consultas piden `equipo` no nulo).
 */
import { MAX_TITULO } from "./reglas";

/** La serie de la fuente personal: no es una serie de Google, es «todas mis reuniones internas». */
export const SERIE_PERSONAL = "personal:reuniones-internas";

/** El título de la fuente personal, como se ve si algún día se muestra. */
export const TITULO_DE_LA_FUENTE_PERSONAL = "Tus reuniones internas";

/** La lectura empieza 15 minutos después del fin (las notas de Gemini tardan) y se hace sola hasta 24 h después. */
export const MINUTOS_DESPUES_DEL_FIN = 15;
export const HORAS_PARA_LEERLA_SOLA = 24;

/** Cuántas reuniones lee una pasada por persona, como mucho (lo demás, la pasada siguiente). */
export const REUNIONES_POR_PASADA = 4;

/** Las personas del piloto: `TAREAS_LECTURA_PERSONAL`, correos separados por coma. Vacío = nadie. */
export function personasDelPiloto(env: Record<string, string | undefined> = process.env): string[] {
  return [
    ...new Set(
      (env.TAREAS_LECTURA_PERSONAL ?? "")
        .split(",")
        .map((x) => x.trim().toLowerCase())
        .filter((x) => /^[^@\s]+@[^@\s]+$/.test(x)),
    ),
  ];
}

/** ¿Es la fuente personal (no la serie de un sprint)? */
export function esFuentePersonal(f: { equipo: string | null; serie: string } | null | undefined): boolean {
  return !!f && f.equipo === null && f.serie === SERIE_PERSONAL;
}

export interface ReunionParaLeerPersonal {
  puertasAdentro: boolean;
  estuvo: boolean;
  serie: string | null;
  inicio: Date;
  fin: Date;
}

/**
 * ¿Esta reunión se lee sola para la persona? De puertas adentro, estuvo, terminó hace 15 minutos o más y hace menos de
 * 24 h, empezó después de que se prendió su lectura (con un día de margen) y no es de una serie que lee un sprint.
 */
export function seLeePersonal(r: ReunionParaLeerPersonal, seriesDeSprint: ReadonlySet<string>, prendidaDesde: Date, ahora: Date): boolean {
  if (!r.puertasAdentro || !r.estuvo) return false;
  if (r.serie && seriesDeSprint.has(r.serie)) return false;
  if (+r.inicio < +prendidaDesde - 86_400_000) return false;
  const desde = +r.fin + MINUTOS_DESPUES_DEL_FIN * 60_000;
  const hasta = +r.fin + HORAS_PARA_LEERLA_SOLA * 3_600_000;
  return +ahora >= desde && +ahora <= hasta;
}

/** Lo que la regla del piloto mira de cada propuesta (`PropuestaDeLectura`, lib/tareas/mutaciones.ts). */
export interface PropuestaDelPiloto {
  lineaId: string;
  titulo: string;
  contexto: string | null;
  responsableEmail: string | null;
  equipo: string;
  semana: string | null;
  pedidaPorEmail: string | null;
  pedidaPorEquipo: string | null;
  porAsignar: boolean;
  sugerido: Record<string, unknown>;
}

export interface Piloto {
  email: string;
  /** El sprint de casa de la persona: ahí van sus tareas de revisión. */
  equipo: string;
  /** Organizó la reunión: lo que se le encargó a otra persona le deja una revisión. */
  organiza: boolean;
}

/** «Revisar con Lidia: Diseñar el banner de SAP», dentro del largo de un título. */
export function tituloDeRevision(nombre: string, titulo: string): string {
  const t = `Revisar con ${nombre}: ${titulo.trim()}`;
  return t.length <= MAX_TITULO ? t : `${t.slice(0, MAX_TITULO - 1).trimEnd()}…`;
}

/**
 * De lo que armó la lectura, lo que le queda a la persona del piloto: lo suyo tal cual; lo de otra persona del equipo,
 * como una revisión para ella si organizó la reunión (si no, nada); lo que no tiene dueño, nada.
 */
export function soloParaElPiloto<T extends PropuestaDelPiloto>(propuestas: readonly T[], piloto: Piloto, nombreDe: (email: string) => string): T[] {
  const yo = piloto.email.toLowerCase();
  const salida: T[] = [];
  for (const p of propuestas) {
    if (p.porAsignar || !p.responsableEmail) continue;
    const duenio = p.responsableEmail.toLowerCase();
    if (duenio === yo) {
      salida.push(p);
      continue;
    }
    if (!piloto.organiza) continue;
    const nombre = nombreDe(duenio);
    salida.push({
      ...p,
      lineaId: `${p.lineaId}:revision`,
      titulo: tituloDeRevision(nombre, p.titulo),
      contexto: [`En la reunión le quedó a ${nombre}; esta es tu revisión de que quede hecho.`, p.contexto].filter(Boolean).join(" "),
      responsableEmail: yo,
      equipo: piloto.equipo,
      pedidaPorEmail: null,
      pedidaPorEquipo: null,
      sugerido: { ...p.sugerido, revisionDe: duenio },
    });
  }
  return salida;
}
