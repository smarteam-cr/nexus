/**
 * lib/escala/datos/editar.ts — un cambio del editor sobre los datos del borrador. PURO.
 *
 * El editor de `/escala/borrador/[área]` cambia una cosa por vez: un criterio (su texto, cómo se
 * verifica, sus marcas y lo que requiere), un nivel (su frase y su resultado), una dimensión (su
 * nombre, pregunta, descripción y costo de quedarse), o agrega un criterio a un nivel. Lo hace sobre
 * la MATRIZ, la escala general; lo que dice una edición se cambia, por ahora, con el `.md`.
 *
 * ── LA GARANTÍA ──────────────────────────────────────────────────────────────
 * Después de cambiar, los datos nuevos tienen que generar un `.md` que se vuelve a importar IGUAL y
 * que el lector entiende. Así un texto que cambiaría cómo se lee la escala (un salto de línea, una
 * etiqueta escrita a mano, una pregunta que empieza como una lista) no entra: se rechaza con su porqué.
 *
 * Retirar un criterio no está acá a propósito: un identificador que se va se anota en la
 * especificación («Identificadores retirados»), y eso va con el `.md` y el script.
 */
import { ErrorDeFormato, VERIFICACIONES, type MarcaDePerfil, type Verificacion } from "@/lib/escala/documento/tipos";
import { escalaDeLosDatos, generarMarkdown } from "./generar";
import { importarEscala } from "./importar";
import type { CriterioDeLaEscala, DimensionDeLaMatriz, EscalaDatos, NivelDeLaMatriz } from "./tipos";
import { ErrorDelBorrador } from "./versiones";

export const MARCAS_DE_PERFIL: readonly MarcaDePerfil[] = ["venta con equipo", "venta sin vendedor", "cliente recurrente", "recompra", "relación continua", "tráfico suficiente"];

interface CamposDelCriterio {
  texto: string;
  verificacion: Verificacion;
  riesgo: boolean;
  habito: boolean;
  perfil: MarcaDePerfil | null;
  requiere: string[];
}

export type CambioDelEditor =
  | ({ tipo: "criterio"; id: string } & CamposDelCriterio)
  | ({ tipo: "nuevo-criterio"; nivel: string } & CamposDelCriterio)
  | { tipo: "nivel"; id: string; frase: string; resultado: string | null }
  | { tipo: "dimension"; id: string; nombre: string; pregunta: string; descripcion: string | null; costoDeQuedarse: string };

const ID_DE_CRITERIO = /^\d+\.\d+\.[DIFEO]\d+$/;

/** Una línea de texto: sin saltos ni espacios de más. Vacío = null (si el campo lo admite). */
function linea(valor: string | null, que: string, opcional: true): string | null;
function linea(valor: string | null, que: string, opcional?: false): string;
function linea(valor: string | null, que: string, opcional = false): string | null {
  const t = (valor ?? "").replace(/\s+/g, " ").trim();
  if (!t) {
    if (opcional) return null;
    throw new ErrorDelBorrador(`Falta ${que}.`);
  }
  if (t.includes("`")) throw new ErrorDelBorrador(`${que[0].toUpperCase()}${que.slice(1)} no puede llevar el carácter «\`»: es el de las etiquetas.`);
  return t;
}

function camposDelCriterio(c: CamposDelCriterio): Omit<CriterioDeLaEscala, "id"> {
  if (!(VERIFICACIONES as readonly string[]).includes(c.verificacion)) throw new ErrorDelBorrador(`«${c.verificacion}» no es una forma de verificación.`);
  if (c.perfil !== null && !MARCAS_DE_PERFIL.includes(c.perfil)) throw new ErrorDelBorrador(`«${c.perfil}» no es una marca de perfil.`);
  const requiere = [...new Set(c.requiere.map((x) => x.trim()).filter(Boolean))];
  const mal = requiere.filter((x) => !ID_DE_CRITERIO.test(x));
  if (mal.length) throw new ErrorDelBorrador(`${mal.join(", ")} no ${mal.length === 1 ? "es un identificador" : "son identificadores"} de criterio (como 1.5.F1).`);
  return { texto: linea(c.texto, "el texto del criterio"), verificacion: c.verificacion, riesgo: !!c.riesgo, habito: !!c.habito, perfil: c.perfil, requiere };
}

/** Las dimensiones de la matriz, con su nivel, para buscar por identificador. */
function dimensionesDe(datos: EscalaDatos): DimensionDeLaMatriz[] {
  return datos.partes.flatMap((p) => (p.tipo === "matriz" ? p.areas.flatMap((a) => a.capas.flatMap((c) => c.dimensiones)) : []));
}

function nivelDe(datos: EscalaDatos, id: string): { dim: DimensionDeLaMatriz; nivel: NivelDeLaMatriz } {
  const m = /^(\d+\.\d+)\.([DIFEO])$/.exec(id);
  const dim = m ? dimensionesDe(datos).find((d) => d.id === m[1]) : undefined;
  const nivel = dim?.niveles.find((n) => n.letra === m![2]);
  if (!dim || !nivel) throw new ErrorDelBorrador(`La escala no tiene el nivel ${id}.`);
  return { dim, nivel };
}

