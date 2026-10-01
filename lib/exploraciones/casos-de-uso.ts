/**
 * lib/exploraciones/casos-de-uso.ts — lo que lee el agente para proponer casos de uso. PURO.
 *
 * El modo «casos» es EXPERIMENTAL: propone casos de uso sin la biblioteca (hoy vacía), a partir de
 * dónde parece estar cada equipo en la escala (lo confirmado y, donde no hay, las hipótesis), lo que
 * le falta para Funcional y lo que contó el cliente.
 *
 * ⛔ Solo entra lo que PUEDE ver el cliente (las casillas `alCliente`): lo que el agente propone acá
 * termina en la propuesta. Las hipótesis sobre personas, el presupuesto, quién decide, lo no
 * explorado y la apertura a la asesoría se quedan afuera.
 */
import type { Letra } from "@/lib/escala/documento/tipos";
import { CASILLAS, type Meta, type Reto } from "./casillas";
import type { EstadoDeExploracion, ItemPropuesto } from "./contenido";
import type { EscalaDelLienzo } from "./escala-del-lienzo";
import { chequeoDelMapa, loQueLaFrena, posicionesDelMapa } from "./mapa";

export function exploracionParaLosCasos(estado: EstadoDeExploracion, escala: EscalaDelLienzo, pendientes: readonly ItemPropuesto[]): string {
  const c = estado.contenido;
  const nivel = (l: Letra) => escala.niveles.find((n) => n.letra === l)?.nombre ?? l;
  const posiciones = posicionesDelMapa(estado, pendientes);
  const chequeo = chequeoDelMapa(escala, estado.areas, posiciones);
  const partes: string[] = ["## Dónde parece estar cada equipo (estimado; lo marcado «hipótesis» todavía no lo confirmó el cliente)"];

  for (const a of escala.areas) {
    if (!estado.areas.includes(a.id)) continue;
    const calculo = chequeo.areas.find((x) => x.id === a.id);
    partes.push("", `### ${a.nombre}${calculo?.nivel ? `: parece estar en ${nivel(calculo.nivel)}` : ""}`);
    for (const d of a.dimensiones) {
      if (!d.aplica) continue;
      const p = posiciones[d.id];
      partes.push(
        p
          ? `- ${d.nombre}: ${nivel(p.nivel)} (${p.clase === "evidencia" ? "con evidencia" : "hipótesis"})${p.porQue ? ` — ${p.porQue}` : ""}`
          : `- ${d.nombre}: sin dato`,
      );
    }
    const frena = calculo ? loQueLaFrena(calculo) : null;
    if (frena) {
      const nombres = frena.dimensiones.map((id) => a.dimensiones.find((d) => d.id === id)?.nombre).filter(Boolean);
      partes.push(`Lo que lo deja en ${nivel(frena.nivel)}: ${nombres.join(", ")}.`);
    }
    if (calculo?.objetivo) partes.push(`Objetivo de la primera venta: ${nivel(calculo.objetivo)}.`);
  }
  const r = chequeo.recomendacion;
  if (r?.tipo === "trabajar") {
    const area = escala.areas.find((a) => a.id === r.areaId);
    const dim = area?.dimensiones.find((d) => d.id === r.dimensionId);
    if (area && dim) partes.push("", `Qué va primero: ${dim.nombre}, en ${area.nombre}.`);
  }

  // Lo que le falta para Funcional: los criterios que NO tiene, por su texto.
  const faltas: string[] = [];
  for (const a of escala.areas) {
    if (!estado.areas.includes(a.id)) continue;
    for (const d of a.dimensiones) {
      const no = d.funcional.filter((cr) => c.falta[cr.id]?.estado === "no_tiene").map((cr) => cr.texto);
      if (no.length) faltas.push(`- ${d.nombre} (${a.nombre}): ${no.join("; ")}`);
    }
  }
  if (faltas.length) partes.push("", "## Lo que le falta para Funcional (según lo que se habló)", ...faltas);

  // Solo lo que puede ver el cliente.
  for (const def of CASILLAS) {
    if (!def.alCliente) continue;
    const v = c.casillas[def.clave];
    if (v === undefined) continue;
    const lineas =
      def.tipo === "metas"
        ? (v as Meta[]).map((m) => `- ${m.que}${[m.actual && `de ${m.actual}`, m.objetivo && `a ${m.objetivo}`, m.para && `para ${m.para}`].filter(Boolean).map((x) => ` ${x}`).join("")}`)
        : def.tipo === "retos"
          ? (v as Reto[]).map((x) => `- ${x.texto}`)
          : Array.isArray(v)
            ? (v as string[]).map((x) => `- ${x}`)
            : typeof v === "string"
              ? [v]
              : [];
    if (lineas.length) partes.push("", `## ${def.etiqueta}`, ...lineas);
  }
  return partes.join("\n");
}
