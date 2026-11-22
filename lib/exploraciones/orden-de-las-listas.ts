/**
 * lib/exploraciones/orden-de-las-listas.ts — «La IA propone, tú ordenas» (Elías, 22 nov, noche). Puro.
 *
 * En la lista de una casilla del Resumen (metas, planes, retos, tiempos, qué pasa si no actúa, qué cambia si lo logra),
 * Nexus sugiere, cuando se le pide:
 *   · JUNTAR puntos que dicen la misma idea con otras palabras, o que son del mismo departamento o flujo, en uno solo con
 *     un texto nuevo. El texto no puede traer una cifra que no esté en los puntos que junta, ni dar vuelta un rango
 *     (`cifrasQueNoCuadran`). Nada guardado se pierde al juntar (`sePuedenJuntar`): dos metas con cifras distintas, dos
 *     retos con dimensiones distintas o dos puntos de equipos distintos no se juntan; el punto que queda toma las cifras,
 *     la dimensión y el equipo del que los tenía. Se mira con lo guardado al sugerir y con la lista de la persona al usar.
 *   · SUBIR un punto que importa para proponer y quedó fuera de los primeros 4 (los que ve el Resumen).
 * Cada sugerencia la usa o la descarta la persona, en la lista, antes de guardar. Nada se guarda solo, y el orden es el de
 * la lista guardada: no hay un campo aparte.
 *
 * Las sugerencias señalan los puntos por su texto normalizado (`claveDeItemDeLista`), no por su posición: si la persona ya
 * movió o cambió un punto, la sugerencia que lo nombra deja de aplicarse en vez de tocar otro.
 */
import { definicionDe, type ClaveDeCasilla, type Meta, type Reto } from "./casillas";
import { claveDeItemDeLista } from "./contenido";
import { cifrasDeLaMeta, cifrasQueNoCuadran, lineasDe, PRIMERAS_A_LA_VISTA } from "./lineas-del-resumen";

/** Las casillas cuya lista se ordena con sugerencias de Nexus. Quién decide no: juntar personas no tiene sentido. */
export const CASILLAS_CON_ORDEN = ["metas", "planes", "retos", "tiempos", "consecuencias", "implicaciones"] as const satisfies readonly ClaveDeCasilla[];
export type ClaveConOrden = (typeof CASILLAS_CON_ORDEN)[number];
export const tieneOrden = (clave: string): clave is ClaveConOrden => (CASILLAS_CON_ORDEN as readonly string[]).includes(clave);

/** Con menos puntos no hay qué juntar ni qué subir. */
export const MINIMO_PARA_SUGERIR = 3;
const MAX_JUNTAR = 6;
const MAX_SUBIR = PRIMERAS_A_LA_VISTA;
export const MAX_TEXTO_DE_UNA_FUSION = 300;

export type SugerenciaDeOrden =
  | { id: string; tipo: "juntar"; claves: string[]; textos: string[]; texto: string; porque: string }
  | { id: string; tipo: "subir"; clave: string; textoDelPunto: string; porque: string };

/** Un punto de la lista como lo lee el agente: su clave estable, la línea que se ve y, en una meta, su «qué» solo. */
interface PuntoParaOrdenar {
  clave: string;
  linea: string;
  que: string;
  cifras: string;
  item: unknown;
}

export function puntosParaOrdenar(clave: ClaveConOrden, valor: unknown): PuntoParaOrdenar[] {
  const items = Array.isArray(valor) ? (valor as unknown[]) : [];
  const lineas = lineasDe(clave, valor);
  return items.map((x, i) => ({
    clave: claveDeItemDeLista(clave, x),
    linea: lineas[i] ?? "",
    que: definicionDe(clave).tipo === "metas" ? (x as Meta).que : definicionDe(clave).tipo === "retos" ? (x as Reto).texto : String(x),
    cifras: definicionDe(clave).tipo === "metas" ? cifrasDeLaMeta(x as Meta) : "",
    item: x,
  }));
}

/** Cuántos valores distintos y no vacíos hay. */
const distintos = (xs: readonly (string | undefined)[]) => new Set(xs.map((x) => x?.trim() ?? "").filter(Boolean)).size;