/** Todos los identificadores de criterio en uso: los de la matriz y los propios de cada edición. */
function idsEnUso(datos: EscalaDatos): Set<string> {
  const out = new Set<string>();
  for (const p of datos.partes) {
    if (p.tipo === "matriz") for (const d of p.areas.flatMap((a) => a.capas.flatMap((c) => c.dimensiones))) for (const n of d.niveles) for (const c of n.criterios) out.add(c.id);
    if (p.tipo === "ediciones") {
      for (const e of p.ediciones) for (const a of e.areas) for (const d of a.dimensiones) for (const n of d.niveles) for (const c of n.criterios) out.add(c.id);
    }
  }
  return out;
}

/**
 * El identificador de un criterio nuevo en un nivel: el número que sigue al más alto de ese nivel en
 * la matriz, saltando los que ya se usan y los retirados (que no se vuelven a usar). Los de la
 * matriz van del 1 al 99; del 101 en adelante son de las ediciones.
 */
export function nuevoIdDeCriterio(datos: EscalaDatos, nivelId: string, retirados: readonly string[]): string {
  const { nivel } = nivelDe(datos, nivelId);
  const enUso = idsEnUso(datos);
  const fuera = new Set(retirados);
  const numeros = nivel.criterios.map((c) => Number(c.id.slice(nivelId.length)));
  for (let n = Math.max(0, ...numeros) + 1; n < 100; n++) {
    const id = `${nivelId}${n}`;
    if (!enUso.has(id) && !fuera.has(id)) return id;
  }
  throw new ErrorDelBorrador(`El nivel ${nivelId} no tiene más números libres.`);
}

/**
 * Iguales por contenido, sin mirar el orden de las claves: los datos que vuelven de la base (JSONB)
 * traen las claves en otro orden que los recién importados.
 */
function iguales(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === (b as unknown[]).length && a.every((x, i) => iguales(x, (b as unknown[])[i]));
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && iguales((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/**
 * Aplica un cambio del editor y devuelve los datos nuevos (los de entrada no se tocan). Lanza
 * `ErrorDelBorrador` si lo pedido no existe o si cambiaría cómo se lee la escala.
 */
export function aplicarCambioDelEditor(datos: EscalaDatos, cambio: CambioDelEditor, opts: { retirados: readonly string[] }): { datos: EscalaDatos; id: string } {
  const nuevos = structuredClone(datos);
  let id: string;
  switch (cambio.tipo) {
    case "criterio": {
      const m = /^(\d+\.\d+\.[DIFEO])\d+$/.exec(cambio.id);
      if (!m) throw new ErrorDelBorrador(`«${cambio.id}» no es un criterio.`);
      const { nivel } = nivelDe(nuevos, m[1]);
      const i = nivel.criterios.findIndex((c) => c.id === cambio.id);
      if (i === -1) throw new ErrorDelBorrador(`La escala no tiene el criterio ${cambio.id}.`);
      nivel.criterios[i] = { id: cambio.id, ...camposDelCriterio(cambio) };
      id = cambio.id;
      break;
    }
    case "nuevo-criterio": {
      const { nivel } = nivelDe(nuevos, cambio.nivel);
      id = nuevoIdDeCriterio(nuevos, cambio.nivel, opts.retirados);
      nivel.criterios.push({ id, ...camposDelCriterio(cambio) });
      break;
    }
    case "nivel": {
      const { nivel } = nivelDe(nuevos, cambio.id);
      nivel.frase = linea(cambio.frase, "la frase del nivel");
      nivel.resultado = linea(cambio.resultado, "el resultado", true);
      id = cambio.id;
      break;
    }
    case "dimension": {
      const dim = dimensionesDe(nuevos).find((d) => d.id === cambio.id);
      if (!dim) throw new ErrorDelBorrador(`La escala no tiene la dimensión ${cambio.id}.`);
      dim.nombre = linea(cambio.nombre, "el nombre de la dimensión");
      dim.pregunta = linea(cambio.pregunta, "la pregunta");
      dim.descripcion = linea(cambio.descripcion, "la descripción", true);
      dim.costoDeQuedarse = linea(cambio.costoDeQuedarse, "el costo de quedarse");
      id = cambio.id;
      break;
    }
  }

  // La garantía: el .md que generan los datos nuevos se vuelve a leer igual, y el lector lo entiende.
  const md = generarMarkdown(nuevos);
  let vuelta: EscalaDatos;
  try {
    vuelta = importarEscala(md);
    escalaDeLosDatos(vuelta);
  } catch (e) {
    const porque = e instanceof ErrorDeFormato || e instanceof ErrorDelBorrador ? e.message.replace(/^Línea \d+: /, "") : String(e);
    throw new ErrorDelBorrador(`Ese cambio haría que la escala no se pueda leer: ${porque}`);
  }
  if (!iguales(vuelta, nuevos)) {
    throw new ErrorDelBorrador("Ese texto cambiaría cómo se lee la escala (por ejemplo, una pregunta que empieza como una lista o un título). Escríbelo de otra forma.");
  }
  return { datos: nuevos, id };
}
