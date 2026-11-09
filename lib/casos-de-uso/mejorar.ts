/**
 * lib/casos-de-uso/mejorar.ts — «Mejorar con IA» de las actividades de un caso elegido en la preventa. PURO y
 * client-safe (lo usan el paso, el agente y sus pruebas).
 *
 * Pedido de Elías (2026-11-08, décima vuelta, con Centauro Solutions): un agente al que el CSE le escribe una
 * instrucción en el momento («quita la capacitación, suma integración con WhatsApp»). El agente:
 *   - deja la lista de actividades del caso como quedaría con esa instrucción (solo de la biblioteca), y
 *   - si con eso quedan cosas por fuera, SUGIERE actividades aparte, de la biblioteca o nuevas, cada una con su porqué.
 * El CSE revisa la diferencia (lo que entra, sale o cambia), marca las sugeridas que quiere, y aplica o descarta. Nada
 * se guarda hasta aplicar: aplicar es un cambio más del caso (con «Deshacer»), editado a mano.
 *
 * Una sugerida que no está en la biblioteca no tiene horas: al aplicarla queda anotada en «Falta en la biblioteca»
 * (`sinActividad`), que ya dice que esa parte no tiene precio todavía.
 */
import { MAX_ACTIVIDADES_POR_CASO, sumarActividad, validarActividadesDelAgente, type ActividadDelCaso, type ActividadLigera, type CasoConActividades } from "./armado";

export const MAX_LARGO_DE_LA_INSTRUCCION = 600;
export const MAX_SUGERIDAS = 4;
export const MAX_LINEAS_DE_LA_MEJORA = 4;
const MAX_LARGO_DEL_SIN_ACTIVIDAD = 400;

/** Una actividad que el agente sugiere aparte. `actividadId` null: no está en la biblioteca. */
export interface ActividadSugerida {
  actividadId: string | null;
  nombre: string;
  porQue: string;
  sobreQue?: string;
}

/** Lo que propone el agente para las actividades del caso. */
export interface PropuestaDeMejora {
  actividades: ActividadDelCaso[];
  /** Qué cambió y por qué, en líneas cortas, para el CSE. */
  cambios: string[];
  sugeridas: ActividadSugerida[];
}

const texto = (t: unknown, max: number): string => (typeof t === "string" ? t.replace(/\s+/g, " ").trim().slice(0, max).trim() : "");
const clave = (a: Pick<ActividadDelCaso, "actividadId" | "sobreQue">) => `${a.actividadId}|${(a.sobreQue ?? "").trim().toLowerCase()}`;

/**
 * Lo que devolvió el agente, validado: actividades solo de la biblioteca (si no mandó ninguna válida, quedan las de hoy:
 * una instrucción que no se pudo cumplir no vacía el caso); las sugeridas de la biblioteca que ya están en la lista se
 * descartan, y una «nueva» que en realidad es de la biblioteca (por su nombre) se toma como de la biblioteca.
 */
export function leerPropuestaDeMejora(
  x: Record<string, unknown>,
  porId: ReadonlyMap<string, ActividadLigera>,
  actuales: readonly ActividadDelCaso[],
): PropuestaDeMejora {
  const propias = validarActividadesDelAgente(x.actividades, porId).actividades.map((a) => {
    // Las veces de las partes variables (una sola sesión de mapeo) se conservan si la actividad ya estaba.
    const igual = actuales.find((b) => clave(b) === clave(a));
    return igual?.partes && !a.partes ? { ...a, partes: igual.partes } : a;
  });
  const actividades = Array.isArray(x.actividades) && (x.actividades.length === 0 || propias.length) ? propias : [...actuales];
  const cambios = (Array.isArray(x.cambios) ? x.cambios : [])
    .map((c) => texto(c, 200))
    .filter(Boolean)
    .slice(0, MAX_LINEAS_DE_LA_MEJORA);
  const yaEstan = new Set(actividades.map(clave));
  /* Lo que la instrucción quitó no vuelve como sugerida (el simulacro con Centauro, 2026-11-08: «quita la capacitación»
     y la sugería de nuevo); el riesgo de quitarlo lo dice una línea de «cambios». */
  const quitadas = new Set(actuales.filter((a) => !yaEstan.has(clave(a)) && !actividades.some((b) => b.actividadId === a.actividadId)).map((a) => a.actividadId));
  const porNombre = new Map([...porId.values()].map((a) => [a.nombre.toLowerCase(), a]));
  const sugeridas: ActividadSugerida[] = [];
  const vistas = new Set<string>();
  for (const s of Array.isArray(x.sugeridas) ? x.sugeridas : []) {
    if (typeof s !== "object" || s === null || sugeridas.length >= MAX_SUGERIDAS) continue;
    const r = s as Record<string, unknown>;
    const nombre = texto(r.nombre, 160);
    const porQue = texto(r.porQue, 300);
    const sobreQue = texto(r.sobreQue, 120);
    const lib = porId.get(texto(r.actividadId, 80)) ?? porNombre.get(nombre.toLowerCase());
    if (!nombre && !lib) continue;
    const k = lib ? clave({ actividadId: lib.id, sobreQue }) : `nueva|${nombre.toLowerCase()}`;
    if (vistas.has(k) || (lib && yaEstan.has(k) && !lib.seRepite) || (lib && quitadas.has(lib.id))) continue;
    vistas.add(k);
    sugeridas.push({ actividadId: lib?.id ?? null, nombre: nombre || lib!.nombre, porQue, ...(sobreQue ? { sobreQue } : {}) });
  }
  return { actividades, cambios, sugeridas };
}