/**
 * ¿Se pueden juntar sin perder nada guardado? Un solo valor de cifras (metas), de dimensión (retos) y de equipo (los dos):
 * el punto que queda solo puede llevar uno. Las listas de texto, siempre.
 */
export function sePuedenJuntar(clave: ClaveConOrden, items: readonly unknown[]): boolean {
  const tipo = definicionDe(clave).tipo;
  if (tipo === "metas") {
    const ms = items as Meta[];
    return distintos(ms.map((m) => cifrasDeLaMeta(m))) <= 1 && distintos(ms.map((m) => m.equipo)) <= 1;
  }
  if (tipo === "retos") {
    const rs = items as Reto[];
    return distintos(rs.map((r) => r.dimensionId)) <= 1 && distintos(rs.map((r) => r.equipo)) <= 1;
  }
  return true;
}

export const REGLAS_DEL_ORDEN = `Ayudas a ordenar una lista del Resumen de una preventa de Smarteam (una agencia de HubSpot). La lista es lo que el equipo confirmó de UNA empresa, numerada en el orden que dejó la persona. Los 4 primeros son los que ve el Resumen. No reescribes la lista: SUGIERES, y la persona decide.

Sugiere dos cosas:
1. JUNTAR: puntos que dicen la misma idea con otras palabras, o que pertenecen al mismo departamento o flujo (ventas, crédito y cobro, marketing, servicio, e-commerce, TI, operación…). Para cada grupo, escribe el texto del punto que queda: una línea de unas 15 palabras, que abre con el departamento si lo hay («Crédito y cobro: …»). Solo con lo que dicen esos puntos: ninguna cifra, fecha, nombre ni conclusión que no esté ahí, y ninguna cifra al revés. En una meta, escribe solo QUÉ se quiere lograr: sus cifras (hoy, meta, para cuándo) las conserva Nexus aparte.
2. SUBIR: puntos que están del 5 en adelante y que importan más para proponer que alguno de los 4 primeros (el problema o la meta de fondo, lo que tiene cifras que lo dimensionan). Como mucho 4.

Si la lista ya está bien, no sugieras nada. Un punto va en un solo grupo. Cada sugerencia lleva su porqué en una frase corta.

Responde SOLO con un objeto JSON, sin texto antes ni después:
{"juntar":[{"puntos":[2,5],"texto":"…","porque":"…"}],"subir":[{"punto":7,"porque":"…"}]}`;

/** El mensaje del usuario: la empresa (solo su nombre), la casilla y sus puntos numerados. */
export function mensajeParaOrdenar(empresa: string, clave: ClaveConOrden, puntos: readonly PuntoParaOrdenar[]): string {
  const filas = puntos.map((p, i) => `${i + 1}. ${p.linea}`).join("\n");
  return `Empresa: ${empresa}\nLista: ${definicionDe(clave).etiqueta}\n\n${filas}`;
}

const enteros = (x: unknown): number[] => (Array.isArray(x) ? x.filter((n): n is number => Number.isInteger(n)) : []);
const texto = (x: unknown, max: number) => (typeof x === "string" ? x.trim().replace(/^[-•*]\s+/, "").slice(0, max) : "");

/**
 * Lo que devolvió el agente, comprobado: solo grupos de puntos que existen, sin repetir un punto, con un texto que no
 * inventa ni da vuelta cifras; y solo subidas de puntos que están fuera de los primeros 4. Lo que no pasa se descarta.
 */
