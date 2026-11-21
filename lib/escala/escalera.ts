/**
 * lib/escala/escalera.ts — LA ESCALERA de los cinco niveles, arriba de la página de cada área (Elías, 20 nov, al presentar
 * diagnósticos reales con Ventas). PURO y client-safe: lo dibuja components/external/test/EscaleraDeNiveles.tsx en la
 * escala de una empresa y en el resultado del test público (y en su PDF: SVG estático, sin JS), y lo mueve
 * components/external/test/MovimientoDeLaEscalera.tsx en la pantalla.
 *
 * Es la curva de la aplicación vieja (dev.smarteamcr.com/diagnostico-rendimiento, `components/curva.js` y `anim.js`), traída
 * el 21 nov porque la primera versión de Nexus (una S con el área sombreada por columnas) «estaba súper mal»: los rótulos
 * chocaban con el área, el degradado se veía en bloques y sobraba espacio arriba. De la vieja vienen:
 *   · los cinco puntos (crece despacio y después se dispara: una exponencial) y la curva que pasa por ellos, con los
 *     mismos controles (`CONTROLES`). La vieja, al mover los puntos, la rehacía con otra cuenta (`curvaSuave`) y la
 *     curva cambiaba de forma; acá los controles viajan con su punto y la forma se queda;
 *   · el área de abajo que se desvanece hacia el piso, sin bordes que corten los nombres.
 * De Nexus se quedan los colores por nivel y las dos marcas:
 *   · dónde está el área HOY (su nivel general, del cálculo);
 *   · A DÓNDE LA LLEVAMOS (`metaDeLaEscalera`): Funcional casi siempre; si ya está en Funcional o más arriba, el nivel
 *     siguiente. Quien presenta lo puede cambiar (un texto de la página, `CLAVES.delArea(area, "meta")`): vale solo si está
 *     por encima de hoy; si los niveles suben y lo deja igual o abajo, vuelve la de siempre.
 * El alto del lienzo se ajusta a lo que hay que dibujar (`caja`): con la meta en Óptimo, su etiqueta sube por encima del
 * último punto; sin ella, no queda una franja vacía arriba.
 * Las pruebas: escalera.test.ts.
 */
import { LETRAS, type Letra } from "./documento/tipos";

const FUNCIONAL: Letra = "F";
const idx = (l: Letra) => LETRAS.indexOf(l);
const esLetra = (v: unknown): v is Letra => typeof v === "string" && (LETRAS as readonly string[]).includes(v);

/** La meta de siempre: Funcional; desde Funcional, el nivel siguiente; en Óptimo no hay a dónde subir. */
export function metaPorDefecto(nivel: Letra | null): Letra | null {
  if (!nivel) return null;
  if (idx(nivel) < idx(FUNCIONAL)) return FUNCIONAL;
  return LETRAS[idx(nivel) + 1] ?? null;
}

/**
 * A dónde lo llevamos: la que eligió quien presenta (`elegida`, el texto guardado: una letra), si está por encima de hoy;
 * si no, la de siempre. Sin nivel («En medición») no hay meta: no se sabe desde dónde.
 */
export function metaDeLaEscalera(nivel: Letra | null, elegida?: string | null): Letra | null {
  if (!nivel) return null;
  const e = elegida?.trim().toUpperCase();
  if (esLetra(e) && idx(e) > idx(nivel)) return e;
  return metaPorDefecto(nivel);
}

/** Los niveles a los que se puede llevar un área (para elegir la meta): los de arriba de hoy. */
export function metasPosibles(nivel: Letra | null): Letra[] {
  return nivel ? LETRAS.filter((l) => idx(l) > idx(nivel)) : [];
}

/** El color de cada nivel en la escalera, de rojo a verde (la paleta de la aplicación vieja, un poco más oscura para leerse en blanco). */
export const COLOR_DE_LA_ESCALERA: Readonly<Record<Letra, string>> = { D: "#dc4a3d", I: "#ea7a2a", F: "#d99a06", E: "#3b82f6", O: "#17a884" };

