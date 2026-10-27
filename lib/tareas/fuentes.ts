/**
 * lib/tareas/fuentes.ts — el sprint de cada equipo: la serie de su reunión y quiénes están (ficha A del roadmap,
 * 2026-10-17). CLIENT-SAFE y puro.
 *
 * Quien lidera un sprint (Customer Success, Marketing, Desarrollo…) elige la serie de su reunión de sprint desde su
 * calendario y quiénes están. Desde ahí, cada reunión nueva de esa serie se lee sola cuando termina (lib/tareas/
 * fuentes-server.ts), las notas y la conversación, sin el tope de 5 por persona (2026-10-27, lib/tareas/sprint.ts). Las tablas ya existían
 * (`FuenteDeTareas`, docs/tareas-plan.md §5.4, la fase 1C); acá viven sus reglas.
 */
import { horaDeCostaRica, type RolDeReunion } from "./semana";
import { claveDeEquipo, equiposQueLidera, type MiembroDelEquipo } from "./equipos";

/** La lectura empieza 15 minutos después del fin (las notas de Gemini tardan en llegar). */
export const MINUTOS_DESPUES_DEL_FIN = 15;
/** Una reunión de la serie se lee sola hasta 24 h después de terminar; después, a mano con «Leer una reunión». */
export const HORAS_PARA_LEERLA_SOLA = 24;
/** Un sprint lee como mucho estas series a la vez (el planning y la retro, y alguna más). */
export const MAX_SERIES_POR_SPRINT = 4;
/** Cada cuánto se miran las series (la pantalla lo pide al abrirse; el job, cada tick). */
export const MINUTOS_ENTRE_MIRADAS = 10;

export const NOMBRE_DEL_ROL: Record<RolDeReunion, string> = { planning: "Planning", cierre: "Retro o cierre", ambos: "Planning y cierre" };

const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

/** «Los lunes a las 9:30». `diaSemana` 1 = lunes (como en la columna); `finHora` «10:30». */
export function cuandoEsLaSerie(f: { diaSemana: number | null; finHora: string | null }): string {
  const dia = f.diaSemana && f.diaSemana >= 1 && f.diaSemana <= 7 ? `Los ${DIAS[f.diaSemana - 1]}` : "Cada semana";
  return f.finHora ? `${dia} · termina a las ${f.finHora}` : dia;
}

/** El día (1 = lunes) y la hora de fin, en Costa Rica, de una instancia de la serie. */
export function diaYFinDeLaReunion(inicio: Date, fin: Date): { diaSemana: number; finHora: string } {
  const i = horaDeCostaRica(inicio);
  const f = horaDeCostaRica(fin);
  return { diaSemana: i.diaDeLaSemana + 1, finHora: `${f.hora}:${String(f.minuto).padStart(2, "0")}` };
}

/** El título sin la fecha ni los espacios de más: el respaldo si la serie cambia. */
export function tituloNormalizado(titulo: string): string {
  return titulo
    .replace(/\b\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 160);
}

/**
 * ¿Es la instancia de una reunión recurrente? El evento de una instancia se llama «<serie>_<fecha>» y la sesión lleva
 * ese id con un prefijo («gmeet_<serie>_20261012T153000Z»); una reunión suelta no tiene la fecha detrás («gmeet_<serie>»).
 * Comparar el id con la serie no alcanza: el prefijo los hace distintos siempre.
 */
export function esDeUnaSerie(r: { id: string; serie: string | null }): boolean {
  return !!r.serie && !r.id.endsWith(r.serie);
}

/**
 * ¿Esta reunión de la serie se lee sola ahora? Es de la serie, de puertas adentro (una instancia con alguien de
 * afuera no se lee sola: la del sprint es del equipo), terminó hace 15 minutos o más y hace menos de 24 h, y empezó
 * después de que se configuró el sprint (con un día de margen: quien la configura justo después de la reunión de hoy
 * espera que se lea la de hoy). Lo de antes se lee a mano.
 */
export function seLeeSola(
  r: { serie: string | null; inicio: Date; fin: Date; puertasAdentro: boolean },
  fuente: { serie: string; createdAt: Date; activa: boolean },
  ahora: Date,
): boolean {
  if (!fuente.activa || !r.serie || r.serie !== fuente.serie || !r.puertasAdentro) return false;
  if (+r.inicio < +fuente.createdAt - 86_400_000) return false;
  const desde = +r.fin + MINUTOS_DESPUES_DEL_FIN * 60_000;
  const hasta = +r.fin + HORAS_PARA_LEERLA_SOLA * 3_600_000;
  return +ahora >= desde && +ahora <= hasta;
}

/** Quiénes están en el sprint si nadie lo eligió: los de su área y quienes lo lideran. */
export function personasPorDefecto(equipo: string, miembros: readonly MiembroDelEquipo[]): string[] {
  return miembros.filter((m) => claveDeEquipo(m.area, m.email) === equipo || equiposQueLidera(m).includes(equipo)).map((m) => m.email.toLowerCase());
}

/** Las personas elegidas: solo gente activa del equipo de Smarteam, sin repetir, en minúscula. */
export function personasValidas(elegidas: readonly string[], miembros: readonly MiembroDelEquipo[]): { validas: string[]; desconocidas: string[] } {
  const activos = new Set(miembros.map((m) => m.email.toLowerCase()));
  const unicas = [...new Set(elegidas.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  return { validas: unicas.filter((e) => activos.has(e)), desconocidas: unicas.filter((e) => !activos.has(e)) };
}

/** ¿Puede configurar el sprint? Quien lo lidera (Equipo › «Lidera los sprints de») o dirección. */
export function puedeConfigurarElSprint(q: { esSuperAdmin: boolean; lidera: readonly string[] }, equipo: string): boolean {
  return q.esSuperAdmin || q.lidera.includes(equipo);
}
