/**
 * lib/tareas/ia/salida.ts — lo que devolvió Haiku, validado (docs/tareas-plan.md §7.2). PURO.
 *
 * Cada id se valida contra la lista que se le mostró: lo desconocido se descarta, nunca se adivina. Un nombre de grupo
 * se acepta si tiene 40 caracteres o menos, comparte raíces con sus líneas y no trae voseo; si no, se usa el título de
 * su primera línea. Si la respuesta se cortó (`max_tokens`), no se aplica nada del modelo.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { CLAVES_DE_VENCIMIENTO, type ClaveDeVencimiento } from "../fechas";
import { raices } from "../texto";
import { HERRAMIENTA } from "./pedido";

export interface LineaLeida {
  L: string;
  dueno: string | null;
  misma: string | null;
  proyecto: string | null;
  grupo: string | null;
  cliente: string | null;
  vence: ClaveDeVencimiento | null;
}

export interface GrupoLeido {
  G: string;
  nombre: string;
  mismoQue: string | null;
}

export interface ResultadoLeido {
  T: string;
  resultado: "hecha" | "no_hecha";
  fuente: string;
}

export interface SalidaDeLaLectura {
  lineas: Map<string, LineaLeida>;
  grupos: GrupoLeido[];
  resultados: ResultadoLeido[];
}

export interface RefsValidas {
  L: ReadonlySet<string>;
  M: ReadonlySet<string>;
  T: ReadonlySet<string>;
  R: ReadonlySet<string>;
  C: ReadonlySet<string>;
  D: ReadonlySet<string>;
  /** Los textos de cada línea, para validar el nombre de un grupo. */
  textoDe: ReadonlyMap<string, string>;
  /** Las tareas de la semana que cierra (las únicas que admiten un resultado). */
  tareasDeLaSemana: ReadonlySet<string>;
}

/** Formas de voseo frecuentes en un nombre corto («Armá», «Hacé», «tenés»). */
const VOSEO = /\b\w+(?:á|é|í)s\b|\b(?:armá|hacé|poné|mandá|revisá|subí|tené|decí|andá|vení|fijate|avisame|contame)\b/i;

const deLaLista = (v: unknown, lista: ReadonlySet<string>): string | null => (typeof v === "string" && lista.has(v) ? v : null);

export function nombreDeGrupoValido(nombre: string, textos: readonly string[]): boolean {
  const n = nombre.trim();
  if (!n || n.length > 40) return false;
  if (VOSEO.test(n)) return false;
  const delNombre = raices(n);
  if (!delNombre.length) return false;
  const deLasLineas = new Set(textos.flatMap((t) => raices(t)));
  return delNombre.some((r) => deLasLineas.has(r));
}

/** Lee y valida. `null` = no se usa nada del modelo (sin herramienta, o cortada). */
export function leerSalida(respuesta: Pick<Anthropic.Messages.Message, "content" | "stop_reason">, refs: RefsValidas): SalidaDeLaLectura | null {
  if (respuesta.stop_reason === "max_tokens") return null;
  const bloque = respuesta.content.find((b) => b.type === "tool_use" && b.name === HERRAMIENTA);
  if (!bloque || bloque.type !== "tool_use") return null;
  const input = (bloque.input ?? {}) as { lineas?: unknown; grupos?: unknown; resultados?: unknown };

  const lineas = new Map<string, LineaLeida>();
  for (const crudo of Array.isArray(input.lineas) ? input.lineas : []) {
    if (!crudo || typeof crudo !== "object") continue;
    const x = crudo as Record<string, unknown>;
    const L = deLaLista(x.L, refs.L);
    if (!L || lineas.has(L)) continue;
    const vence = typeof x.vence === "string" && (CLAVES_DE_VENCIMIENTO as readonly string[]).includes(x.vence) ? (x.vence as ClaveDeVencimiento) : null;
    lineas.set(L, {
      L,
      dueno: deLaLista(x.dueno, refs.M),
      misma: deLaLista(x.misma, refs.T),
      proyecto: deLaLista(x.proyecto, refs.R),
      grupo: typeof x.grupo === "string" && /^G\d{1,2}$/.test(x.grupo) ? x.grupo : null,
      cliente: deLaLista(x.cliente, refs.C),
      vence,
    });
  }

  const grupos: GrupoLeido[] = [];
  const vistos = new Set<string>();
  for (const crudo of Array.isArray(input.grupos) ? input.grupos : []) {
    if (!crudo || typeof crudo !== "object") continue;
    const x = crudo as Record<string, unknown>;
    if (typeof x.G !== "string" || !/^G\d{1,2}$/.test(x.G) || vistos.has(x.G)) continue;
    const suyas = [...lineas.values()].filter((l) => l.grupo === x.G);
    if (suyas.length === 0) continue;
    vistos.add(x.G);
    const textos = suyas.map((l) => refs.textoDe.get(l.L) ?? "");
    const nombre = typeof x.nombre === "string" && nombreDeGrupoValido(x.nombre, textos) ? x.nombre.trim() : null;
    grupos.push({
      G: x.G,
      nombre: nombre ?? (textos[0] ?? "").replace(/^\[[^\]]*\]\s*/, "").split(":")[0].trim().slice(0, 40),
      mismoQue: deLaLista(x.mismoQue, refs.R),
    });
  }
  // Una línea con un grupo que no se declaró (o que se descartó) queda suelta.
  for (const l of lineas.values()) if (l.grupo && !vistos.has(l.grupo)) l.grupo = null;

  const resultados: ResultadoLeido[] = [];
  const conResultado = new Set<string>();
  for (const crudo of Array.isArray(input.resultados) ? input.resultados : []) {
    if (!crudo || typeof crudo !== "object") continue;
    const x = crudo as Record<string, unknown>;
    const T = deLaLista(x.T, refs.tareasDeLaSemana);
    const fuente = typeof x.fuente === "string" && (refs.L.has(x.fuente) || refs.D.has(x.fuente)) ? x.fuente : null;
    if (!T || !fuente || conResultado.has(T) || (x.resultado !== "hecha" && x.resultado !== "no_hecha")) continue;
    conResultado.add(T);
    resultados.push({ T, resultado: x.resultado, fuente });
  }

  return { lineas, grupos, resultados };
}
