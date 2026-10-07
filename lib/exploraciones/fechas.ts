/**
 * lib/exploraciones/fechas.ts — cómo se escriben las fechas de la exploración. PURO.
 *
 * Todo en la hora de Costa Rica, en el navegador y en el servidor (el VPS no corre en esa zona):
 * una llamada de las 8 de la noche es de ese día, no del siguiente. Y una fecha SIN hora
 * (`AAAA-MM-DD`: la del test, la del siguiente paso) es ese día: leída tal cual, el navegador la
 * toma como la medianoche UTC y en Costa Rica la muestra como el día anterior.
 */
export const ZONA_DE_LA_EXPLORACION = "America/Costa_Rica";

/**
 * Los espacios especiales que mete cada motor de fechas (Node pone U+00A0 en «a. m.», Chrome otro)
 * pasan a espacios comunes: sin esto, el texto del servidor y el del navegador no coinciden y React
 * rehace la página (error de hidratación del 2026-10-02 en el panel del agente).
 */
export const conEspaciosComunes = (s: string) => s.replace(/[\u00a0\u202f\u2007\u2009]/g, " ");

/** La fecha, con las de solo día ancladas al mediodía de Costa Rica (UTC−6, sin horario de verano). */
export function aFecha(v: string | number | Date): Date {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T12:00:00-06:00`);
  return new Date(v);
}

/** «26 sept». */
export function diaCorto(v: string | number | Date): string {
  return conEspaciosComunes(aFecha(v).toLocaleDateString("es-CR", { day: "numeric", month: "short", timeZone: ZONA_DE_LA_EXPLORACION }));
}

/** «26 sept 2026». */
export function diaConAnio(v: string | number | Date): string {
  return conEspaciosComunes(aFecha(v).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric", timeZone: ZONA_DE_LA_EXPLORACION }));
}

/** «vie, 2 oct, 09:00 a. m.». */
export function diaYHora(v: string | number | Date): string {
  return conEspaciosComunes(
    aFecha(v).toLocaleString("es-CR", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: ZONA_DE_LA_EXPLORACION,
    }),
  );
}

/** El día de hoy en Costa Rica, `AAAA-MM-DD` (el formato de las fechas sin hora). */
export function hoyEnCostaRica(ahora = new Date()): string {
  return ahora.toLocaleDateString("en-CA", { timeZone: ZONA_DE_LA_EXPLORACION });
}

/** «jue 8 oct»: la próxima reunión en el listado de preventas. */
export function diaConSemana(v: string | number | Date): string {
  return conEspaciosComunes(
    aFecha(v)
      .toLocaleDateString("es-CR", { weekday: "short", day: "numeric", month: "short", timeZone: ZONA_DE_LA_EXPLORACION })
      .replace(/\./g, "")
      .replace(",", ""),
  );
}

/** «hoy», «ayer», «hace 3 días» hasta una semana; después, la fecha («28 sept»). */
export function haceCuanto(v: string | number | Date, ahora = new Date()): string {
  const dia = (d: Date) => Date.parse(`${d.toLocaleDateString("en-CA", { timeZone: ZONA_DE_LA_EXPLORACION })}T12:00:00Z`);
  const dias = Math.round((dia(ahora) - dia(aFecha(v))) / 86_400_000);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias <= 7) return `hace ${dias} días`;
  return diaCorto(v);
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];

/**
 * «3 oct 2026», armado a mano en la hora de Costa Rica (UTC−6, sin horario de verano). Node y Chrome
 * abrevian distinto algunos meses («sept» contra «sep»): para un texto que sale igual en el servidor
 * y en el navegador (la fecha de creación del listado), mejor no pasar por `toLocaleDateString`.
 */
export function diaDeCalendario(v: string | number | Date): string {
  const d = new Date(aFecha(v).getTime() - 6 * 60 * 60 * 1000);
  return `${d.getUTCDate()} ${MESES_CORTOS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
