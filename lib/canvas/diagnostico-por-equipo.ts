/**
 * lib/canvas/diagnostico-por-equipo.ts — EL DIAGNÓSTICO LEE POR EQUIPO DEL CLIENTE (L5 etapa 1 del roadmap, 2026-10-25).
 * PURO.
 *
 * Como ya lo hace la guía de la preventa (DECISIONS «La preventa por área», 2026-10-23): cada sesión de la exploración es
 * con un equipo del cliente, y desde el 2026-10-25 las demás reuniones del proyecto también pueden llevar el suyo
 * (`SessionProject.equipoDeLaReunion`). El documento de diagnóstico recibe cada reunión con su equipo en el encabezado y un
 * bloque que dice qué equipos hablaron y cuáles no, con la regla: lo que dijo un equipo es de su área de la escala, no se
 * le atribuye a otro, y un equipo sin reunión no tiene voz en el diagnóstico.
 *
 * ⛔ Este archivo NO importa de lib/exploraciones (ningún documento del cliente lee la exploración directo:
 * lib/exploraciones/lectores.test.ts). Recibe los equipos ya resueltos (nombre y área) de las sugerencias del documento
 * (`equiposDeLasReunionesDelDiagnostico`, lib/contexto/sugerencias-del-documento-server.ts).
 *
 * Sin ninguna reunión con equipo, el bloque es "" y el mensaje queda como antes, byte a byte.
 */

/** Un equipo del cliente, como lo lee el diagnóstico (lib/exploraciones/equipos.ts › EQUIPOS, ya resuelto). */
export interface EquipoParaElDiagnostico {
  clave: string;
  nombre: string;
  /** El área de la escala (`1` Ventas, `2` Marketing, `3` Servicio), o null. */
  area: "1" | "2" | "3" | null;
}

/** Cómo va el equipo en el encabezado de una reunión («Equipo del cliente: Marketing»). */
export function rotuloDelEquipo(equipo: EquipoParaElDiagnostico): string {
  return `Equipo del cliente: ${equipo.nombre}`;
}

const NOMBRE_DEL_AREA: Record<"1" | "2" | "3", string> = { "1": "Ventas", "2": "Marketing", "3": "Servicio" };

/**
 * El bloque del mensaje del diagnóstico. `leidas`: las reuniones que el documento va a leer (su id y su título);
 * `equipos`: el equipo de cada una; `todos`: los equipos del cliente, en su orden (para decir cuáles no hablaron). Solo
 * cuenta lo que se lee: una reunión con equipo que no entra no hace hablar a nadie.
 */
export function bloqueDelDiagnosticoPorEquipo(
  leidas: ReadonlyArray<{ id: string; titulo: string }>,
  equipos: ReadonlyMap<string, EquipoParaElDiagnostico>,
  todos: readonly EquipoParaElDiagnostico[],
): string {
  const porEquipo = new Map<string, string[]>();
  let sinEquipo = 0;
  for (const r of leidas) {
    const e = equipos.get(r.id);
    if (!e) {
      sinEquipo++;
      continue;
    }
    porEquipo.set(e.clave, [...(porEquipo.get(e.clave) ?? []), r.titulo]);
  }
  if (!porEquipo.size) return "";
  const conReunion = todos.filter((e) => porEquipo.has(e.clave));
  const sinReunion = todos.filter((e) => !porEquipo.has(e.clave));
  const lineas = conReunion.map((d) => {
    const titulos = porEquipo.get(d.clave)!;
    const area = d.area ? ` (área ${d.area} de la escala: ${NOMBRE_DEL_AREA[d.area]})` : "";
    return `- ${d.nombre}${area}: ${titulos.length === 1 ? "1 reunión" : `${titulos.length} reuniones`} — ${titulos.map((t) => `«${t}»`).join(", ")}`;
  });
  return [
    "=== EL DIAGNÓSTICO, POR EQUIPO DEL CLIENTE (cada reunión de abajo dice con qué equipo fue) ===",
    ...lineas,
    sinEquipo ? `- Sin equipo: ${sinEquipo === 1 ? "1 reunión" : `${sinEquipo} reuniones`} (de la empresa en general).` : "",
    sinReunion.length ? `Equipos sin ninguna reunión: ${sinReunion.map((e) => e.nombre).join(", ")}.` : "",
    "Cómo leerlas: lo que dijo un equipo es de SU área (su proceso, su medición, su dolor). No le atribuyas a un equipo lo que dijo otro. " +
      "Cuando un síntoma, una causa o un objetivo sale de un equipo, que se note de cuál (en su texto, sin códigos). " +
      "Un equipo sin reunión no tiene voz en el diagnóstico: no le inventes problemas; si importa, va como «Por validar».",
  ]
    .filter(Boolean)
    .join("\n");
}