// ── El dibujo ─────────────────────────────────────────────────────────────────

export interface Punto {
  x: number;
  y: number;
}

/** El ancho del lienzo (el alto depende de lo que se marca: `caja`), desde `IZQUIERDA_DEL_LIENZO`. */
export const ANCHO_DE_LA_ESCALERA = 836;
/** Un poco a la izquierda del cero: «Deficiente», centrado en el primer punto, no se corta con la letra del teléfono. */
export const IZQUIERDA_DEL_LIENZO = -8;
/** La letra de los nombres en el teléfono (resultado.css, `max-width: 600px`): con más, «Deficiente» pisa «Inicial». */
export const LETRA_DEL_NOMBRE_EN_EL_TELEFONO = 26;
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

/** El radio de cada círculo, y el del aro punteado de la meta (por fuera del suyo). */
export const RADIO = { nivel: 24, hoy: 30, meta: 28, aroDeLaMeta: 8 } as const;
/** La etiqueta «Hoy»/«Meta», arriba del círculo: su tamaño y lo que la separa del círculo (o del aro). */
export const ETIQUETA = { ancho: 92, alto: 32, separacion: 12 } as const;
/** El nombre del nivel, debajo del círculo: cuánto baja su línea de base desde el borde del círculo. */
export const NOMBRE_BAJO_EL_CIRCULO = 34;
/** Lo que se deja libre alrededor: el imán corre los puntos hasta 10 y el círculo bajo el cursor crece. */
const MARGEN = 18;
/** Sin movimiento (el PDF): casi nada, así el dibujo, de alto fijo en la hoja, sale más grande. */
const MARGEN_QUIETA = 4;
/** La letra de los nombres en el PDF (resultado.css, `.rd-pdf`): la hoja fija el alto y el dibujo se achica. */
export const LETRA_DEL_NOMBRE_EN_EL_PDF = 26;

const fmt = (n: number) => Number(n.toFixed(1));
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
  /** El tramo de la curva entre hoy y la meta (null sin meta): lo que vamos a recorrer. */
  tramo: string | null;
}

/**
 * Los trazos para unos puntos (los de siempre, o los corridos por el imán) y las posiciones de hoy y de la meta (0 a 4).
 * El tramo es exactamente la misma curva entre los dos: los mismos pedazos, no otra cuenta.
 */
export function trazosDeLaEscalera(pts: readonly Punto[], iHoy: number | null, iMeta: number | null): TrazosDeLaEscalera {
  const tramos = tramosDeLaCurva(pts);
  const ini = pts[0];
  const fin = pts[pts.length - 1];
  const curva = `M ${f(ini.x)} ${f(ini.y)} ${tramos.join(" ")}`;
  const conTramo = iHoy !== null && iMeta !== null && iMeta > iHoy && iMeta < pts.length;
  return {
    curva,
    area: `${curva} L ${f(fin.x)} ${BASE_DEL_AREA} L ${f(ini.x)} ${BASE_DEL_AREA} Z`,
    tramo: conTramo ? `M ${f(pts[iHoy].x)} ${f(pts[iHoy].y)} ${tramos.slice(iHoy, iMeta).join(" ")}` : null,
  };
}

export interface MarcaDeLaEscalera {
  letra: Letra;
  numero: number;
  nombre: string;
  x: number;
  y: number;
  color: string;
  /** El nivel de hoy, la meta, o ninguno. */
  es: "hoy" | "meta" | null;
  /** El radio del círculo. */
  r: number;
  /** La etiqueta «Hoy»/«Meta» (null en los demás): su esquina de arriba a la izquierda. */
  etiqueta: Punto | null;
  /** La línea de base del nombre del nivel. */
  yNombre: number;
}

