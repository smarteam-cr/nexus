/**
 * lib/escala/chequeo.ts — el cálculo del CHEQUEO de la escala. PURO.
 *
 * La escala se aplica de dos formas (su Parte 2): el diagnóstico, que recorre los criterios uno por
 * uno, y el chequeo, que ESTIMA el nivel de cada dimensión por mejor ajuste. Este archivo es la
 * versión exacta de «El cálculo del chequeo» de la especificación, pasos 3 a 6: con el nivel
 * estimado de cada dimensión —lo elige una persona, o lo propone la IA y una persona lo confirma—
 * calcula la capa, el departamento, sus puntajes y la ÚNICA recomendación.
 *
 * Lo que NO hace, a propósito:
 *   - Elegir el nivel de una dimensión (paso 2). Es mejor ajuste contra la matriz y lo decide quien
 *     conversa con el prospecto; la regla de «ante la duda, el más bajo» y «"no sé" es el más bajo»
 *     la aplica esa persona. Acá entra el nivel ya elegido.
 *   - Contar criterios. «Un chequeo no se completa con criterios»: los criterios que la exploración
 *     de venta repasa sirven para saber qué falta, nunca para mover este cálculo.
 *
 * Sin textos de la escala: los nombres entran con la escala publicada, y la razón de la
 * recomendación sale como datos, para que la diga la pantalla.
 *
 * Paridad: `puntajeDelTramo` es el `puntaje()` de docs/escala/pruebas_escala.py (chequeo.test.ts los
 * compara), y el ejemplo de la especificación —una base con dos dimensiones en Funcional y dos en
 * Inicial saca 35— es un caso fijo.
 */
import { dimensionAplica, type Perfil } from "./documento/perfil";
import type { ClaveDeCapa, Escala, Letra } from "./documento/tipos";
import { lugarEnElOrden, ordenDeDependencias } from "./vista";

const ORDEN_DE_LETRAS: readonly Letra[] = ["D", "I", "F", "E", "O"];
const CAPAS: readonly ClaveDeCapa[] = ["base", "produccion"];

const rango = (l: Letra): number => ORDEN_DE_LETRAS.indexOf(l);

/** El más bajo de dos niveles. */
export function nivelMasBajo(a: Letra, b: Letra): Letra {
  return rango(a) <= rango(b) ? a : b;
}

/** ¿`a` está por debajo de `b`? */
export function estaDebajo(a: Letra, b: Letra): boolean {
  return rango(a) < rango(b);
}

/**
 * El nivel siguiente para medir el avance: debajo de Funcional el siguiente es Funcional (Deficiente
 * e Inicial no tienen criterios de logro), y Óptimo no tiene siguiente.
 */
export function nivelSiguiente(l: Letra): Letra | null {
  if (l === "D" || l === "I") return "F";
  if (l === "F") return "E";
  if (l === "E") return "O";
  return null;
}

/** Donde empieza el tramo de cada nivel (especificación, paso 6). Óptimo vale 100 fijo. */
const TRAMO: Record<Exclude<Letra, "O">, number> = { D: 0, I: 20, F: 40, E: 60 };

/**
 * El puntaje de un tramo con su avance hacia el nivel siguiente: hacia abajo, y sin pasar de 19
 * mientras no se alcance el siguiente (paso 7). El avance es `mitades / (2 × n)`: en el chequeo cada
 * dimensión cuenta entera si ya llegó al nivel siguiente y a mitad de camino si no, así que el
 * avance siempre es un número de mitades. Se cuenta en enteros para no depender de la coma flotante
 * (el Python usa `Fraction`).
 */
export function puntajeDelTramo(nivel: Letra, mitades: number, n: number): number {
  if (nivel === "O") return 100;
  if (n <= 0) return TRAMO[nivel];
  return TRAMO[nivel] + Math.min(Math.floor((10 * mitades) / n), 19);
}

/** Una dimensión, a mitad de su tramo (paso 4): Deficiente 10, Inicial 30, Funcional 50, Eficiente 70, Óptimo 100. */
export function puntajeEstimado(nivel: Letra): number {
  return puntajeDelTramo(nivel, 1, 1);
}

