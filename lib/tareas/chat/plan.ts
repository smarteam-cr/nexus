/**
 * lib/tareas/chat/plan.ts — las fechas de un plan, en días hábiles (docs/tareas-plan.md §6.6). PURO y CLIENT-SAFE.
 *
 * El chat dice «día hábil 6» y el CÓDIGO lo vuelve fecha: lunes a viernes, sin feriados (no hay calendario de
 * feriados en Nexus; la persona corrige la fecha en el borrador). La IA nunca escribe la fecha de una tarea del plan.
 */
import { diaDeLaSemanaDe, sumarDias } from "../semana";

/** El primer día hábil desde `fecha` (la misma si es de lunes a viernes). */
export function primerDiaHabil(fecha: string): string {
  let f = fecha;
  for (let i = 0; i < 3 && diaDeLaSemanaDe(f) > 4; i++) f = sumarDias(f, 1);
  return f;
}

/** El día hábil `dia` contado desde `inicia` (1 = el primer día hábil desde el inicio). */
export function fechaDelDiaHabil(inicia: string, dia: number): string {
  let f = primerDiaHabil(inicia);
  for (let n = 1; n < Math.max(1, Math.floor(dia)); ) {
    f = sumarDias(f, 1);
    if (diaDeLaSemanaDe(f) <= 4) n++;
  }
  return f;
}

/** Cuántos días hábiles hay de `desde` a `hasta`, los dos inclusive (para decir «unos 22 días hábiles»). */
export function diasHabilesEntre(desde: string, hasta: string): number {
  if (hasta < desde) return 0;
  let n = 0;
  for (let f = desde; f <= hasta && n < 2_000; f = sumarDias(f, 1)) if (diaDeLaSemanaDe(f) <= 4) n++;
  return n;
}
