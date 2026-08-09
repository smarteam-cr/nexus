/**
 * lib/canvas/agent-output-doc.ts — LO QUE DEVOLVIÓ UN AGENTE, LEGIBLE.
 * Puro y client-safe: sin Prisma, sin red.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
 * Regenerar un documento BORRA los bloques del agente de la corrida anterior. Desde entonces,
 * `AgentRun.output` —el JSON crudo que quedó guardado— es la ÚNICA copia sobreviviente de lo
 * que ese agente había escrito. Nunca hubo una pantalla que lo abriera.
 *
 * Este módulo convierte ese JSON en algo renderizable, con dos piezas:
 *  · `geometriaDeBloque` — la aritmética de tamaño de un bloque, extraída del camino de
 *    ESCRITURA (analyze) para que el histórico se vea exactamente como se vio el original.
 *    Una copia divergiría en silencio: mismos datos, otra pinta.
 *  · `documentoDeCorrida` — el output entero, ordenado y clasificado.
 *
 * ⚠ SIN CAMBIO DE COMPORTAMIENTO EN LA RUTA. `geometriaDeBloque` es la misma aritmética,
 * carácter por carácter. En particular NO se agregó tolerancia a tipos inválidos: hoy un `type`
 * inventado por el modelo mata la corrida ruidosamente en el `createMany`, y "arreglarlo" de
 * paso —escondido dentro de una extracción— la volvería una que guarda basura callada. Si
 * alguna vez se quiere esa tolerancia, es su propia tanda con su propia decisión.
 */
import { DEFAULT_COL_SPAN, type BlockType } from "./block-types";
import { parseRunError } from "@/lib/agents/run-error";

/** Un bloque tal como lo emite un agente (minúsculas, sin ids ni geometría). */
export interface BloqueDeAgente {
  type?: string;
  content?: string;
  data?: unknown;
}

export interface GeometriaDeBloque {
  /** Tipo en MAYÚSCULAS, crudo. El cast al enum de Prisma es del llamador. */
  blockType: string;
  content: string | null;
  data: unknown;
  colSpan: number;
  rowSpan: number;
}

/**
 * Tamaño y tipo canónicos de un bloque emitido por un agente. Fuente única: la usan el camino
 * de escritura (analyze) y el visor del historial.
 */