export function leerSugerenciasDeOrden(clave: ClaveConOrden, o: Record<string, unknown>, puntos: readonly PuntoParaOrdenar[]): SugerenciaDeOrden[] {
  const usados = new Set<number>();
  const out: SugerenciaDeOrden[] = [];
  const esMeta = definicionDe(clave).tipo === "metas";
  for (const g of (Array.isArray(o.juntar) ? o.juntar : []).slice(0, MAX_JUNTAR)) {
    if (!g || typeof g !== "object") continue;
    const r = g as Record<string, unknown>;
    const idx = [...new Set(enteros(r.puntos).map((n) => n - 1))].filter((i) => i >= 0 && i < puntos.length).sort((a, b) => a - b);
    const t = texto(r.texto, MAX_TEXTO_DE_UNA_FUSION);
    if (idx.length < 2 || !t || idx.some((i) => usados.has(i))) continue;
    const juntos = idx.map((i) => puntos[i]);
    // Nada guardado se pierde: ni dos cifras, ni dos dimensiones, ni dos equipos en el punto que queda.
    if (!sePuedenJuntar(clave, juntos.map((p) => p.item))) continue;
    const c = cifrasQueNoCuadran(
      juntos.map((p) => p.linea),
      [esMeta ? `${t} ${juntos.find((p) => p.cifras)?.cifras ?? ""}` : t],
    );
    if (c.inventadas.length || c.invertidas.length) continue;
    idx.forEach((i) => usados.add(i));
    out.push({ id: `juntar:${idx.join("-")}`, tipo: "juntar", claves: juntos.map((p) => p.clave), textos: juntos.map((p) => p.linea), texto: t, porque: texto(r.porque, 200) });
  }
  let subidas = 0;
  for (const s of Array.isArray(o.subir) ? o.subir : []) {
    if (subidas >= MAX_SUBIR || !s || typeof s !== "object") continue;
    const r = s as Record<string, unknown>;
    const i = Number.isInteger(r.punto) ? (r.punto as number) - 1 : -1;
    if (i < PRIMERAS_A_LA_VISTA || i >= puntos.length || usados.has(i)) continue;
    usados.add(i);
    subidas++;
    out.push({ id: `subir:${i}`, tipo: "subir", clave: puntos[i].clave, textoDelPunto: puntos[i].linea, porque: texto(r.porque, 200) });
  }
  return out;
}

/**
 * Aplica una sugerencia a la lista que se está editando. null si ya no se puede: algún punto que nombra ya no está (se
 * cambió el texto o se quitó), o en la lista de la persona ya tienen cifras, dimensiones o equipos distintos. JUNTAR deja
 * el punto nuevo donde estaba el primero de los que junta, con las cifras, la dimensión y el equipo del que los tenía;
 * SUBIR lo lleva al primer lugar.
 */
export function aplicarSugerenciaDeOrden<T>(clave: ClaveConOrden, lista: readonly T[], s: SugerenciaDeOrden): T[] | null {
  const posicion = (k: string) => lista.findIndex((x) => claveDeItemDeLista(clave, x) === k);
  if (s.tipo === "subir") {
    const i = posicion(s.clave);
    if (i < 0) return null;
    return [lista[i], ...lista.filter((_, j) => j !== i)];
  }
  const idx = s.claves.map(posicion);
  if (idx.some((i) => i < 0) || new Set(idx).size !== idx.length) return null;
  if (!sePuedenJuntar(clave, idx.map((i) => lista[i]))) return null;
  const primero = Math.min(...idx);
  const tipo = definicionDe(clave).tipo;
  let nuevo: T;
  if (tipo === "metas") {
    const metas = [...idx].sort((a, b) => a - b).map((i) => lista[i] as unknown as Meta);
    const conCifras = metas.find((m) => cifrasDeLaMeta(m)) ?? metas[0];
    const equipo = metas.find((m) => m.equipo)?.equipo;
    nuevo = { ...metas[0], actual: conCifras.actual, objetivo: conCifras.objetivo, para: conCifras.para, ...(equipo ? { equipo } : {}), que: s.texto } as unknown as T;
  } else if (tipo === "retos") {
    const retos = [...idx].sort((a, b) => a - b).map((i) => lista[i] as unknown as Reto);
    const dimensionId = retos.find((r) => r.dimensionId)?.dimensionId;
    const equipo = retos.find((r) => r.equipo)?.equipo;
    nuevo = { ...retos[0], ...(dimensionId ? { dimensionId } : {}), ...(equipo ? { equipo } : {}), texto: s.texto } as unknown as T;
  } else {
    nuevo = s.texto as unknown as T;
  }
  return lista.flatMap((x, j) => (j === primero ? [nuevo] : idx.includes(j) ? [] : [x]));
}
