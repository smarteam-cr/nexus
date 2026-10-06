/**
 * lib/procesos/legado.ts — UN MAPA NUEVO, EN LA FORMA QUE ENTIENDE EL VISOR VIEJO.
 *
 * Puro. El kickoff (editor, vista del cliente y PDF) dibuja los procesos con FlowchartViewer y
 * DiagramStatic, que leen `{ nodes, edges }` con posiciones. Para que un mapa nuevo VALIDADO con el
 * cliente se vea ahí sin reescribir el kickoff, se traduce su versión de HOY a esa forma, con las
 * posiciones del acomodo por carriles (el visor respeta posiciones guardadas). El nombre de cada
 * carril va como un texto a la izquierda de su fila y el dolor, como nodo de dolor bajo su paso.
 */
import { acomodarPorCarriles, MEDIDAS } from "./layout";
import type { MapaDeProceso, VersionDelMapa } from "./mapa";

export interface FlowchartLegado {
  description?: string;
  nodes: { id: string; type: string; label: string; sublabel?: string; detail?: string; fontSize?: number; position: { x: number; y: number } }[];
  edges: { id: string; source: string; target: string; label?: string; edgeType?: "yes" | "no" | "default"; dashed?: boolean }[];
}

const TIPO_LEGADO: Record<string, string> = { inicio: "start", fin: "end", decision: "decision", espera: "process", paso: "process" };

export function versionALegado(version: VersionDelMapa, descripcion?: string): FlowchartLegado {
  const acomodo = acomodarPorCarriles(version, { conDolor: true });
  const nodes: FlowchartLegado["nodes"] = [];
  for (const b of acomodo.bandas) {
    nodes.push({ id: `carril-${b.carril.id}`, type: "text", label: b.carril.nombre, fontSize: 14, position: { x: 8, y: b.y + MEDIDAS.margen } });
  }
  for (const p of version.pasos) {
    const pos = acomodo.posicion[p.id];
    nodes.push({ id: p.id, type: TIPO_LEGADO[p.tipo] ?? "process", label: p.texto, ...(p.herramienta ? { sublabel: p.herramienta } : {}), position: pos });
    if (p.dolor) {
      nodes.push({ id: `dolor-${p.id}`, type: "pain", label: p.dolor, position: { x: pos.x, y: pos.y + MEDIDAS.paso.alto + 6 } });
    }
  }
  const edges: FlowchartLegado["edges"] = version.flechas.map((f, i) => {
    const esSi = /^s[ií]$/i.test(f.etiqueta.trim());
    const no = /^no$/i.test(f.etiqueta.trim());
    return {
      id: `e${i}`,
      source: f.de,
      target: f.a,
      ...(f.etiqueta ? { label: f.etiqueta } : {}),
      edgeType: esSi ? "yes" : no ? "no" : "default",
      ...(acomodo.retornos.has(`${f.de}>${f.a}`) ? { dashed: true } : {}),
    };
  });
  return { ...(descripcion ? { description: descripcion } : {}), nodes, edges };
}

/** El mapa de HOY de un proceso validado, como lo muestra el kickoff. */
export function mapaALegado(m: MapaDeProceso): FlowchartLegado {
  return versionALegado(m.hoy, m.queResuelve);
}
