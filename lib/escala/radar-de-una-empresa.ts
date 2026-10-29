/**
 * lib/escala/radar-de-una-empresa.ts — la geometría del radar de UNA empresa: el radar de la teoría
 * (lib/escala/radar-dibujo.ts) con la empresa como figura. PURO: sin React. Lo dibuja
 * components/escala/RadarDeUnaEmpresa.tsx en la página pública del resultado del test y en su PDF.
 *
 * Diseño aprobado por Elías el 2026-10-29 (Claude Design, tableros `Main`, `Movil` y `PdfHoja1`; la gramática de lo no
 * preguntado y de «No lo sé» sale del tablero `Variante`). La gramática es la de la teoría: un eje por dimensión (la
 * base operativa a la derecha, la producción a la izquierda, cada eje por el medio de su tramo: `angulosDeLosEjes`) y
 * un anillo poligonal por etapa, de Deficiente adentro a Óptimo afuera, del color de su nivel; Funcional punteado y con
 * su chip «La base». Encima, la empresa:
 *   · cada vértice va EXACTO en el cruce de su eje con el anillo de la etapa de esa dimensión (no hay puntaje dentro
 *     del anillo: lo que se dice es la etapa);
 *   · lo que más frena lleva un halo y una flecha punteada hasta su objetivo, marcado con un aro punteado;
 *   · una dimensión que no se preguntó va con el eje punteado, sin vértice y con «No se preguntó» en su rótulo; la
 *     figura pasa por el centro donde faltan;
 *   · «No lo sé» va con «?» en un aro punteado y el rótulo dice «No lo sabías · cuenta como Deficiente».
 * Tres juegos de medidas, los del diseño: `GRANDE` (la pantalla), `PDF` (la hoja horizontal) y `COMPACTO` (el
 * teléfono: en vez de rótulos, el número de cada dimensión en la punta del eje, y la lista va debajo, en HTML).
 * Las pruebas: radar-de-una-empresa.test.ts (vértices por etapa, lo no preguntado, «No lo sé», lo que más frena y que
 * ningún rótulo pise a otro).
 */
import { LETRAS, type ClaveDeCapa, type Letra } from "./documento/tipos";
import { angulosDeLosEjes, polarDesde, yEnElCentroDesde } from "./radar-dibujo";

// ── La entrada ────────────────────────────────────────────────────────────────

/** Una dimensión con el resultado de la empresa. */
export interface DimensionDelRadar {
  /** El id («1.1»). */
  clave: string;
  /** Lo que se lee como número; por defecto, la clave. */
  numero?: string;
  nombre: string;
  capa: ClaveDeCapa;
  /** Si el test la preguntó. Sin preguntar: eje punteado y sin vértice. */
  preguntada: boolean;
  /** La etapa en que quedó. Null (preguntada pero sin ubicar): sin vértice. */
  nivel: Letra | null;
  /** Contestó «No lo sé» (cuenta como el nivel más bajo). */
  noLoSe?: boolean;
  /** El 0–100 del chequeo; solo se lee con «Ver puntajes». */
  puntaje: number | null;
}

/** Lo que más frena: la dimensión y la etapa a la que hay que llevarla. */
export interface FrenoDelRadar {
  clave: string;
  objetivo: Letra;
}

// ── Las medidas ───────────────────────────────────────────────────────────────