// ── Lo que entra ──────────────────────────────────────────────────────────────

export interface DimensionParaChequeo {
  id: string;
  nombre: string;
  capa: ClaveDeCapa;
  /** No aplica al perfil: no se pregunta y no entra en la cuenta de su capa (paso 1). */
  aplica: boolean;
}

export interface AreaParaChequeo {
  id: string;
  nombre: string;
  dimensiones: DimensionParaChequeo[];
  /** Los ids de cada capa en su orden de dependencias; null si no se pudo saber (por ejemplo, sin el cierre). */
  orden: Record<ClaveDeCapa, string[] | null>;
}

export interface Estimado {
  nivel: Letra;
  /** Una respuesta dejó ver un riesgo de esta dimensión: no se estima por encima de Funcional (paso 5). */
  riesgoALaVista?: boolean;
}

/**
 * Un área tal como la necesita el cálculo, desde la escala publicada (con la edición ya aplicada,
 * si la hay). El orden de dependencias depende de cómo se cierra la venta: sin el cierre, o si el
 * orden no nombra a todas sus dimensiones, queda en null y el desempate va por identificador.
 */
export function areaParaChequeo(escala: Escala, areaId: string, perfil: Perfil): AreaParaChequeo | null {
  const area = escala.areas.find((a) => a.id === areaId);
  if (!area) return null;

  const orden = (clave: ClaveDeCapa): string[] | null => {
    const capa = escala.capas.find((c) => c.clave === clave);
    if (!capa) return null;
    const filas = ordenDeDependencias(escala.dependencias, area.nombre, capa.nombre, perfil.cierre);
    if (filas.length !== 1) return null;
    const conLugar = area.dimensiones
      .filter((d) => d.capa === clave)
      .map((d) => ({ id: d.id, lugar: lugarEnElOrden(filas[0], d) }));
    if (conLugar.some((x) => x.lugar === null)) return null;
    return conLugar.sort((a, b) => (a.lugar ?? 0) - (b.lugar ?? 0)).map((x) => x.id);
  };

  return {
    id: area.id,
    nombre: area.nombre,
    dimensiones: area.dimensiones.map((d) => ({
      id: d.id,
      nombre: d.nombre,
      capa: d.capa,
      aplica: dimensionAplica(d, perfil),
    })),
    orden: { base: orden("base"), produccion: orden("produccion") },
  };
}

// ── Lo que sale ───────────────────────────────────────────────────────────────

export interface DimensionDelChequeo {
  id: string;
  nombre: string;
  capa: ClaveDeCapa;
  aplica: boolean;
  /** null = todavía sin estimar, o no aplica. */
  nivel: Letra | null;
  puntaje: number | null;
  /** El nivel elegido estaba por encima de Funcional y se bajó por un riesgo a la vista. */
  topadaPorRiesgo: boolean;
}

export interface CapaDelChequeo {
  clave: ClaveDeCapa;
  /** null si le falta estimar alguna dimensión (o si ninguna aplica). */
  nivel: Letra | null;
  puntaje: number | null;
  /** Cuántas de sus dimensiones ya están en el nivel siguiente al de la capa, y cuántas cuentan. */
  enElSiguiente: number;
  cuentan: number;
}

export interface AreaDelChequeo {
  id: string;
  nombre: string;
  dimensiones: DimensionDelChequeo[];
  capas: Record<ClaveDeCapa, CapaDelChequeo>;
  /** El nivel del departamento: el de su capa más baja. null mientras falte estimar algo. */
  nivel: Letra | null;
  puntaje: number | null;
  /** Las dimensiones que aplican y todavía no tienen nivel: sin ellas no se sabe cuál es la más débil. */
  faltan: string[];
  /**
   * Hasta dónde se empuja: Funcional para un prospecto, o el nivel siguiente si ya llegó (paso 6).
   * null en Óptimo (se sostiene) o mientras falte estimar algo.
   */
  objetivo: Letra | null;
}

