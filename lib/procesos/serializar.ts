/**
 * lib/procesos/serializar.ts — UN MAPA, EN TEXTO PARA LOS AGENTES QUE LO LEEN.
 *
 * Puro. El Diagnóstico, la Planificación, la Implementación, la Entrega y la auditoría del portal
 * leen los procesos por `serializeProcesosForPrompt` (lib/canvas/read-procesos.ts). Con los mapas
 * nuevos, cada paso va con quién lo hace, la herramienta, el dolor y de dónde sale: un paso
 * supuesto o propuesto lo dice, para que ningún documento lo cuente como algo que dijo el cliente.
 */
import type { MapaDeProceso, PasoDelMapa, VersionDelMapa } from "./mapa";

const ESTADO: Record<MapaDeProceso["estado"], string> = {
  borrador: " (borrador del agente: el cliente todavía no lo validó)",
  revisado: " (revisado por Smarteam: el cliente todavía no lo validó)",
  validado: " (validado con el cliente)",
};

const MARCA: Record<string, string> = { dicho: "", acordado: "", propuesto: " (propuesto por Smarteam, sin confirmar)", supuesto: " (supuesto, sin confirmar)" };

function lineaDePaso(p: PasoDelMapa, carriles: Map<string, string>, cual: "hoy" | "despues"): string {
  const partes = [`${carriles.get(p.carril) ?? p.carril}: ${p.texto}`];
  if (p.herramienta) partes.push(`con ${p.herramienta}`);
  if (cual === "despues" && p.cambio && p.cambio !== "igual") partes.push(p.cambio === "automatico" ? "automático" : p.cambio);
  if (cual === "despues" && p.enHubspot) partes.push(`en HubSpot: ${p.enHubspot}`);
  let linea = `- ${partes.join(" · ")}${MARCA[p.origen] ?? ""}`;
  if (cual === "hoy" && p.dolor) linea += `\n  ⚠ DOLOR: ${p.dolor}`;
  return linea;
}

function serializarVersion(v: VersionDelMapa, cual: "hoy" | "despues"): string[] {
  const carriles = new Map(v.carriles.map((c) => [c.id, c.nombre]));
  const porId = new Map(v.pasos.map((p) => [p.id, p]));
  const lineas = v.pasos.map((p) => lineaDePaso(p, carriles, cual));
  const flujo = v.flechas
    .map((f) => {
      const a = porId.get(f.de);
      const b = porId.get(f.a);
      return a && b ? `${a.texto}${f.etiqueta ? ` [${f.etiqueta}]` : ""} → ${b.texto}` : "";
    })
    .filter(Boolean);
  if (flujo.length) lineas.push(`Flujo: ${flujo.join(" · ")}`);
  return lineas;
}

export function serializarMapa(m: MapaDeProceso, opciones: { version?: "hoy" | "despues" | "ambas" } = {}): string {
  const version = opciones.version ?? "ambas";
  const lineas = [`### Proceso: ${m.nombre}${ESTADO[m.estado]}`];
  if (m.queResuelve) lineas.push(m.queResuelve);
  if (version !== "despues") {
    lineas.push("**Cómo se hace HOY:**", ...serializarVersion(m.hoy, "hoy"));
  }
  if (version !== "hoy") {
    lineas.push("**Cómo se va a hacer DESPUÉS de la implementación:**", ...serializarVersion(m.despues, "despues"));
    const hoyPorId = new Map(m.hoy.pasos.map((p) => [p.id, p.texto]));
    for (const v of m.despues.seVa) lineas.push(`- Se va de hoy: «${hoyPorId.get(v.id) ?? v.id}» — ${v.porque}`);
  }
  if (version === "ambas" && m.cambios.length) lineas.push("**Qué cambia:**", ...m.cambios.map((c) => `- ${c.texto}`));
  if (m.preguntas.length) lineas.push("**Falta confirmar con el cliente:**", ...m.preguntas.map((p) => `- ${p}`));
  return lineas.join("\n");
}
