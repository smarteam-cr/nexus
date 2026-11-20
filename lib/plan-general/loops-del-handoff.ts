/**
 * lib/plan-general/loops-del-handoff.ts — los LOOPS que declara el handoff de un proyecto (2026-11-19, Elías: «debe
 * ser la B»). Puro y client-safe.
 *
 * El handoff dice de forma explícita qué loops cubre su proyecto, en la sección `loops` (HANDOFF_CANVAS): UNA tabla
 * «Loop · Área · Objetivo · Prioridad», una fila por loop, con el número delante del nombre («02 · Campaign
 * Activation»). Esos loops son los grupos del cronograma: cuando el handoff crea el cronograma, cada loop es una fase
 * con su `loopNumero`, todas en paralelo desde la semana 0. El área, el objetivo y la prioridad viven SOLO en el
 * handoff; el número y el nombre, en la fase (lo que el plan general necesita para ordenar y rotular).
 */
import type { FaseDelHandoff } from "@/lib/timeline/referencias-de-la-propuesta";

export const SECCION_DE_LOOPS = "loops";
export const CABECERAS_DE_LOOPS = ["Loop", "Área", "Objetivo", "Prioridad"] as const;

export interface LoopDeclarado {
  numero: number | null;
  nombre: string;
  area: string;
  objetivo: string;
  prioridad: string;
}

/** «02 · Campaign Activation» → { numero: 2, nombre: "Campaign Activation" }. Sin número delante, numero = null. */
export function partirRotulo(rotulo: string): { numero: number | null; nombre: string } {
  const t = rotulo.trim();
  // El separador es obligatorio: «360 grados» es un nombre, no el loop 360.
  const m = /^0*(\d{1,3})\s*[·.\-–—:|)]\s*(.*)$/.exec(t);
  if (m && m[2].trim()) return { numero: Number(m[1]), nombre: m[2].trim() };
  return { numero: null, nombre: t };
}

/** La fila de ejemplo del prompt (con sus «<…>»): si el modelo la copia, no es un loop. */
const ES_LA_PLANTILLA = /^nombre del loop$|[<>]/i;

/** Los datos del bloque TABLE de la sección. Una fila sin nombre, o la del ejemplo, no cuenta. */
export function leerLoopsDeLaTabla(data: unknown): LoopDeclarado[] {
  const rows = (data as { rows?: unknown } | null)?.rows;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((r) => {
    if (!Array.isArray(r)) return [];
    const celdas = r.map((c) => (typeof c === "string" ? c.trim() : c == null ? "" : String(c).trim()));
    const { numero, nombre } = partirRotulo(celdas[0] ?? "");
    if (!nombre || ES_LA_PLANTILLA.test(nombre)) return [];
    return [{ numero, nombre, area: celdas[1] ?? "", objetivo: celdas[2] ?? "", prioridad: celdas[3] ?? "" }];
  });
}

/** El bloque TABLE que escribe un loop por fila (lo usa la carga de kölbi y sirve de forma para el agente). */
export function tablaDeLoops(loops: readonly LoopDeclarado[]): { headers: string[]; rows: string[][] } {
  return {
    headers: [...CABECERAS_DE_LOOPS],
    rows: loops.map((l) => [
      l.numero != null ? `${String(l.numero).padStart(2, "0")} · ${l.nombre}` : l.nombre,
      l.area,
      l.objetivo,
      l.prioridad,
    ]),
  };
}

/** Los loops de la salida del agente de handoff (`sections[key=loops]`, bloques tipo table). [] si no declaró ninguno. */
export function loopsDeLaSalida(salida: unknown): LoopDeclarado[] {
  const sections = (salida as { sections?: unknown } | null)?.sections;
  if (!Array.isArray(sections)) return [];
  const s = sections.find((x) => (x as { key?: unknown })?.key === SECCION_DE_LOOPS) as { blocks?: unknown } | undefined;
  if (!s || !Array.isArray(s.blocks)) return [];
  return s.blocks.flatMap((b) => {
    const bb = b as { type?: unknown; data?: unknown };
    return typeof bb.type === "string" && bb.type.toLowerCase() === "table" ? leerLoopsDeLaTabla(bb.data) : [];
  });
}

