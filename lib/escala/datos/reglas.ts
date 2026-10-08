/**
 * lib/escala/datos/reglas.ts — los valores fijos de la escala como datos. PURO.
 *
 * Van como TEXT en la base (no enum, INV4): los fija este archivo y los valida quien escribe.
 */

/** `borrador`: la que se está editando (una sola a la vez). `publicada`: congelada, no cambia nunca. */
export const ESTADOS_DE_LA_VERSION = ["borrador", "publicada"] as const;
export type EstadoDeLaVersion = (typeof ESTADOS_DE_LA_VERSION)[number];

/** A qué está anclado un cambio de la bitácora. */
export const TIPOS_DE_ANCLA = ["encabezado", "texto", "area", "dimension", "nivel", "criterio", "edicion"] as const;
export type TipoDeAncla = (typeof TIPOS_DE_ANCLA)[number];

export const ACCIONES_DEL_CAMBIO = ["agregado", "cambiado", "quitado"] as const;
export type AccionDelCambio = (typeof ACCIONES_DEL_CAMBIO)[number];

/** Por dónde entró el cambio: un `.md` importado en bloque, o el editor de la pantalla. */
export const ORIGENES_DEL_CAMBIO = ["importacion", "editor"] as const;
export type OrigenDelCambio = (typeof ORIGENES_DEL_CAMBIO)[number];

/** Quién edita y publica la escala en Nexus: los super admin (Elías, 2026-10-08). */
export function puedeEditarLaEscala(role: string | null | undefined): boolean {
  return role === "SUPER_ADMIN";
}

/** Cómo se dice cada cosa de la bitácora en la pantalla. */
export const ETIQUETA_DEL_ANCLA: Record<TipoDeAncla, string> = {
  encabezado: "Encabezado",
  texto: "Texto",
  area: "Área",
  dimension: "Dimensión",
  nivel: "Nivel",
  criterio: "Criterio",
  edicion: "Edición",
};

export const ETIQUETA_DEL_CAMPO: Record<string, string> = {
  valor: "valor",
  texto: "texto",
  nombre: "nombre",
  descripcion: "descripción",
  capa: "capa",
  pregunta: "pregunta",
  costoDeQuedarse: "costo de quedarse",
  frase: "frase del nivel",
  resultado: "resultado",
  orden: "orden",
  verificacion: "cómo se verifica",
  riesgo: "riesgo",
  habito: "hábito",
  perfil: "perfil",
  requiere: "lo que requiere",
  tipo: "tipo",
  perfilHabitual: "perfil habitual",
  criteriosPropios: "criterios propios",
  palabras: "palabras de la edición",
  panoramica: "vistazo del área",
  noAplican: "no aplican",
  seLeenIgual: "se leen igual",
};

/** La versión que sigue a la publicada: sube el número del medio («8.7.0» → «8.8.0»). */
export function versionSiguiente(version: string | null): string {
  const m = version ? /^(\d+)\.(\d+)\.\d+$/.exec(version) : null;
  return m ? `${m[1]}.${Number(m[2]) + 1}.0` : "1.0.0";
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * «8 oct, 16:02», en hora de Costa Rica (UTC−6, sin horario de verano). A mano y no con
 * `toLocaleString`: el servidor (otra zona horaria en el VPS, otro ICU) y el navegador tienen que
 * escribir exactamente lo mismo, o React no puede hidratar la pantalla.
 */
export function fechaYHora(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 6 * 60 * 60 * 1000);
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}, ${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}`;
}

/** «8.8.0»: tres números. */
export const FORMA_DE_VERSION = /^\d+\.\d+\.\d+$/;

/** 7.0.10 > 7.0.9: por números, no por texto. */
export function compararVersiones(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