export interface DibujoDeLaEscalera extends TrazosDeLaEscalera {
  marcas: MarcaDeLaEscalera[];
  /** El lienzo (viewBox): arranca arriba de lo más alto que se dibuja y termina debajo del nombre más bajo. */
  caja: { x: number; y: number; ancho: number; alto: number };
  /** Las paradas del degradado de la curva: el color de cada nivel justo en su punto (en 0 a 1 del primero al último). */
  paradas: { offset: number; color: string }[];
}

/** La geometría de la escalera para un nivel de hoy y una meta. Los nombres, los de la escala (`niveles`, en orden). */
export function dibujoDeLaEscalera(
  niveles: readonly { letra: Letra; nombre: string }[],
  hoy: Letra | null,
  meta: Letra | null,
  { quieta = false }: { quieta?: boolean } = {},
): DibujoDeLaEscalera {
  const margen = quieta ? MARGEN_QUIETA : MARGEN;
  const pts = PUNTOS_DE_LA_ESCALERA;
  const metaValida = !!hoy && !!meta && idx(meta) > idx(hoy) ? meta : null;
  const marcas: MarcaDeLaEscalera[] = LETRAS.map((letra, i) => {
    const p = pts[i];
    const es = letra === hoy ? "hoy" : letra === metaValida ? "meta" : null;
    const r = es === "hoy" ? RADIO.hoy : es === "meta" ? RADIO.meta : RADIO.nivel;
    const exterior = r + (es === "meta" ? RADIO.aroDeLaMeta : 0);
    return {
      letra,
      numero: i + 1,
      nombre: niveles.find((n) => n.letra === letra)?.nombre ?? letra,
      x: p.x,
      y: p.y,
      color: COLOR_DE_LA_ESCALERA[letra],
      es,
      r,
      etiqueta: es ? { x: p.x - ETIQUETA.ancho / 2, y: p.y - exterior - ETIQUETA.separacion - ETIQUETA.alto } : null,
      yNombre: p.y + r + NOMBRE_BAJO_EL_CIRCULO,
    };
  });
  const arriba = Math.min(...marcas.map((m) => (m.etiqueta ? m.etiqueta.y : m.y - m.r)));
  // El nombre más bajo: su línea de base más lo que cuelga la letra (en el teléfono la letra crece, resultado.css).
  const abajo = Math.max(BASE_DEL_AREA, ...marcas.map((m) => m.yNombre + 10));
  const y = Math.floor(arriba - margen);
  const x0 = pts[0].x;
  const ancho = pts[pts.length - 1].x - x0;
  return {
    ...trazosDeLaEscalera(pts, hoy ? idx(hoy) : null, metaValida ? idx(metaValida) : null),
    marcas,
    caja: { x: IZQUIERDA_DEL_LIENZO, y, ancho: ANCHO_DE_LA_ESCALERA, alto: Math.ceil(abajo + margen) - y },
    paradas: marcas.map((m) => ({ offset: fmt((m.x - x0) / ancho), color: m.color })),
  };
}

/** Lo que lee un lector de pantalla: dónde está hoy y a dónde va. */
export function lecturaDeLaEscalera(area: string, hoy: { nombre: string } | null, meta: { nombre: string } | null): string {
  if (!hoy) return `Los cinco niveles de la escala: ${area} todavía está en medición.`;
  return `Los cinco niveles de la escala: ${area} está hoy en ${hoy.nombre}${meta ? ` y la meta es llevarla a ${meta.nombre}` : ", el nivel más alto"}.`;
}

/** Lo que dice la tarjeta de un nivel debajo de su descripción: si es donde está hoy, o a donde lo llevamos. */
export function marcaDelNivel(area: string, es: "hoy" | "meta" | null): string | null {
  if (es === "hoy") return `Aquí está ${area} hoy.`;
  if (es === "meta") return "Aquí lo llevamos: es la meta.";
  return null;
}
