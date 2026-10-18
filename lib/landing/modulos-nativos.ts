/**
 * lib/landing/modulos-nativos.ts — LOS MÓDULOS QUE VENTAS ARMABA EN HTML, COMO SECCIONES DEL MOTOR.
 *
 * PURO. Sin Prisma, sin fetch, sin React.
 *
 * ── DE DÓNDE SALEN ────────────────────────────────────────────────────────────────────────────
 * El 2026-10-17 se revisaron las 66 secciones personalizadas que Andrés y Marco armaron a mano en
 * 23 propuestas. Lo que más se repite, y que el motor no sabía dibujar, son tres formas:
 *
 *   · **Casos de uso por proyecto** (BlueSat, CasaMax, Universidad Monterrey, Ecoquintas): pestañas
 *     por proyecto o por área, y dentro cada caso con qué hace, qué obtiene el cliente y con qué
 *     herramientas. NO es la sección `use_cases` de la plantilla: esa sale del checklist con
 *     precios; ésta es el alcance funcional, sin plata.
 *   · **Comparación de licencias** (Credit Force, Grupo Monge): Starter contra Professional, una
 *     fila por necesidad, con lo que cubre cada plan y la recomendación.
 *   · **Fases u opciones** (JUDESUR, Grupo Monge, Ecoquintas): tarjetas numeradas — las fases de
 *     una ruta (01, 02) o caminos para elegir (A, B), con la recomendada marcada.
 *
 * Lo demás que se repite YA era nativo: la arquitectura es el tipo «diagrama» (el motor de
 * diagramas), el antes y después es «comparación a dos columnas», la forma de pago es la sección de
 * la plantilla debajo de la Inversión y el plan con Gantt es el cronograma.
 *
 * ── ⚠ TODA HOJA DEL SCHEMA ES UN TEXTO ────────────────────────────────────────────────────────
 * Igual que en el catálogo: `coerceToSchema` aplana a vacío cualquier hoja que no sea string. Por
 * eso «recomendado» y «destacada» viajan como "si"/"" y las herramientas como texto separado por
 * comas.
 */
import type { CasoDelCatalogo } from "@/lib/casos-de-uso/catalogo";
import { NOMBRE_DE_LA_HERRAMIENTA } from "@/lib/casos-de-uso/vista";

const str = { type: "string" } as const;
const strArray = { type: "array", items: { type: "string" } } as const;
function arrayOf(props: Record<string, unknown>, required: string[]) {
  return { type: "array", items: { type: "object", properties: props, required } } as const;
}

// ── 1 · Casos de uso por proyecto ────────────────────────────────────────────────────────────

export const CASOS_POR_PROYECTO_TYPE = "casos_por_proyecto";

export interface CasoAImplementar {
  titulo: string;
  /** Qué hace: el disparador y lo que se automatiza, en una o dos frases. */
  detalle: string;
  /** Lo que obtiene el cliente. */
  resultado: string;
  /** Con qué se hace, separado por comas ("Sales Hub, Data Hub, Softland"). */
  herramientas: string;
}
export interface GrupoDeCasos {
  /** El proyecto o el área: es el rótulo de la pestaña. */
  nombre: string;
  descripcion: string;
  casos: CasoAImplementar[];
}
export interface CasosPorProyectoData {
  intro: string;
  grupos: GrupoDeCasos[];
}

export const CASOS_POR_PROYECTO_SCHEMA = {
  type: "object",
  properties: {
    intro: str,
    grupos: arrayOf(
      {
        nombre: str,
        descripcion: str,
        casos: arrayOf({ titulo: str, detalle: str, resultado: str, herramientas: str }, ["titulo"]),
      },
      ["nombre", "casos"],
    ),
  },
  required: ["grupos"],
} as const;
export const CASOS_POR_PROYECTO_EMPTY: CasosPorProyectoData = { intro: "", grupos: [] };

export const CASO_VACIO: CasoAImplementar = { titulo: "", detalle: "", resultado: "", herramientas: "" };
export const GRUPO_VACIO: GrupoDeCasos = { nombre: "", descripcion: "", casos: [] };

/** Tope de herramientas que se pintan por caso: más que eso ya no es un dato, es ruido. */
export const MAX_HERRAMIENTAS = 6;

/** Las herramientas de un caso, desde el texto separado por comas (o punto y coma). Sin repetir. */
export function herramientasDe(csv: string | null | undefined): string[] {
  const vistas = new Set<string>();
  const out: string[] = [];
  for (const parte of (csv ?? "").split(/[,;]/)) {
    const h = parte.trim();
    const k = h.toLowerCase();
    if (!h || vistas.has(k)) continue;
    vistas.add(k);
    out.push(h);
    if (out.length === MAX_HERRAMIENTAS) break;
  }
  return out;
}

