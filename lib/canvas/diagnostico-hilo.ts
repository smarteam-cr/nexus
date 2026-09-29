/**
 * lib/canvas/diagnostico-hilo.ts — el ORDEN de los códigos del diagnóstico.
 *
 * Medido con FUNDAUNA (2026-09-28): la IA numeró los objetivos en el orden en que se le ocurrieron,
 * así que quedaron cuantitativos OBJ-01 y OBJ-06, y cualitativos 02, 03, 04, 05, 07. En pantalla se
 * agrupan por tipo, y la serie salteada se lee como un error y no sirve para referenciar.
 *
 * No se le pide al modelo que lo haga bien: se ORDENA acá, por código. Cuantitativos primero y
 * cualitativos después, cada grupo en el orden que traían, numerados seguidos (OBJ-01…). Y como los
 * códigos se citan en otras secciones (las preguntas, la brecha), se reescriben TODAS las menciones
 * con el mismo mapa — un OBJ-06 que pasa a ser OBJ-02 no puede seguir citado como OBJ-06.
 *
 * Módulo PURO: lo usa el runner después de generar; se testea sin base.
 */

interface Objetivo {
  id?: unknown;
  tipo?: unknown;
  [k: string]: unknown;
}

const esCualitativo = (tipo: unknown) => typeof tipo === "string" && /cuali/i.test(tipo);
const numeroDe = (id: unknown): number | null => {
  const m = typeof id === "string" ? /^\s*OBJ-?\s*(\d+)\s*$/i.exec(id) : null;
  return m ? Number(m[1]) : null;
};
const codigo = (n: number) => `OBJ-${String(n).padStart(2, "0")}`;

/** Reescribe cada «OBJ-n» de un texto con el mapa (de número viejo a código nuevo). */
function reescribir(texto: string, mapa: Map<number, string>): string {
  return texto.replace(/\bOBJ-?\s?(\d+)\b/gi, (todo, n: string) => mapa.get(Number(n)) ?? todo);
}

function reescribirTodo(valor: unknown, mapa: Map<number, string>): unknown {
  if (typeof valor === "string") return reescribir(valor, mapa);
  if (Array.isArray(valor)) return valor.map((v) => reescribirTodo(v, mapa));
  if (valor && typeof valor === "object") {
    return Object.fromEntries(Object.entries(valor as Record<string, unknown>).map(([k, v]) => [k, reescribirTodo(v, mapa)]));
  }
  return valor;
}

/**
 * Ordena y renumera los objetivos y reescribe sus menciones en todas las secciones.
 * Devuelve las secciones nuevas (no toca las que recibe). Sin objetivos, las devuelve igual.
 */
export function ordenarObjetivosDelDiagnostico<T extends { key: string; data: unknown }>(secciones: readonly T[]): T[] {
  const sec = secciones.find((s) => s.key === "objetivos");
  const lista = (sec?.data as { objetivos?: Objetivo[] } | undefined)?.objetivos;
  if (!sec || !Array.isArray(lista) || lista.length === 0) return [...secciones];

  const ordenados = [
    ...lista.filter((o) => !esCualitativo(o.tipo)),
    ...lista.filter((o) => esCualitativo(o.tipo)),
  ];
  const nuevoDe = new Map(ordenados.map((o, i) => [o, codigo(i + 1)] as const));
  const renumerados = ordenados.map((o) => ({ ...o, id: nuevoDe.get(o)! }));
  // Si dos traían el mismo número, las menciones apuntan al PRIMERO QUE SE ESCRIBIÓ (orden original):
  // un mapa no puede decir dos cosas a la vez.
  const mapa = new Map<number, string>();
  for (const o of lista) {
    const viejo = numeroDe(o.id);
    if (viejo !== null && !mapa.has(viejo)) mapa.set(viejo, nuevoDe.get(o)!);
  }

  return secciones.map((s) => {
    if (s === sec) return { ...s, data: { ...(s.data as object), objetivos: renumerados } };
    return { ...s, data: reescribirTodo(s.data, mapa) };
  });
}