/**
 * Qué bloques de la sección `loops` se guardan. Un proyecto que NO trabaja por loops no guarda ninguno, aunque el modelo
 * haya escrito algo (un «⚠️ Por validar…» o una tabla de relleno): la sección está en todos los handoffs y vacía no
 * molesta. Uno que sí, guarda solo las tablas que traen al menos un loop.
 */
export function bloquesDeLoopsQueSeGuardan<B extends { type?: string; data?: unknown }>(blocks: readonly B[], trabajaPorLoops: boolean): B[] {
  if (!trabajaPorLoops) return [];
  return blocks.filter((b) => typeof b.type === "string" && b.type.toLowerCase() === "table" && leerLoopsDeLaTabla(b.data).length > 0);
}

/**
 * Las fases del cronograma que nace de un handoff con loops: una por loop, todas desde la semana 0 y con la duración
 * del ciclo. Un loop sin número toma el siguiente libre, para que el plan general lo pueda ordenar.
 */
export function fasesDeLosLoops(
  loops: readonly LoopDeclarado[],
  semanas: number,
  /** Los números que ya usan otros proyectos de la cuenta: un loop sin número no toma uno de ellos. */
  usadosEnLaCuenta: readonly number[] = [],
  /** Los loops que ESTE proyecto ya tiene (nombre en minúsculas → número): uno sin número que se llama igual conserva el suyo. */
  propios: ReadonlyMap<string, number> = new Map(),
): Array<FaseDelHandoff & { loopNumero: number }> {
  const usados = new Set([...usadosEnLaCuenta, ...propios.values(), ...loops.flatMap((l) => (l.numero != null ? [l.numero] : []))]);
  let libre = 1;
  return loops.map((l, i) => {
    let numero = l.numero ?? propios.get(l.nombre.trim().toLowerCase()) ?? null;
    if (numero == null) {
      while (usados.has(libre)) libre++;
      numero = libre;
      usados.add(libre);
    }
    return {
      name: l.nombre,
      order: i,
      durationWeeks: Math.max(1, Math.floor(semanas)),
      startWeek: 0,
      sessionCount: null,
      notes: l.objetivo || null,
      needsValidation: false,
      source: "AGENT" as const,
      loopNumero: numero,
    };
  });
}

/** Lo que el agente de handoff recibe cuando el proyecto trabaja por loops (un SmartLoop, o una cuenta que ya los usa). */
export function bloqueDeLoopsParaElHandoff(loopsDeLaCuenta: readonly { numero: number; nombre: string; proyecto: string }[]): string {
  const ya = loopsDeLaCuenta.length
    ? `\nLOS LOOPS QUE YA TIENE LA CUENTA (en otros proyectos o en este): ${loopsDeLaCuenta
        .map((l) => `${String(l.numero).padStart(2, "0")} · ${l.nombre} (${l.proyecto})`)
        .join("; ")}. Usa ESOS números; un loop nuevo toma el siguiente libre.`
    : "";
  return `LOS LOOPS DE ESTE PROYECTO (regla dura):
Este proyecto trabaja por LOOPS: frentes de trabajo que corren en paralelo durante el ciclo. Declara en la sección "loops" cuáles cubre ESTE proyecto, con UN bloque de tipo tabla:
{ "type": "table", "data": { "headers": ["Loop", "Área", "Objetivo", "Prioridad"], "rows": [["<número de dos cifras> · <nombre del loop>", "<Marketing, Ventas o Servicio>", "<qué persigue, en una oración>", "<Alta, Media o Baja>"]] } }
- Una fila por loop, con su número de dos cifras delante del nombre. Área: Marketing, Ventas o Servicio. Prioridad: Alta, Media o Baja.
- Solo los loops que las fuentes dicen que van en ESTE proyecto. Si las fuentes no hablan de loops, deja la sección con "blocks": [] (sin "⚠️ Por validar": esta sección es la excepción).
- En "timeline.phases" va UNA fase por loop, con el MISMO nombre del loop (sin el número) y la duración del ciclo. Las actividades de cada loop NO van como fases: las agrega después el detalle del cronograma.${ya}`;
}
