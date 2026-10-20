/**
 * lib/timeline/fecha-de-arranque.ts
 *
 * La regla ÚNICA de «¿esta fecha de calendario es una fecha de proyecto?», y el arranque sugerido de
 * la portada del kickoff. Client-safe (sin Prisma): la usan los calendarios y las rutas.
 *
 * ── POR QUÉ EXISTE (2026-10-20) ─────────────────────────────────────────────────────────────────
 * La portada del kickoff tenía un `<input type="date">` que guardaba en CADA cambio. Escribir «2026»
 * en el año pasa por «0002», «0020», «0202»: cada tecla viajaba al servidor como una fecha válida.
 * En la base quedó el rastro (TimelineChange): Cemaco el 5 oct, Spectrum el 12 oct y Cayalá el 15 oct
 * («sin fecha → 19 oct 2», «→ 19 oct 20», «→ 19 oct 26»). Cayalá estuvo dos días con el arranque en
 * el año 0026, y con eso todas sus tareas salían vencidas.
 * Los «años 1900» que vieron Valentina y Alex son la misma fecha leída con `new Date(26, 9, 19)`: el
 * constructor de Date convierte los años 0–99 en 1900–1999. Por eso `fechaLocalDeYmd` existe.
 */

/** El rango de años de un proyecto. Fuera de acá es un error de tipeo, nunca una fecha real. */
export const ANIO_MINIMO = 2000;
export const ANIO_MAXIMO = 2100;

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `true` si `ymd` es AAAA-MM-DD, existe en el calendario y su año está entre 2000 y 2100. */
export function esFechaDeProyecto(ymd: string): boolean {
  const m = YMD.exec(ymd);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < ANIO_MINIMO || y > ANIO_MAXIMO) return false;
  const f = new Date(Date.UTC(y, mo - 1, d));
  return f.getUTCFullYear() === y && f.getUTCMonth() === mo - 1 && f.getUTCDate() === d;
}

/** Igual que `esFechaDeProyecto`, para un ISO completo (lo que viaja en el PUT del cronograma). */
export function esInstanteDeProyecto(iso: string): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  const y = new Date(t).getUTCFullYear();
  return y >= ANIO_MINIMO && y <= ANIO_MAXIMO;
}

/** El mensaje de rechazo, en un solo lugar (lo dicen la ruta del kickoff y la del cronograma). */
export const MENSAJE_FECHA_FUERA_DE_RANGO = `La fecha tiene que ser de un año entre ${ANIO_MINIMO} y ${ANIO_MAXIMO}.`;

/**
 * AAAA-MM-DD → Date LOCAL (medianoche), sin el salto a 19xx de `new Date(y, m, d)` con años de dos
 * cifras. `undefined` si no es una fecha.
 */
export function fechaLocalDeYmd(ymd: string): Date | undefined {
  const m = YMD.exec(ymd);
  if (!m) return undefined;
  const f = new Date(2000, Number(m[2]) - 1, Number(m[3]));
  f.setFullYear(Number(m[1]));
  return Number.isNaN(f.getTime()) ? undefined : f;
}

/** Date LOCAL → AAAA-MM-DD (el día que la persona eligió en el calendario). */
export function ymdDeFechaLocal(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getFullYear(), 4)}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export type OrigenDelArranqueSugerido = "kickoff" | "hoy";

/**
 * La fecha que la portada PROPONE cuando el cronograma no tiene arranque: la reunión de kickoff del
 * proyecto (la misma que propone el handoff, `getKickoffSessionDate`, ya pasada a día LOCAL por quien
 * llama: una reunión de las 7 p. m. en Costa Rica es el día siguiente en UTC) o, sin ella, hoy.
 *
 * ⛔ Solo se PROPONE: abre el calendario en ese mes y se ofrece con un botón. `anchorStartDate` se
 * escribe con el clic de la persona (docs/KNOWN-ERRORS.md, «La fecha estimada de arranque nunca se
 * escribe en anchorStartDate»: lo leen cobranza y las alertas como dato confirmado).
 */
export function arranqueSugerido(
  kickoffYmd: string | null | undefined,
  hoyYmd: string,
): { ymd: string; origen: OrigenDelArranqueSugerido } {
  const k = kickoffYmd ?? "";
  if (k && esFechaDeProyecto(k)) return { ymd: k, origen: "kickoff" };
  return { ymd: hoyYmd, origen: "hoy" };
}
