/**
 * lib/escala/escalera.ts — LA ESCALERA de los cinco niveles, arriba de la página de cada área (Elías, 20 nov, al presentar
 * diagnósticos reales con Ventas). PURO y client-safe: lo dibuja components/external/test/EscaleraDeNiveles.tsx en la
 * escala de una empresa y en el resultado del test público (y en su PDF: SVG estático, sin JS), y lo mueve
 * components/external/test/MovimientoDeLaEscalera.tsx en la pantalla.
 *
 * Es IDÉNTICA a la curva de la página de resultados de la aplicación vieja (dev.smarteamcr.com/diagnostico-rendimiento,
 * `components/curva.js`, `lib/niveles.js` y `css/resultado.css`). Elías, 21 nov, al verla en producción: «se le debe quitar la
 * meta, así como esa línea punteada. Debe ser exactamente igual, incluso los colores y todo». De la vieja viene todo:
 *   · el lienzo (820 × 380), los cinco puntos (crece despacio y después se dispara: una exponencial) y la curva que pasa por
 *     ellos con los mismos controles (`CONTROLES`). La vieja, al mover los puntos, la rehacía con otra cuenta (`curvaSuave`) y
 *     la curva cambiaba de forma; acá los controles viajan con su punto y la forma se queda;
 *   · la línea gris que se vuelve azul en el último tramo y el área azul que se desvanece hacia el piso;
 *   · los colores de cada nivel (`COLOR_DE_LA_ESCALERA`, los de `NIVELES_META`) y cómo se marca un nivel: el ACTIVO, con su
 *     color, un círculo más grande y su nombre en negrita; el resto, en gris;
 *   · qué niveles se marcan: donde está cada una de las dos capas del área (base operativa y producción), y la tarjeta dice
 *     «Aquí está tu Base operativa y tu Producción.» (`resultado.js › wireEscala`).
 * Lo único distinto: si el área no tiene el nivel de sus capas, se marca el del área. La meta ya no se dibuja (estuvo del
 * 20 al 21 nov: el aro punteado, «Meta» y el tramo punteado hasta ella).
 * Las pruebas: escalera.test.ts.
 */
import { LETRAS, type Letra } from "./documento/tipos";

/** El color de cada nivel (la vieja, `lib/niveles.js › NIVELES_META`). */
export const COLOR_DE_LA_ESCALERA: Readonly<Record<Letra, string>> = { D: "#F87171", I: "#FB923C", F: "#FBBF24", E: "#60A5FA", O: "#42E4B3" };
/** El gris de los niveles que no están marcados y del principio de la línea (la vieja, `GRIS`). */
export const GRIS_DE_LA_ESCALERA = "#6B7AA0";
/** El azul al que llega la línea y del área (la vieja, `GRAD_END`). */
export const AZUL_DE_LA_ESCALERA = "#0B58D3";

// ── El dibujo ─────────────────────────────────────────────────────────────────

export interface Punto {
  x: number;
  y: number;
}

/** El lienzo de la vieja (`viewBox="0 0 820 380"`). */
export const LIENZO = { x: 0, y: 0, ancho: 820, alto: 380 } as const;
/** Los cinco puntos de la aplicación vieja, de Deficiente a Óptimo. */
export const PUNTOS_DE_LA_ESCALERA: readonly Punto[] = [
  { x: 80, y: 305 },
  { x: 220, y: 292 },
  { x: 385, y: 252 },
  { x: 550, y: 160 },
  { x: 740, y: 42 },
];
/** Donde termina el área de abajo (se desvanece hasta ahí). */
export const BASE_DEL_AREA = 330;
/** El radio del círculo de cada nivel: el marcado, más grande. */
export const RADIO = { nivel: 26, activo: 32 } as const;
/** Cuánto bajan, desde el centro del círculo, la línea de base del número y la del nombre. */
export const BAJO_EL_PUNTO = { numero: 8, nombre: 60 } as const;
/** La letra de los nombres en el teléfono (resultado.css, `max-width: 600px`; la vieja, 14 en el lienzo, ahí no se lee). */
export const LETRA_DEL_NOMBRE_EN_EL_TELEFONO = 24;
/** La letra de los nombres en el PDF (resultado.css, `.rd-pdf`): la hoja fija el alto y el dibujo se achica. */
export const LETRA_DEL_NOMBRE_EN_EL_PDF = 24;

const f = (n: number) => n.toFixed(1);

/**
 * Los controles de cada pedazo de la curva, relativos a su punto: `sale` del punto `i`, `llega` al punto `i + 1`. Son los
 * del trazo de la vieja (`M 80 305 C 140 304,175 301,220 292 C 290 282,…`), así que quieta es la misma curva.
 */
const CONTROLES: readonly { sale: Punto; llega: Punto }[] = [
  { sale: { x: 60, y: -1 }, llega: { x: -45, y: 9 } },
  { sale: { x: 70, y: -10 }, llega: { x: -65, y: 18 } },
  { sale: { x: 65, y: -17 }, llega: { x: -70, y: 50 } },
  { sale: { x: 55, y: -42 }, llega: { x: -80, y: 26 } },
];

