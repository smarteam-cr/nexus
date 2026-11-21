/**
 * lib/escala/escalera.ts — LA ESCALERA de los cinco niveles, arriba de la página de cada área (Elías, 20 nov, al presentar
 * diagnósticos reales con Ventas). PURO y client-safe: lo dibuja components/external/test/EscaleraDeNiveles.tsx en la
 * escala de una empresa y en el resultado del test público (y en su PDF: SVG estático, sin JS).
 *
 * Viene de la aplicación vieja (dev.smarteamcr.com/diagnostico-rendimiento, `components/curva.js`): una curva con los cinco
 * niveles numerados encima, de 1 Deficiente (rojo) a 5 Óptimo (verde), con el área bajo la curva sombreada. Nexus la tuvo
 * hasta el 28 oct (bc2438bf, cuando el radar pasó arriba). Ahora es una curva en S y marca dos cosas:
 *   · dónde está el área HOY (su nivel general, del cálculo);
 *   · A DÓNDE LA LLEVAMOS (`metaDeLaEscalera`): Funcional casi siempre; si ya está en Funcional o más arriba, el nivel
 *     siguiente. Quien presenta lo puede cambiar (un texto de la página, `CLAVES.delArea(area, "meta")`): vale solo si está
 *     por encima de hoy; si los niveles suben y lo deja igual o abajo, vuelve la de siempre.
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

/** El lienzo: ancho y alto del viewBox. */
export const ANCHO_DE_LA_ESCALERA = 820;
export const ALTO_DE_LA_ESCALERA = 330;
const IZQ = 80;
const DER = 740;
/** El piso de la curva (donde arranca Deficiente) y su techo (Óptimo). */
const PISO = 245;
const TECHO = 95;
/** Donde termina el área sombreada (debajo de los nombres de los niveles queda blanco). */
export const BASE_DEL_AREA = 290;

/** La S: 0 en 0, 1 en 1, empinada en el medio (una logística normalizada). */
function ese(t: number): number {
  const k = 7;
  const f = (x: number) => 1 / (1 + Math.exp(-k * (x - 0.5)));
  return (f(t) - f(0)) / (f(1) - f(0));
}

const punto = (t: number) => ({ x: IZQ + t * (DER - IZQ), y: PISO - ese(t) * (PISO - TECHO) });
const fmt = (n: number) => Number(n.toFixed(1));

export interface MarcaDeLaEscalera {
  letra: Letra;
  numero: number;
  nombre: string;
  x: number;
  y: number;
  color: string;
  /** El nivel de hoy, la meta, o ninguno. */
  es: "hoy" | "meta" | null;
}

export interface DibujoDeLaEscalera {
  /** La curva entera, como trazo. */
  curva: string;
  /** El área bajo la curva, cerrada contra la base. */
  area: string;
  /** El tramo de la curva entre hoy y la meta (null sin meta): lo que vamos a recorrer. */
  tramo: string | null;
  /** El área bajo ese tramo (null sin meta). */
  areaDelTramo: string | null;
  marcas: MarcaDeLaEscalera[];
}

/** La curva entre dos puntos de 0 a 1, como trazo SVG. */
function trazo(desde: number, hasta: number, pasos = 48): string {
  const xs = Array.from({ length: pasos + 1 }, (_, i) => desde + ((hasta - desde) * i) / pasos);
  return xs.map((t, i) => `${i ? "L" : "M"}${fmt(punto(t).x)} ${fmt(punto(t).y)}`).join(" ");
}
const cerrada = (desde: number, hasta: number) => `${trazo(desde, hasta)} L${fmt(punto(hasta).x)} ${BASE_DEL_AREA} L${fmt(punto(desde).x)} ${BASE_DEL_AREA} Z`;

/** La geometría de la escalera para un nivel de hoy y una meta. Los nombres, los de la escala (`niveles`, en orden). */
export function dibujoDeLaEscalera(niveles: readonly { letra: Letra; nombre: string }[], hoy: Letra | null, meta: Letra | null): DibujoDeLaEscalera {
  const tDe = (l: Letra) => idx(l) / (LETRAS.length - 1);
  const marcas: MarcaDeLaEscalera[] = LETRAS.map((letra, i) => {
    const p = punto(tDe(letra));
    return {
      letra,
      numero: i + 1,
      nombre: niveles.find((n) => n.letra === letra)?.nombre ?? letra,
      x: fmt(p.x),
      y: fmt(p.y),
      color: COLOR_DE_LA_ESCALERA[letra],
      es: letra === hoy ? "hoy" : letra === meta ? "meta" : null,
    };
  });
  const conTramo = !!hoy && !!meta && idx(meta) > idx(hoy);
  return {
    curva: trazo(0, 1, 96),
    area: cerrada(0, 1),
    tramo: conTramo ? trazo(tDe(hoy!), tDe(meta!)) : null,
    areaDelTramo: conTramo ? cerrada(tDe(hoy!), tDe(meta!)) : null,
    marcas,
  };
}

/** Lo que lee un lector de pantalla: dónde está hoy y a dónde va. */
export function lecturaDeLaEscalera(area: string, hoy: { nombre: string } | null, meta: { nombre: string } | null): string {
  if (!hoy) return `Los cinco niveles de la escala: ${area} todavía está en medición.`;
  return `Los cinco niveles de la escala: ${area} está hoy en ${hoy.nombre}${meta ? ` y la meta es llevarla a ${meta.nombre}` : ", el nivel más alto"}.`;
}