export interface RazonDeLaRecomendacion {
  /** Se midió una sola área, o esta es la más baja, o empató y es la que se eligió primero. */
  area: "unica" | "la-mas-baja" | "empate-la-primera";
  /**
   * Por qué esa capa: la única con algo debajo del objetivo, la más baja, o el empate (la base va
   * primero debajo de Funcional; la producción, de Funcional para arriba).
   */
  capa: "unica-con-pendientes" | "la-mas-baja" | "empate-base" | "empate-produccion";
  /** Por qué esa dimensión: la más baja de su capa, o el desempate por el orden de dependencias. */
  dimension: "la-mas-baja" | "empate-por-orden" | "empate-sin-orden";
}

export type Recomendacion =
  | {
      tipo: "trabajar";
      areaId: string;
      capa: ClaveDeCapa;
      dimensionId: string;
      objetivo: Letra;
      razon: RazonDeLaRecomendacion;
    }
  /** El departamento ya llegó a su objetivo: sostenerlo y volver a medir. */
  | { tipo: "sostener"; areaId: string };

export interface ResultadoDelChequeo {
  areas: AreaDelChequeo[];
  /** Todas las áreas tienen todas sus dimensiones estimadas. */
  completo: boolean;
  /**
   * Una sola para todas las áreas MEDIDAS (paso 6): las que tienen sus dimensiones estimadas. Un
   * área que se sumó y todavía no se estimó no está medida: no entra hasta que se estime. null si
   * ninguna está completa.
   */
  recomendacion: Recomendacion | null;
  /** La recomendación sale de algunas áreas: otras están en juego y todavía sin estimar. */
  parcial: boolean;
}

function calcularArea(area: AreaParaChequeo, estimados: Readonly<Record<string, Estimado | undefined>>): AreaDelChequeo {
  const dimensiones: DimensionDelChequeo[] = area.dimensiones.map((d) => {
    const est = d.aplica ? estimados[d.id] : undefined;
    if (!est) return { ...d, nivel: null, puntaje: null, topadaPorRiesgo: false };
    const topada = !!est.riesgoALaVista && estaDebajo("F", est.nivel);
    const nivel: Letra = topada ? "F" : est.nivel;
    return { ...d, nivel, puntaje: puntajeEstimado(nivel), topadaPorRiesgo: topada };
  });

  const faltan = dimensiones.filter((d) => d.aplica && d.nivel === null).map((d) => d.id);

  /** Nivel y puntaje de un grupo de dimensiones: el de la más débil, con el avance hacia el siguiente. */
  const deGrupo = (grupo: DimensionDelChequeo[]) => {
    const cuentan = grupo.filter((d) => d.aplica);
    if (cuentan.length === 0 || cuentan.some((d) => d.nivel === null)) {
      return { nivel: null, puntaje: null, enElSiguiente: 0, cuentan: cuentan.length };
    }
    const niveles = cuentan.map((d) => d.nivel as Letra);
    const nivel = niveles.reduce(nivelMasBajo);
    const sig = nivelSiguiente(nivel);
    const enElSiguiente = sig ? niveles.filter((l) => !estaDebajo(l, sig)).length : cuentan.length;
    const mitades = sig ? niveles.reduce((s, l) => s + (estaDebajo(l, sig) ? 1 : 2), 0) : 2 * cuentan.length;
    return { nivel, puntaje: puntajeDelTramo(nivel, mitades, cuentan.length), enElSiguiente, cuentan: cuentan.length };
  };

  const capas = Object.fromEntries(
    CAPAS.map((clave) => [clave, { clave, ...deGrupo(dimensiones.filter((d) => d.capa === clave)) }]),
  ) as Record<ClaveDeCapa, CapaDelChequeo>;

  const depto = faltan.length === 0 ? deGrupo(dimensiones) : null;
  const nivel = depto?.nivel ?? null;
  const objetivo = nivel === null ? null : estaDebajo(nivel, "F") ? "F" : nivelSiguiente(nivel);

  return {
    id: area.id,
    nombre: area.nombre,
    dimensiones,
    capas,
    nivel,
    puntaje: depto?.puntaje ?? null,
    faltan,
    objetivo,
  };
}