export type EstadoEnLaMejora = "igual" | "nueva" | "quitada" | "cambiada";

/** Una fila de la diferencia: la actividad (la nueva o, si salió, la de antes) y qué le pasa. */
export interface FilaDeLaMejora {
  actividad: ActividadDelCaso;
  estado: EstadoEnLaMejora;
  /** En una «cambiada»: cómo estaba. */
  antes?: ActividadDelCaso;
}

/**
 * Lo de hoy contra lo propuesto, en el orden de lo propuesto y con lo que sale al final. Dos filas son la misma
 * actividad si apuntan a la misma de la biblioteca sobre lo mismo; «cambiada» si cambian las veces o el nombre.
 */
export function diferenciaDeActividades(antes: readonly ActividadDelCaso[], despues: readonly ActividadDelCaso[]): FilaDeLaMejora[] {
  const libres = antes.map((a, i) => ({ a, i }));
  const filas: FilaDeLaMejora[] = [];
  for (const d of despues) {
    const j = libres.findIndex((x) => clave(x.a) === clave(d));
    if (j < 0) {
      filas.push({ actividad: d, estado: "nueva" });
      continue;
    }
    const [{ a }] = libres.splice(j, 1);
    const cambio = a.veces !== d.veces || a.nombre.trim() !== d.nombre.trim() || JSON.stringify(a.partes ?? {}) !== JSON.stringify(d.partes ?? {});
    filas.push(cambio ? { actividad: d, estado: "cambiada", antes: a } : { actividad: d, estado: "igual" });
  }
  for (const { a } of libres) filas.push({ actividad: a, estado: "quitada" });
  return filas;
}

/** Cuántas entran, salen y cambian: el resumen de la propuesta. */
export function resumenDeLaMejora(filas: readonly FilaDeLaMejora[]): { nuevas: number; quitadas: number; cambiadas: number } {
  return {
    nuevas: filas.filter((f) => f.estado === "nueva").length,
    quitadas: filas.filter((f) => f.estado === "quitada").length,
    cambiadas: filas.filter((f) => f.estado === "cambiada").length,
  };
}

/**
 * El caso con la mejora aplicada: las actividades propuestas, más las sugeridas que marcó el CSE (las de la biblioteca
 * entran como actividad; las nuevas, a «Falta en la biblioteca»). Queda editado a mano: la próxima personalización no lo
 * pisa sin preguntar.
 */
export function aplicarMejora<T extends CasoConActividades & { sinActividad?: string }>(
  caso: T,
  propuesta: Pick<PropuestaDeMejora, "actividades" | "sugeridas">,
  elegidas: ReadonlySet<number>,
  porId: ReadonlyMap<string, ActividadLigera>,
): T {
  let nuevo: T = { ...caso, actividades: propuesta.actividades.slice(0, MAX_ACTIVIDADES_POR_CASO), aMano: true };
  const faltan: string[] = [];
  propuesta.sugeridas.forEach((s, i) => {
    if (!elegidas.has(i)) return;
    const lib = s.actividadId ? porId.get(s.actividadId) : undefined;
    if (lib) {
      const conNombre = sumarActividad(nuevo, nuevo.actividades ?? [], lib, s.sobreQue ?? "");
      // Con el nombre que le dio el agente para este caso, si la sumó como fila nueva.
      const acts = conNombre.actividades ?? [];
      const ultima = acts[acts.length - 1];
      nuevo =
        ultima && ultima.actividadId === lib.id && acts.length > (nuevo.actividades ?? []).length && s.nombre
          ? { ...conNombre, actividades: [...acts.slice(0, -1), { ...ultima, nombre: s.nombre }] }
          : conNombre;
    } else if (s.nombre) {
      faltan.push(s.nombre);
    }
  });
  if (faltan.length) {
    const antes = (caso.sinActividad ?? "").trim();
    const sin = [antes, ...faltan.filter((f) => !antes.toLowerCase().includes(f.toLowerCase()))].filter(Boolean).join("; ");
    nuevo = { ...nuevo, sinActividad: sin.slice(0, MAX_LARGO_DEL_SIN_ACTIVIDAD) };
  }
  return nuevo;
}