export interface MedidasDelRadar {
  /** El viewBox: x, y, ancho, alto. */
  caja: [number, number, number, number];
  cx: number;
  cy: number;
  rCentro: number;
  rEjeDesde: number;
  rEjeHasta: number;
  /** La guía punteada vertical (arriba y abajo del centro), hasta este radio. */
  rGuia: number;
  /** El anillo de Deficiente y la distancia entre dos anillos. */
  rAnillo: number;
  paso: number;
  trazo: { anillo: number; eje: number; guia: number; figura: number };
  rayas: { funcional: string; guia: string; noPreguntada: string };
  /** El nombre de cada etapa, en el hueco de arriba: su letra y cuánto baja del anillo. */
  etapa: { letra: number; baja: number; borde: number };
  chipDeLaBase: { ancho: number; alto: number; letra: number; trazo: number; baja: number };
  /** El vértice: su radio, el de lo que más frena y su halo; el trazo blanco. */
  vertice: { r: number; rFrena: number; halo: number; trazo: number };
  /** Con «Ver puntajes»: un disco con el número adentro (y el halo de lo que más frena, si va). */
  conPuntaje: { r: number; letra: number; baja: number; trazo: number; halo: number | null };
  /** «No lo sé» sin puntajes: un aro punteado con «?». */
  noLoSe: { r: number; letra: number; baja: number };
  /** El objetivo de lo que más frena y la flecha que llega a él (los radios, contados desde el vértice y el objetivo). */
  objetivo: { r: number; rPunto: number; trazo: number; raya: string };
  flecha: { desde: number; hasta: number; punta: number; base: number; medioAncho: number; trazo: number; raya: string };
  /** Un punto gris chico en cada cruce sin vértice (null: no va). */
  puntoGris: number | null;
  centro: { area: number; yArea: number; sub: number | null; ySub: number };
  /** Los rótulos de cada dimensión (null: van números en la punta del eje, el teléfono). */
  rotulo: {
    r: number;
    numero: number;
    nombre: number;
    renglon: number;
    /** De la línea base del número a la del primer renglón del nombre. */
    aire: number;
    letrasPorRenglon: number;
    chip: { ancho: number; alto: number; letra: number; baja: number; texto: number };
  } | null;
  /** El número de cada dimensión en la punta de su eje (el teléfono). */
  numeroEnLaPunta: { r: number; letra: number; baja: number } | null;
  /** El nombre de cada mitad al costado (null: va arriba, en HTML). */
  mitad: { xIzquierda: number; xDerecha: number; medio: number; nombre: number; renglon: number; descripcion: number; conNivel: boolean } | null;
}

/** La pantalla (escritorio): el tablero `Main` del diseño, viewBox de 1400 × 800. */
export const GRANDE: MedidasDelRadar = {
  caja: [0, 10, 1400, 800],
  cx: 700,
  cy: 410,
  rCentro: 84,
  rEjeDesde: 84,
  rEjeHasta: 341,
  rGuia: 349,
  rAnillo: 135,
  paso: 46,
  trazo: { anillo: 1.75, eje: 1.25, guia: 1, figura: 2.5 },
  rayas: { funcional: "7 5", guia: "2 4", noPreguntada: "4 5" },
  etapa: { letra: 11, baja: 3.8, borde: 5 },
  chipDeLaBase: { ancho: 64, alto: 22, letra: 11.5, trazo: 1.25, baja: 4 },
  vertice: { r: 7.5, rFrena: 9, halo: 17, trazo: 3 },
  conPuntaje: { r: 14, letra: 11.5, baja: 4, trazo: 2.5, halo: 20 },
  noLoSe: { r: 10, letra: 12, baja: 4.2 },
  objetivo: { r: 10, rPunto: 3.5, trazo: 2, raya: "3 2.5" },
  flecha: { desde: 14, hasta: 16, punta: 12, base: 21, medioAncho: 5, trazo: 2, raya: "4 4" },
  puntoGris: 2.6,
  centro: { area: 28, yArea: -2, sub: 14, ySub: 23 },
  rotulo: { r: 353, numero: 12.5, nombre: 16.5, renglon: 20.1, aire: 27, letrasPorRenglon: 18, chip: { ancho: 118, alto: 20, letra: 10.5, baja: 10, texto: 13.8 } },
  numeroEnLaPunta: null,
  mitad: { xIzquierda: 200, xDerecha: 1190, medio: 429, nombre: 28, renglon: 32, descripcion: 13.5, conNivel: true },
};

/** La hoja 1 del PDF (horizontal): el tablero `PdfHoja1`, la misma geometría con letras un poco más grandes. */
export const PDF: MedidasDelRadar = {
  ...GRANDE,
  caja: [40, 20, 1320, 790],
  etapa: { letra: 11.5, baja: 3.8, borde: 5 },
  chipDeLaBase: { ancho: 64, alto: 22, letra: 12, trazo: 1.25, baja: 4 },
  vertice: { r: 8, rFrena: 9.5, halo: 17, trazo: 3 },
  puntoGris: null,
  rotulo: { r: 353, numero: 13.5, nombre: 17.5, renglon: 21.1, aire: 27, letrasPorRenglon: 18, chip: { ancho: 124, alto: 21, letra: 11, baja: 11, texto: 14.5 } },
  mitad: { xIzquierda: 240, xDerecha: 1190, medio: 415, nombre: 28, renglon: 32, descripcion: 14, conNivel: false },
};