/**
 * El chequeo de las áreas en juego. `areas` va en el orden en que el prospecto las eligió: a igual
 * nivel, la recomendación sale de la primera.
 */
export function calcularChequeo(
  areas: readonly AreaParaChequeo[],
  estimados: Readonly<Record<string, Estimado | undefined>>,
): ResultadoDelChequeo {
  const calculadas = areas.map((a) => calcularArea(a, estimados));
  const medidas = calculadas.filter((a) => a.nivel !== null);
  const completo = calculadas.length > 0 && medidas.length === calculadas.length;
  return {
    areas: calculadas,
    completo,
    recomendacion: medidas.length > 0 ? recomendar(areas, medidas) : null,
    parcial: medidas.length > 0 && !completo,
  };
}

function recomendar(entradas: readonly AreaParaChequeo[], areas: AreaDelChequeo[]): Recomendacion {
  // 1. Entre áreas: la de nivel más bajo; a igual nivel, la que se eligió primero.
  const masBaja = areas.reduce((min, a) => (estaDebajo(a.nivel as Letra, min.nivel as Letra) ? a : min));
  const empatadas = areas.filter((a) => a.nivel === masBaja.nivel).length;
  const razonArea: RazonDeLaRecomendacion["area"] =
    areas.length === 1 ? "unica" : empatadas > 1 ? "empate-la-primera" : "la-mas-baja";

  const objetivo = masBaja.objetivo;
  if (objetivo === null) return { tipo: "sostener", areaId: masBaja.id };

  // 2. Solo entran las dimensiones debajo del objetivo de su departamento.
  const entran = masBaja.dimensiones.filter((d) => d.aplica && d.nivel !== null && estaDebajo(d.nivel, objetivo));
  if (entran.length === 0) return { tipo: "sostener", areaId: masBaja.id };

  // 3. La capa más baja entre las que tienen alguna que entra; si empatan, la base debajo de
  //    Funcional y la producción de Funcional para arriba.
  const conPendientes = CAPAS.filter((c) => entran.some((d) => d.capa === c));
  let capa: ClaveDeCapa;
  let razonCapa: RazonDeLaRecomendacion["capa"];
  if (conPendientes.length === 1) {
    capa = conPendientes[0];
    razonCapa = "unica-con-pendientes";
  } else {
    const base = masBaja.capas.base.nivel as Letra;
    const prod = masBaja.capas.produccion.nivel as Letra;
    if (base !== prod) {
      capa = estaDebajo(base, prod) ? "base" : "produccion";
      razonCapa = "la-mas-baja";
    } else if (estaDebajo(base, "F")) {
      capa = "base";
      razonCapa = "empate-base";
    } else {
      capa = "produccion";
      razonCapa = "empate-produccion";
    }
  }

  // 4. Dentro de la capa, la dimensión más baja; entre las del mismo nivel, la que va antes en el
  //    orden de dependencias. El puntaje no decide.
  const deLaCapa = entran.filter((d) => d.capa === capa);
  const minimo = deLaCapa.map((d) => d.nivel as Letra).reduce(nivelMasBajo);
  const candidatas = deLaCapa.filter((d) => d.nivel === minimo);
  let elegida = candidatas[0];
  let razonDimension: RazonDeLaRecomendacion["dimension"] = "la-mas-baja";
  if (candidatas.length > 1) {
    const orden = entradas.find((a) => a.id === masBaja.id)?.orden[capa] ?? null;
    if (orden) {
      elegida = [...candidatas].sort((a, b) => orden.indexOf(a.id) - orden.indexOf(b.id))[0];
      razonDimension = "empate-por-orden";
    } else {
      elegida = [...candidatas].sort((a, b) => a.id.localeCompare(b.id, "es", { numeric: true }))[0];
      razonDimension = "empate-sin-orden";
    }
  }

  return {
    tipo: "trabajar",
    areaId: masBaja.id,
    capa,
    dimensionId: elegida.id,
    objetivo,
    razon: { area: razonArea, capa: razonCapa, dimension: razonDimension },
  };
}