/** La curva que pasa por los puntos, un pedazo por par de puntos seguidos: el pedazo `i` va del punto `i` al `i + 1`. */
export function tramosDeLaCurva(pts: readonly Punto[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const c = CONTROLES[i] ?? { sale: { x: (b.x - a.x) / 3, y: (b.y - a.y) / 3 }, llega: { x: (a.x - b.x) / 3, y: (a.y - b.y) / 3 } };
    out.push(`C ${f(a.x + c.sale.x)} ${f(a.y + c.sale.y)}, ${f(b.x + c.llega.x)} ${f(b.y + c.llega.y)}, ${f(b.x)} ${f(b.y)}`);
  }
  return out;
}

export interface TrazosDeLaEscalera {
  /** La curva entera, como trazo. */
  curva: string;
  /** El área bajo la curva, cerrada contra la base. */
  area: string;
}

/** Los trazos para unos puntos: los de siempre, o los corridos por el imán. */
export function trazosDeLaEscalera(pts: readonly Punto[]): TrazosDeLaEscalera {
  const ini = pts[0];
  const fin = pts[pts.length - 1];
  const curva = `M ${f(ini.x)} ${f(ini.y)} ${tramosDeLaCurva(pts).join(" ")}`;
  return { curva, area: `${curva} L ${f(fin.x)} ${BASE_DEL_AREA} L ${f(ini.x)} ${BASE_DEL_AREA} Z` };
}

/** Un nivel marcado y quién está ahí («tu Base operativa»). */
export interface NivelMarcado {
  letra: Letra;
  quienes: string[];
}

/**
 * Qué niveles se marcan: donde está cada capa del área (la vieja: `activos: [base, producción]`), con «tu {capa}». Si
 * ninguna capa tiene nivel, el del área («{área} hoy»); sin ninguno, nada.
 */
export function nivelesMarcados(
  area: string,
  capas: readonly { nombre: string; nivel: Letra | null }[],
  nivelDelArea: Letra | null,
): NivelMarcado[] {
  const out: NivelMarcado[] = [];
  for (const c of capas) {
    if (!c.nivel) continue;
    const ya = out.find((m) => m.letra === c.nivel);
    if (ya) ya.quienes.push(`tu ${c.nombre}`);
    else out.push({ letra: c.nivel, quienes: [`tu ${c.nombre}`] });
  }
  if (!out.length && nivelDelArea) out.push({ letra: nivelDelArea, quienes: [`${area} hoy`] });
  return out.sort((a, b) => LETRAS.indexOf(a.letra) - LETRAS.indexOf(b.letra));
}

export interface MarcaDeLaEscalera {
  letra: Letra;
  numero: number;
  nombre: string;
  x: number;
  y: number;
  /** El color del nivel (el de la tarjeta, y el del círculo si está marcado). */
  color: string;
  /** Marcado: con su color; si no, en gris. */
  activo: boolean;
  /** Quién está en este nivel (vacío si no está marcado). */
  quienes: string[];
  /** El radio del círculo. */
  r: number;
}

export interface DibujoDeLaEscalera extends TrazosDeLaEscalera {
  marcas: MarcaDeLaEscalera[];
}

/** La geometría de la escalera. Los nombres, los de la escala (`niveles`, en orden). */
export function dibujoDeLaEscalera(niveles: readonly { letra: Letra; nombre: string }[], marcados: readonly NivelMarcado[]): DibujoDeLaEscalera {
  const marcas: MarcaDeLaEscalera[] = LETRAS.map((letra, i) => {
    const p = PUNTOS_DE_LA_ESCALERA[i];
    const quienes = marcados.find((m) => m.letra === letra)?.quienes ?? [];
    const activo = quienes.length > 0;
    return {
      letra,
      numero: i + 1,
      nombre: niveles.find((n) => n.letra === letra)?.nombre ?? letra,
      x: p.x,
      y: p.y,
      color: COLOR_DE_LA_ESCALERA[letra],
      activo,
      quienes,
      r: activo ? RADIO.activo : RADIO.nivel,
    };
  });
  return { ...trazosDeLaEscalera(PUNTOS_DE_LA_ESCALERA), marcas };
}

/** Lo que lee un lector de pantalla: dónde está cada capa. */
export function lecturaDeLaEscalera(area: string, marcas: readonly MarcaDeLaEscalera[]): string {
  const activas = marcas.filter((m) => m.activo);
  if (!activas.length) return `Los cinco niveles de la escala: ${area} todavía está en medición.`;
  return `Los cinco niveles de la escala, de ${marcas[0].nombre} a ${marcas[marcas.length - 1].nombre}: ${activas.map((m) => `${m.quienes.join(" y ")} en ${m.nombre}`).join("; ")}.`;
}

/** Lo que dice la tarjeta de un nivel debajo de su descripción (la vieja: «Aquí está tu Base operativa y tu Producción.»). */
export function marcaDelNivel(quienes: readonly string[]): string | null {
  return quienes.length ? `Aquí está ${quienes.join(" y ")}.` : null;
}