/** El teléfono: el tablero `Movil`, viewBox de 336 × 330, con el número de cada dimensión en la punta del eje. */
export const COMPACTO: MedidasDelRadar = {
  caja: [12, 18, 336, 330],
  cx: 180,
  cy: 180,
  rCentro: 34,
  rEjeDesde: 36,
  rEjeHasta: 152.5,
  rGuia: 158.5,
  rAnillo: 56,
  paso: 20,
  trazo: { anillo: 1.4, eje: 1, guia: 0.8, figura: 2 },
  rayas: { funcional: "5 3.8", guia: "1.5 3", noPreguntada: "3 4" },
  etapa: { letra: 10, baja: 3.3, borde: 4 },
  chipDeLaBase: { ancho: 52, alto: 18, letra: 10, trazo: 1, baja: 3.4 },
  vertice: { r: 5.6, rFrena: 6.8, halo: 12.8, trazo: 2.2 },
  conPuntaje: { r: 11, letra: 9.5, baja: 3.4, trazo: 2, halo: null },
  noLoSe: { r: 7.5, letra: 9.5, baja: 3.3 },
  objetivo: { r: 7.5, rPunto: 2.6, trazo: 1.5, raya: "2.2 1.9" },
  flecha: { desde: 10.4, hasta: 12, punta: 9, base: 15.75, medioAncho: 3.8, trazo: 1.5, raya: "3 3" },
  puntoGris: null,
  centro: { area: 13, yArea: 4, sub: null, ySub: 0 },
  rotulo: null,
  numeroEnLaPunta: { r: 11.5, letra: 9.5, baja: 3.5 },
  mitad: null,
};

// ── La geometría ──────────────────────────────────────────────────────────────

export type Punto = [number, number];

export const f = (v: number) => v.toFixed(1);
const aRadianes = (g: number) => (g * Math.PI) / 180;

/** Grados de reloj (0 = arriba, en el sentido de las agujas) y radio → coordenadas del SVG (la del radar de la teoría). */
export const polarDe = (m: MedidasDelRadar, grados: number, r: number): Punto => polarDesde(m.cx, m.cy, grados, r);

/** El radio del anillo de una etapa. */
export const radioDeLaEtapa = (m: MedidasDelRadar, l: Letra) => m.rAnillo + m.paso * LETRAS.indexOf(l);

/** Dónde cruza un anillo la vertical del centro, arriba o abajo: la regla del radar de la teoría (`yEnElCentroDesde`). */
const yEnElCentro = (m: MedidasDelRadar, angulos: readonly number[], radio: number, lado: "arriba" | "abajo") =>
  yEnElCentroDesde(m.cx, m.cy, angulos, radio, lado);

/**
 * Un nombre en renglones de hasta `max` letras, con la menor cantidad de renglones, como los cortó el diseño: en dos,
 * el corte más parejo («Ventas ganadas / y perdidas», no «Ventas ganadas y / perdidas»; si dos difieren en una letra o
 * menos, el que deja más largo el primero: «Priorización de / interesados»); en tres o más, cada renglón lleno.
 * Una palabra más larga que `max` va sola.
 */
export function renglonesParejos(texto: string, max: number): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean);
  if (!palabras.length) return [];
  // Todos los cortes posibles (un nombre tiene pocas palabras): cada uno, sus renglones.
  const opciones: string[][] = [];
  const armar = (desde: number, hechos: string[]) => {
    if (desde === palabras.length) {
      opciones.push(hechos);
      return;
    }
    for (let hasta = desde + 1; hasta <= palabras.length; hasta++) {
      const renglon = palabras.slice(desde, hasta).join(" ");
      if (renglon.length > max && hasta > desde + 1) break;
      armar(hasta, [...hechos, renglon]);
    }
  };
  armar(0, []);
  const menos = Math.min(...opciones.map((o) => o.length));
  const largoMayor = (o: string[]) => Math.max(...o.map((r) => r.length));
  const candidatas = opciones.filter((o) => o.length === menos);
  // Con tres renglones o más, se llena cada renglón («Seguimiento de / demostraciones y / cotizaciones»).
  if (menos > 2) return candidatas.sort((x, y) => cadaRenglonMasLargo(x, y))[0];
  const masPareja = Math.min(...candidatas.map(largoMayor));
  const parejas = candidatas.filter((o) => largoMayor(o) <= masPareja + 1);
  return parejas.sort((x, y) => cadaRenglonMasLargo(x, y))[0];
}