/** Cuántos grupos y cuántos casos hay, para la línea de arriba («3 proyectos · 9 casos de uso»). */
export function resumenDeCasos(grupos: readonly GrupoDeCasos[] | null | undefined): { grupos: number; casos: number } {
  const gs = Array.isArray(grupos) ? grupos : [];
  return {
    grupos: gs.length,
    casos: gs.reduce((n, g) => n + (Array.isArray(g?.casos) ? g.casos.length : 0), 0),
  };
}

/**
 * Un caso del catálogo de Smarteam (lib/casos-de-uso) pasado a un caso de la sección.
 *
 * ⛔ NUNCA el `aviso`: es la nota interna para quien vende («qué no mide la escala»), y esta
 * sección la lee el cliente. Tampoco los síntomas, que son frases del cliente para reconocer el
 * caso en una reunión, no para escribirlas en su propuesta.
 */
export function casoDesdeElCatalogo(
  caso: Pick<CasoDelCatalogo, "titulo" | "descripcion" | "promesa" | "herramientas">,
): CasoAImplementar {
  return {
    titulo: caso.titulo,
    detalle: caso.descripcion,
    resultado: caso.promesa,
    herramientas: caso.herramientas.map((h) => NOMBRE_DE_LA_HERRAMIENTA[h]).join(", "),
  };
}

/** El grupo que se muestra: el pedido si existe, si no el primero. Nunca un índice fuera de rango. */
export function grupoVisible(n: number, pedido: number): number {
  if (n <= 0) return -1;
  return Number.isInteger(pedido) && pedido >= 0 && pedido < n ? pedido : 0;
}

// ── 2 · Comparación de licencias ─────────────────────────────────────────────────────────────

export const COMPARACION_LICENCIAS_TYPE = "comparacion_licencias";

export interface PlanDeLicencia {
  /** "Starter", "Professional", "Sales Hub Pro". */
  nombre: string;
  /** Una línea debajo del nombre ("Cubre la base"). */
  nota: string;
  /** "si" = el plan que se recomienda. TEXTO, no booleano: ver el encabezado. */
  recomendado: string;
}
export interface FilaDeLicencia {
  /** La necesidad o el caso de uso del cliente. */
  necesidad: string;
  /** Uno por plan, en el MISMO orden que `planes`: "si", "no", "parcial" o un texto corto. */
  valores: string[];
  /** Por qué importa esa fila para el cliente (opcional). */
  impacto: string;
}
export interface ComparacionLicenciasData {
  intro: string;
  /** La recomendación en una frase ("Marketing Hub Professional + Sales Hub Professional"). */
  recomendacion: string;
  planes: PlanDeLicencia[];
  filas: FilaDeLicencia[];
  nota: string;
}

export const COMPARACION_LICENCIAS_SCHEMA = {
  type: "object",
  properties: {
    intro: str,
    recomendacion: str,
    planes: arrayOf({ nombre: str, nota: str, recomendado: str }, ["nombre"]),
    filas: arrayOf({ necesidad: str, valores: strArray, impacto: str }, ["necesidad", "valores"]),
    nota: str,
  },
  required: ["planes", "filas"],
} as const;
export const COMPARACION_LICENCIAS_EMPTY: ComparacionLicenciasData = {
  intro: "",
  recomendacion: "",
  planes: [],
  filas: [],
  nota: "",
};

/** Más de cuatro planes no entran en pantalla ni en la hoja del PDF. */
export const MAX_PLANES = 4;

export type ValorDeLicencia =
  | { tipo: "si" }
  | { tipo: "no" }
  | { tipo: "parcial"; texto: string }
  | { tipo: "vacio" }
  | { tipo: "texto"; texto: string };

const SI = new Set(["si", "sí", "yes", "✓", "✔", "✅", "incluido", "incluida", "included", "true"]);
const NO = new Set(["no", "✗", "✘", "❌", "-", "—", "–", "no incluido", "no incluida", "not included", "false"]);
const PARCIAL = /^(parcial|partial|limitad[oa]|limited|◐)\b/i;

/**
 * Qué dice una celda de la comparación.
 *
 * ⚠ La «x» NO se interpreta: unos la escriben como «tiene» y otros como «no tiene». Un ícono que
 * afirme lo contrario de lo que se quiso decir es peor que mostrar la letra tal cual.
 */