export function geometriaDeBloque(bloque: BloqueDeAgente): GeometriaDeBloque {
  const bt = (bloque.type?.toLowerCase() ?? "text") as BlockType;
  // Conservative rowSpan — user can resize if needed
  const contentLen = (bloque.content ?? "").length;
  const tableRows = (bloque.data as { rows?: unknown[] } | null)?.rows?.length ?? 0;
  let rowSpan: number;
  if (bt === "heading") rowSpan = 1;
  else if (bt === "metric") rowSpan = 1;
  else if (bt === "table") rowSpan = Math.max(2, Math.ceil(((tableRows + 1) * 35) / 125));
  else if (bt === "flowchart") rowSpan = 3;
  else rowSpan = Math.max(1, Math.ceil(contentLen / 800));
  return {
    blockType: bt.toUpperCase(),
    content: bloque.content ?? null,
    data: bloque.data ?? undefined,
    colSpan: DEFAULT_COL_SPAN[bt] ?? 4,
    rowSpan,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ── EL DOCUMENTO DE UNA CORRIDA ──────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

export type EstadoDeSalida = "ok" | "sin_contenido" | "error" | "ilegible";

export interface BloqueDeCorrida extends GeometriaDeBloque {
  /** Id SINTÉTICO y determinista. No existe en la base: es solo la key del render. */
  id: string;
  order: number;
}

export interface SeccionDeCorrida {
  key: string;
  label: string;
  /** El agente emitió una clave que el documento no tiene. Se pinta al final, rotulada. */
  desconocida: boolean;
  blocks: BloqueDeCorrida[];
}

export interface DocumentoDeCorrida {
  estado: EstadoDeSalida;
  /** Mensaje humano cuando `estado != "ok"`. null si ok. */
  motivo: string | null;
  secciones: SeccionDeCorrida[];
  seccionesConContenido: number;
  seccionesEsperadas: number;
  bloques: number;
  clavesDesconocidas: string[];
}

const VACIO = (estado: EstadoDeSalida, motivo: string | null, esperadas = 0): DocumentoDeCorrida => ({
  estado,
  motivo,
  secciones: [],
  seccionesConContenido: 0,
  seccionesEsperadas: esperadas,
  bloques: 0,
  clavesDesconocidas: [],
});

interface SeccionCruda {
  key?: unknown;
  blocks?: unknown;
}

/**
 * El output de una corrida, listo para pintar.
 *
 * `defs` son las secciones del documento (key + label) — el ORDEN DE SALIDA es el de `defs`,
 * no el de emisión del agente: es lo que hace comparable la corrida vieja contra el documento
 * actual, lado a lado, que es para lo que existe el historial.
 *
 * Reglas de clasificación, en orden:
 *  · vacío / `"{}"` (corrida en curso) / `sections: []` / todo sin bloques → `sin_contenido`
 *  · JSON inválido o que no es objeto → `ilegible`
 *  · `{error: …}` sin `sections` → `error`, con el mensaje humanizado
 *
 * Dos decisiones de fidelidad al camino vivo:
 *  · Clave DUPLICADA: gana la última. Es lo que pasa al escribir (deleteMany+createMany por
 *    sección emitida), así que el historial muestra lo que realmente quedó guardado.
 *  · Clave DESCONOCIDA: se incluye al final, rotulada. El camino vivo la TIRA, así que
 *    mostrarla es estrictamente más información — y es la única señal de deriva del agente.
 */
export function documentoDeCorrida(
  output: string | null | undefined,
  defs: ReadonlyArray<{ key: string; label: string }>,
  opciones?: { idPrefijo?: string },
): DocumentoDeCorrida {
  const esperadas = defs.length;
  const crudo = (output ?? "").trim();
  if (!crudo || crudo === "{}") {
    return VACIO("sin_contenido", "Esta corrida no guardó contenido.", esperadas);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(crudo);
  } catch {
    return VACIO("ilegible", "El resultado quedó guardado incompleto y no se puede mostrar.", esperadas);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return VACIO("ilegible", "El resultado quedó guardado incompleto y no se puede mostrar.", esperadas);
  }

  const obj = parsed as { sections?: unknown; error?: unknown };
  if (!Array.isArray(obj.sections)) {
    if (obj.error !== undefined) {
      return VACIO("error", parseRunError(crudo) ?? "Esta corrida falló y no dejó documento.", esperadas);
    }
    return VACIO("sin_contenido", "Esta corrida no guardó contenido.", esperadas);
  }

  const prefijo = opciones?.idPrefijo ?? "run";
  /* Por clave: gana la ÚLTIMA emisión (fidelidad al camino de escritura). */
  const porClave = new Map<string, BloqueDeAgente[]>();
  const ordenDeEmision: string[] = [];
  for (const s of obj.sections as SeccionCruda[]) {
    if (!s || typeof s !== "object" || typeof s.key !== "string") continue;
    if (!porClave.has(s.key)) ordenDeEmision.push(s.key);
    porClave.set(s.key, Array.isArray(s.blocks) ? (s.blocks as BloqueDeAgente[]) : []);
  }

  const armar = (key: string, label: string, desconocida: boolean): SeccionDeCorrida => ({
    key,
    label,
    desconocida,
    blocks: (porClave.get(key) ?? [])
      .filter((b) => b && typeof b === "object")
      .map((b, i) => ({ ...geometriaDeBloque(b), id: `${prefijo}:${key}:${i}`, order: i })),
  });

  const conocidas = new Set(defs.map((d) => d.key));
  const secciones: SeccionDeCorrida[] = [];
  // Primero, en el orden del documento — solo las que el agente emitió con contenido.
  for (const def of defs) {
    if (!porClave.has(def.key)) continue;
    const sec = armar(def.key, def.label, false);
    if (sec.blocks.length > 0) secciones.push(sec);
  }
  // Después las desconocidas, en su orden de emisión, rotuladas con su clave cruda.
  const clavesDesconocidas = ordenDeEmision.filter((k) => !conocidas.has(k));
  for (const key of clavesDesconocidas) {
    const sec = armar(key, key, true);
    if (sec.blocks.length > 0) secciones.push(sec);
  }

  if (secciones.length === 0) {
    return VACIO("sin_contenido", "Esta corrida no guardó contenido.", esperadas);
  }

  return {
    estado: "ok",
    motivo: null,
    secciones,
    seccionesConContenido: secciones.filter((s) => !s.desconocida).length,
    seccionesEsperadas: esperadas,
    bloques: secciones.reduce((n, s) => n + s.blocks.length, 0),
    clavesDesconocidas: secciones.filter((s) => s.desconocida).map((s) => s.key),
  };
}