/** Ordena primero el corte de primer renglón más largo (y así con los siguientes). */
function cadaRenglonMasLargo(x: string[], y: string[]): number {
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i].length !== y[i].length) return y[i].length - x[i].length;
  return 0;
}

/**
 * Cuánto mide un texto, estimado (Geist semibold ≈ 0,56 em por minúscula, 0,5 en regular; las mayúsculas, 0,66). Para
 * las cajas y las pruebas: de más, nunca de menos.
 */
export function anchoDelTexto(texto: string, letra: number, espaciado = 0, regular = false): number {
  let ancho = 0;
  for (const c of texto) {
    const em = /[\s.,·:'’]/.test(c) ? 0.3 : /[A-ZÁÉÍÓÚÑ]/.test(c) ? 0.66 : /[mwMW]/.test(c) ? 0.85 : regular ? 0.5 : 0.56;
    ancho += (em + espaciado) * letra;
  }
  return ancho;
}

/** Una caja: de x0 a x1 y de y0 (arriba) a y1 (abajo). */
export interface Caja {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export const seCruzan = (a: Caja, b: Caja) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Lo que dice el número de una dimensión, después de su clave. */
export type EstadoDelRotulo = { tipo: "nivel"; letra: Letra } | { tipo: "noLoSe" } | { tipo: "noPreguntada" } | { tipo: "sinUbicar" };

export interface RotuloDelRadar {
  clave: string;
  x: number;
  ancla: "start" | "end";
  yNumero: number;
  numero: string;
  estado: EstadoDelRotulo;
  nombre: { texto: string; y: number }[];
  /** «cuenta como Deficiente», bajo el nombre de un «No lo sé». */
  nota: { y: number } | null;
  /** El chip de «LO QUE MÁS FRENA», debajo. */
  chip: { x: number; y: number } | null;
  caja: Caja;
}

export interface EjeDelRadar {
  clave: string;
  grados: number;
  desde: Punto;
  hasta: Punto;
  preguntada: boolean;
}

export interface VerticeDelRadar {
  clave: string;
  punto: Punto;
  nivel: Letra;
  noLoSe: boolean;
  frena: boolean;
  puntaje: number | null;
}

export interface DibujoDelRadar {
  m: MedidasDelRadar;
  /** El viewBox: el del diseño, agrandado solo si algo queda afuera. */
  caja: [number, number, number, number];
  guias: [Punto, Punto][];
  ejes: EjeDelRadar[];
  anillos: { letra: Letra; puntos: Punto[] }[];
  etapas: { letra: Letra; x: number; y: number }[];
  chipDeLaBase: Caja;
  puntosGrises: Punto[];
  /** La figura de la empresa: sus vértices en el orden de los ejes; donde faltan, pasa por el centro. */
  figura: Punto[];
  vertices: VerticeDelRadar[];
  /** El objetivo de lo que más frena y la flecha que llega a él. */
  objetivo: { punto: Punto; linea: [Punto, Punto] | null; punta: [Punto, Punto, Punto]; nivel: Letra } | null;
  rotulos: RotuloDelRadar[];
  /** El número en la punta de cada eje (el teléfono). */
  numeros: { clave: string; numero: string; punto: Punto; frena: boolean; preguntada: boolean }[];
  mitades: { clave: ClaveDeCapa; x: number; ancla: "start" | "end"; nombre: { texto: string; y: number }[]; descripcion: { texto: string; y: number }[]; yNivel: number | null; caja: Caja }[];
}

/**
 * El dibujo entero: dónde va cada cosa, con las medidas `m`. Las dimensiones van en el orden de la escala; cada capa
 * llena su mitad en ese orden. Una capa desconocida no entra.
 */
export function dibujoDelRadar(
  m: MedidasDelRadar,
  entrada: readonly DimensionDelRadar[],
  o: {
    frena?: FrenoDelRadar | null;
    capas?: readonly { clave: ClaveDeCapa; nombre: string; descripcion?: string | null }[];
    /** El nombre de cada etapa, el de la escala (para medir los rótulos). */
    nombreDeNivel: (l: Letra) => string;
  },
): DibujoDelRadar {
  const { nombreDeNivel } = o;
  const dims = entrada.filter((d) => d.capa === "base" || d.capa === "produccion");
  const angulos = angulosDeLosEjes(dims.map((d) => ({ id: d.clave, capa: d.capa })));
  const grados = (d: DimensionDelRadar) => angulos.get(d.clave)!;
  const todos = [...angulos.values()];
  const orden = [...dims].sort((a, b) => grados(a) - grados(b));
  const frena = o.frena && dims.some((d) => d.clave === o.frena!.clave && d.preguntada && d.nivel) ? o.frena : null;

  const guias: [Punto, Punto][] = [
    [polarDe(m, 0, m.rGuia), polarDe(m, 0, m.rEjeDesde)],
    [polarDe(m, 180, m.rEjeDesde), polarDe(m, 180, m.rGuia)],
  ];
  const ejes = dims.map((d) => ({ clave: d.clave, grados: grados(d), desde: polarDe(m, grados(d), m.rEjeDesde), hasta: polarDe(m, grados(d), m.rEjeHasta), preguntada: d.preguntada }));
  const anillos = LETRAS.map((letra) => ({ letra, puntos: orden.map((d) => polarDe(m, grados(d), radioDeLaEtapa(m, letra))) }));
  const etapas = LETRAS.map((letra) => ({ letra, x: m.cx, y: yEnElCentro(m, todos, radioDeLaEtapa(m, letra), "arriba") + m.etapa.baja }));
  const yBase = yEnElCentro(m, todos, radioDeLaEtapa(m, "F"), "abajo");
  const chipDeLaBase = { x0: m.cx - m.chipDeLaBase.ancho / 2, x1: m.cx + m.chipDeLaBase.ancho / 2, y0: yBase - m.chipDeLaBase.alto / 2, y1: yBase + m.chipDeLaBase.alto / 2 };

  const conVertice = (d: DimensionDelRadar) => d.preguntada && !!d.nivel;
  const vertices: VerticeDelRadar[] = orden.filter(conVertice).map((d) => ({
    clave: d.clave,
    punto: polarDe(m, grados(d), radioDeLaEtapa(m, d.nivel!)),
    nivel: d.nivel!,
    noLoSe: !!d.noLoSe,
    frena: d.clave === frena?.clave,
    puntaje: d.puntaje !== null && Number.isFinite(d.puntaje) ? Math.round(d.puntaje) : null,
  }));

  // La figura: los vértices en orden; una racha de ejes sin vértice la hace pasar UNA vez por el centro.
  const figura: Punto[] = [];
  orden.forEach((d, i) => {
    if (conVertice(d)) figura.push(polarDe(m, grados(d), radioDeLaEtapa(m, d.nivel!)));
    else if (i === 0 || conVertice(orden[i - 1])) figura.push([m.cx, m.cy]);
  });
  // La racha que cruza el final y el comienzo ya pasó por el centro al empezar.
  if (figura.length > 1 && !conVertice(orden[0]) && !conVertice(orden[orden.length - 1])) figura.pop();
  if (!vertices.length) figura.length = 0;

  let objetivo: DibujoDelRadar["objetivo"] = null;
  if (frena) {
    const d = dims.find((x) => x.clave === frena.clave)!;
    const g = grados(d);
    const rV = radioDeLaEtapa(m, d.nivel!);
    const rO = radioDeLaEtapa(m, frena.objetivo);
    const sentido = rO >= rV ? 1 : -1;
    const fl = m.flecha;
    // Las medidas del diseño cuando entran; en un salto de una sola etapa en el teléfono no entran (la línea quedaba al
    // revés): ahí va solo la punta, entre el borde del vértice y el aro del objetivo.
    const distancia = Math.abs(rO - rV);
    const entra = distancia - fl.hasta - fl.desde >= 6;
    const punta = entra ? fl.punta : m.objetivo.r + 1;
    const base = entra ? fl.base : Math.max(punta + 3, Math.min(fl.base, distancia - m.vertice.rFrena));
    const [bx, by] = polarDe(m, g, rO - sentido * base);
    // La base de la punta: perpendicular al eje.
    const ancho = entra ? fl.medioAncho : Math.min(fl.medioAncho, (base - punta) * 0.8);
    const px = Math.cos(aRadianes(g)) * ancho;
    const py = Math.sin(aRadianes(g)) * ancho;
    objetivo = {
      punto: polarDe(m, g, rO),
      linea: entra ? [polarDe(m, g, rV + sentido * fl.desde), polarDe(m, g, rO - sentido * fl.hasta)] : null,
      punta: [polarDe(m, g, rO - sentido * punta), [bx + px, by + py], [bx - px, by - py]],
      nivel: frena.objetivo,
    };
  }

  const puntosGrises: Punto[] = [];
  if (m.puntoGris) {
    for (const d of orden) {
      if (!d.preguntada) continue;
      for (const l of LETRAS) {
        if (l === d.nivel || (d.clave === frena?.clave && l === frena.objetivo)) continue;
        puntosGrises.push(polarDe(m, grados(d), radioDeLaEtapa(m, l)));
      }
    }
  }

  const rotulos = m.rotulo ? dims.map((d) => rotuloDeLaDimension(m, d, grados(d), d.clave === frena?.clave, nombreDeNivel)) : [];
  const numeros = m.numeroEnLaPunta
    ? dims.map((d) => ({ clave: d.clave, numero: d.numero ?? d.clave, punto: polarDe(m, grados(d), m.rEjeHasta), frena: d.clave === frena?.clave, preguntada: d.preguntada }))
    : [];
  const mitades = m.mitad
    ? (o.capas ?? [])
        .filter((c) => c.clave === "base" || c.clave === "produccion")
        .map((c) => alejarDeLosRotulos(rotuloDeLaMitad(m, c.clave, c.nombre, c.descripcion ?? null), rotulos))
    : [];

  // El dibujo abarca lo del diseño y, si un área rara empuja algo afuera (una mitad corrida, un nombre muy largo), eso también.
  const [vx, vy, vw, vh] = m.caja;
  const cajas = [...rotulos.map((r) => r.caja), ...mitades.map((x) => x.caja)];
  const afuera = (desde: number, valores: number[], menor: boolean) => {
    const v = menor ? Math.min(...valores) : Math.max(...valores);
    return menor ? (v < desde ? v - 4 : desde) : v > desde ? v + 4 : desde;
  };
  const x0 = afuera(vx, cajas.map((c) => c.x0), true);
  const y0 = afuera(vy, cajas.map((c) => c.y0), true);
  const x1 = afuera(vx + vw, cajas.map((c) => c.x1), false);
  const y1 = afuera(vy + vh, cajas.map((c) => c.y1), false);
  const caja: [number, number, number, number] = [x0, y0, x1 - x0, y1 - y0];

  return { m, caja, guias, ejes, anillos, etapas, chipDeLaBase, puntosGrises, figura, vertices, objetivo, rotulos, numeros, mitades };
}

/** El estado que dice el número de una dimensión. */
export function estadoDeLaDimension(d: DimensionDelRadar): EstadoDelRotulo {
  if (!d.preguntada) return { tipo: "noPreguntada" };
  if (!d.nivel) return { tipo: "sinUbicar" };
  if (d.noLoSe) return { tipo: "noLoSe" };
  return { tipo: "nivel", letra: d.nivel };
}

/**
 * El rótulo de una dimensión, afuera de su eje (las medidas del diseño): arriba el bloque termina sobre el radio del
 * rótulo y crece hacia arriba, abajo empieza debajo y crece hacia abajo, y a los costados se centra en él. A la derecha
 * se ancla al comienzo y a la izquierda al final. Debajo del nombre, la nota de «No lo sé» y el chip de lo que más frena.
 */
function rotuloDeLaDimension(m: MedidasDelRadar, d: DimensionDelRadar, grados: number, frena: boolean, nombreDeNivel: (l: Letra) => string): RotuloDelRadar {
  const r = m.rotulo!;
  const [x, y] = polarDe(m, grados, r.r);
  const s = Math.sin(aRadianes(grados));
  const c = Math.cos(aRadianes(grados));
  const ancla: "start" | "end" = s >= 0 ? "start" : "end";
  const estado = estadoDeLaDimension(d);
  const lineas = renglonesParejos(d.nombre, r.letrasPorRenglon);
  const conNota = estado.tipo === "noLoSe";
  const extra = lineas.length - 1 + (conNota ? 1 : 0);
  // El paso con que se centra o se sube el bloque es el de la pantalla (20,1) también en el PDF: así lo midió el diseño.
  const yNumero = c > 0.5 ? y - 27.6 - 20.1 * extra : c < -0.5 ? y + 14.5 : y - 7.6 - 10.05 * extra;
  const nombre = lineas.map((texto, j) => ({ texto, y: yNumero + r.aire + r.renglon * j }));
  const ultima = yNumero + r.aire + r.renglon * (lineas.length - 1);
  const nota = conNota ? { y: ultima + r.renglon * 0.9 } : null;
  const fondo = nota ? nota.y : ultima;
  // El chip de lo que más frena va debajo del rótulo; en uno de arriba, encima del número (debajo colgaría dentro del radar).
  const xChip = ancla === "start" ? x : x - r.chip.ancho;
  const chip = !frena ? null : c > 0.5 ? { x: xChip, y: yNumero - r.numero - r.chip.baja - r.chip.alto + 4 } : { x: xChip, y: fondo + r.chip.baja };

  const numero = d.numero ?? d.clave;
  // El punto de color va entre la clave y el nivel: «1.1 · ● Inicial».
  const textoDelNumero = `${numero} · ${estado.tipo === "nivel" ? "● " : ""}${textoDelEstado(estado, nombreDeNivel)}`;
  const ancho = Math.max(
    anchoDelTexto(textoDelNumero, r.numero, 0.04) + r.numero,
    ...lineas.map((l) => anchoDelTexto(l, r.nombre)),
    conNota ? anchoDelTexto(notaDelNoLoSe(nombreDeNivel), r.nombre - 3.5, 0, true) : 0,
    chip ? r.chip.ancho : 0,
  );
  const y0 = Math.min(yNumero - r.numero, chip ? chip.y : Infinity);
  const y1 = Math.max(fondo + r.nombre * 0.28, chip ? chip.y + r.chip.alto : -Infinity);
  return {
    clave: d.clave,
    x,
    ancla,
    yNumero,
    numero,
    estado,
    nombre,
    nota,
    chip,
    caja: ancla === "start" ? { x0: x, x1: x + ancho, y0, y1 } : { x0: x - ancho, x1: x, y0, y1 },
  };
}

/** La nota de un «No lo sé»: cuenta como la primera etapa (lib/tests-diagnostico/resultado.ts). */
export const notaDelNoLoSe = (nombreDeNivel: (l: Letra) => string) => `cuenta como ${nombreDeNivel(LETRAS[0])}`;

/** El estado en palabras («Inicial», «No lo sabías», «No se preguntó»). */
export function textoDelEstado(e: EstadoDelRotulo, nombreDeNivel: (l: Letra) => string): string {
  if (e.tipo === "nivel") return nombreDeNivel(e.letra);
  if (e.tipo === "noLoSe") return "No lo sabías";
  if (e.tipo === "noPreguntada") return "No se preguntó";
  return "Sin ubicar";
}

/**
 * El nombre de una mitad al costado (en mayúsculas, renglones de 10 letras), su descripción (de 26) y, si va, el nivel
 * de la capa: un bloque centrado a la altura `medio`.
 */
function rotuloDeLaMitad(m: MedidasDelRadar, clave: ClaveDeCapa, nombre: string, descripcion: string | null) {
  const mi = m.mitad!;
  const derecha = clave === "base";
  const lineas = renglonesParejos(nombre.toUpperCase(), 10);
  const desc = descripcion ? renglonesParejos(descripcion, 26) : [];
  const alto = (lineas.length - 1) * mi.renglon + (desc.length ? 26 + (desc.length - 1) * 18 : 0) + (mi.conNivel ? 30 : 0);
  const y0 = mi.medio - alto / 2;
  const yDesc = y0 + (lineas.length - 1) * mi.renglon + 26;
  const x = derecha ? mi.xDerecha : mi.xIzquierda;
  const ancla: "start" | "end" = derecha ? "start" : "end";
  const yNivel = mi.conNivel ? y0 + alto : null;
  const ancho = Math.max(...lineas.map((l) => anchoDelTexto(l, mi.nombre)), ...desc.map((l) => anchoDelTexto(l, mi.descripcion, 0, true)), mi.conNivel ? 160 : 0);
  return {
    clave,
    x,
    ancla,
    nombre: lineas.map((texto, j) => ({ texto, y: y0 + j * mi.renglon })),
    descripcion: desc.map((texto, j) => ({ texto, y: yDesc + j * 18 })),
    yNivel,
    caja: { x0: derecha ? x : x - ancho, x1: derecha ? x + ancho : x, y0: y0 - mi.nombre * 0.75, y1: (yNivel ?? yDesc + (desc.length - 1) * 18) + 5 },
  };
}

type MitadDelRadar = DibujoDelRadar["mitades"][number];

/**
 * Con tres dimensiones por mitad hay un eje horizontal, y su rótulo cae a la altura del nombre de la mitad: la mitad se
 * corre hacia afuera hasta dejar 24 de aire. Con cuatro por mitad (el diseño) no se mueve.
 */
function alejarDeLosRotulos(mi: MitadDelRadar, rotulos: readonly RotuloDelRadar[]): MitadDelRadar {
  const derecha = mi.ancla === "start";
  let x = mi.x;
  for (const r of rotulos) {
    if (r.caja.y1 < mi.caja.y0 - 8 || r.caja.y0 > mi.caja.y1 + 8) continue;
    if (derecha && r.ancla === "start") x = Math.max(x, r.caja.x1 + 24);
    if (!derecha && r.ancla === "end") x = Math.min(x, r.caja.x0 - 24);
  }
  const dx = x - mi.x;
  return dx === 0 ? mi : { ...mi, x, caja: { ...mi.caja, x0: mi.caja.x0 + dx, x1: mi.caja.x1 + dx } };
}

/** Los puntos de un polígono, para el atributo `points`. */
export const puntosSvg = (ps: readonly Punto[]) => ps.map((p) => `${f(p[0])},${f(p[1])}`).join(" ");

/** Hasta dónde llegan las cuñas: la esquina de la caja más lejana del centro. */
export function radioDeLasCunas(m: MedidasDelRadar): number {
  const [x, y, ancho, alto] = m.caja;
  return Math.max(...[[x, y], [x + ancho, y], [x, y + alto], [x + ancho, y + alto]].map(([a, b]) => Math.hypot(a - m.cx, b - m.cy)));
}

/** Cada cuánto se parte el arco de una cuña (grados): suficiente para que se vea redonda. */
const PASO_DEL_ARCO = 6;

/**
 * La zona de cursor de cada dimensión (la página, nunca el PDF): una cuña desde el centro hasta el borde del dibujo (así
 * cubre también el hueco entre los renglones del rótulo), que llega hasta la mitad del camino a cada eje vecino. Al pasar
 * el cursor, la página resalta esa dimensión, su vértice y su rótulo (components/external/test/AnimacionesDelResultado.tsx).
 * Las cuñas no se pisan; el SVG recorta lo que sale de su caja.
 */
export function cunasDelRadar(m: MedidasDelRadar, ejes: readonly Pick<EjeDelRadar, "clave" | "grados">[]): { clave: string; puntos: Punto[] }[] {
  if (!ejes.length) return [];
  const orden = [...ejes].sort((a, b) => a.grados - b.grados);
  const r = radioDeLasCunas(m);
  return orden.map((e, i) => {
    const antes = orden.length === 1 ? e.grados - 180 : i === 0 ? orden[orden.length - 1].grados - 360 : orden[i - 1].grados;
    const despues = orden.length === 1 ? e.grados + 180 : i === orden.length - 1 ? orden[0].grados + 360 : orden[i + 1].grados;
    const desde = (antes + e.grados) / 2;
    const hasta = (e.grados + despues) / 2;
    const pasos = Math.max(1, Math.ceil((hasta - desde) / PASO_DEL_ARCO));
    const arco = Array.from({ length: pasos + 1 }, (_, k) => polarDe(m, desde + ((hasta - desde) * k) / pasos, r));
    return { clave: e.clave, puntos: [[m.cx, m.cy] as Punto, ...arco] };
  });
}