export function valorDeLicencia(raw: string | null | undefined): ValorDeLicencia {
  const v = (raw ?? "").trim();
  if (!v) return { tipo: "vacio" };
  const k = v.toLowerCase();
  if (SI.has(k)) return { tipo: "si" };
  if (NO.has(k)) return { tipo: "no" };
  if (PARCIAL.test(v)) {
    const resto = v.replace(PARCIAL, "").replace(/^[\s:·,—–-]+/, "").trim();
    return { tipo: "parcial", texto: resto };
  }
  return { tipo: "texto", texto: v };
}

/** El índice del plan recomendado, o -1. Si marcaron dos, gana el primero: una sola recomendación. */
export function indiceRecomendado(planes: readonly PlanDeLicencia[] | null | undefined): number {
  const ps = Array.isArray(planes) ? planes : [];
  return ps.findIndex((p) => esSiTexto(p?.recomendado));
}

/** Los valores de una fila normalizados al número de planes (rellena y recorta). */
export function valoresDeFila(fila: Pick<FilaDeLicencia, "valores"> | null | undefined, nPlanes: number): string[] {
  const vs = Array.isArray(fila?.valores) ? fila.valores : [];
  return Array.from({ length: Math.max(0, nPlanes) }, (_, i) => (typeof vs[i] === "string" ? vs[i] : ""));
}

/** Marca un plan como el recomendado y desmarca los demás. `-1` los desmarca a todos. */
export function marcarRecomendado(planes: readonly PlanDeLicencia[], i: number): PlanDeLicencia[] {
  return planes.map((p, j) => ({ ...p, recomendado: j === i ? "si" : "" }));
}

// ── 3 · Fases u opciones ─────────────────────────────────────────────────────────────────────

export const FASES_U_OPCIONES_TYPE = "fases_u_opciones";

export interface FaseUOpcion {
  nombre: string;
  /** El chip de arriba ("Recomendada", "Sugerida", "Implementación rápida"). Opcional. */
  etiqueta: string;
  objetivo: string;
  /** Lo que incluye, un renglón por cosa. */
  incluye: string[];
  resultado: string;
  /** "4 semanas", "64 horas". Sin montos: la plata vive en la Inversión. */
  plazo: string;
  /** "si" = la que se recomienda (en opciones) o la que va primero (en fases). */
  destacada: string;
}
export interface FasesUOpcionesData {
  intro: string;
  /** "fases" (una ruta, se hacen en orden) u "opciones" (caminos para elegir uno). */
  modo: string;
  items: FaseUOpcion[];
}

export const FASES_U_OPCIONES_SCHEMA = {
  type: "object",
  properties: {
    intro: str,
    modo: str,
    items: arrayOf(
      {
        nombre: str,
        etiqueta: str,
        objetivo: str,
        incluye: strArray,
        resultado: str,
        plazo: str,
        destacada: str,
      },
      ["nombre"],
    ),
  },
  required: ["items"],
} as const;
export const FASES_U_OPCIONES_EMPTY: FasesUOpcionesData = { intro: "", modo: "", items: [] };

export const FASE_VACIA: FaseUOpcion = {
  nombre: "",
  etiqueta: "",
  objetivo: "",
  incluye: [],
  resultado: "",
  plazo: "",
  destacada: "",
};

export type ModoDeFases = "fases" | "opciones";

/** El modo efectivo. Cualquier cosa que no diga «opciones» es una ruta de fases. */
export function modoDe(raw: string | null | undefined): ModoDeFases {
  const s = (raw ?? "").trim().toLowerCase();
  return s.startsWith("opc") || s.startsWith("opt") || s.startsWith("alt") ? "opciones" : "fases";
}

/** El número grande de cada tarjeta: 01, 02… en una ruta; A, B, C… cuando se elige. */
export function rotuloDeOrden(modo: ModoDeFases, i: number): string {
  if (modo === "opciones") {
    // Pasada la Z (nadie compara 27 caminos) se sigue con el número, en vez de pintar un símbolo raro.
    return i < 26 ? String.fromCharCode(65 + i) : String(i + 1);
  }
  return String(i + 1).padStart(2, "0");
}

/** Cuántas columnas por fila: dos tarjetas se leen mejor en dos que en tres con un hueco. */
export function columnasDeFases(n: number): 1 | 2 | 3 {
  if (n <= 1) return 1;
  if (n === 2 || n === 4) return 2;
  return 3;
}

function esSiTexto(v: string | null | undefined): boolean {
  const s = (v ?? "").trim().toLowerCase();
  return s === "si" || s === "sí" || s === "true" || s === "yes";
}

/** ¿La tarjeta está destacada? Mismo vocabulario que «recomendado». */
export function esDestacada(item: Pick<FaseUOpcion, "destacada"> | null | undefined): boolean {
  return esSiTexto(item?.destacada);
}
