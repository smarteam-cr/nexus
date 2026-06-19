/**
 * lib/utils/relative-date.ts
 *
 * Diferencia en DÍAS DE CALENDARIO (zona horaria local) entre HOY y `d`.
 *
 * Compara la MEDIANOCHE local de cada fecha — NO períodos de 24h. El bug que evita:
 * con `Math.floor((fecha - ahora) / 24h)`, una reunión "mañana 15:00" que está a
 * <24h se rotulaba "Hoy". Acá: >0 = futuro (mañana=1), <0 = pasado (ayer=-1), 0 = hoy.
 * `Math.round` lo hace robusto a cambios de horario (DST).
 */
export function calendarDaysFromToday(d: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}
