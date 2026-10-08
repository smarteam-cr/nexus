/**
 * lib/escala/datos/generar.ts — los datos de la escala → su `.md`. PURO.
 *
 * El `.md` ya no se escribe a mano: se arma desde los datos, con una sola forma para cada cosa
 * (un bloque por párrafo, una línea en blanco entre bloques, la etiqueta de cada criterio siempre
 * igual). `importar.ts` lee esa misma forma y comprueba que ida y vuelta da el mismo texto.
 *
 * `escalaDeLosDatos` arma la forma de LECTURA (`Escala`) que usan las pantallas: por ahora, leyendo
 * con el lector de siempre el `.md` que se genera. Así lo que ve cada pantalla es exactamente lo que
 * veía con el archivo, y el lector sigue siendo uno solo.
 */
import { parsearEscala, sinTildes } from "@/lib/escala/documento/parsear";
import type { Escala, Letra } from "@/lib/escala/documento/tipos";
import type {
  AreaDeLaEdicion,
  AreaDeLaMatriz,
  Bloque,
  CriterioDeLaEdicion,
  CriterioDeLaEscala,
  DimensionDeLaEdicion,
  DimensionDeLaMatriz,
  EdicionDeLaEscala,
  EscalaDatos,
  Parte,
} from "./tipos";

/** Las letras de los niveles → su nombre, leídos de la tabla «Niveles» de la referencia. */
export function nombresDeLosNiveles(datos: Pick<EscalaDatos, "partes">): Map<Letra, string> {
  const out = new Map<Letra, string>();
  for (const parte of datos.partes) {
    const bloques = parte.bloques;
    const i = bloques.findIndex((b) => b.tipo === "titulo" && b.nivel === 2 && b.texto === "Niveles");
    if (i === -1) continue;
    const tabla = bloques.slice(i + 1).find((b) => b.tipo !== "parrafo");
    if (tabla?.tipo !== "tabla") continue;
    for (const fila of tabla.filas) {
      const nombre = fila[1];
      if (!/^\d+$/.test(fila[0] ?? "") || !nombre) continue;
      out.set(sinTildes(nombre).charAt(0).toUpperCase() as Letra, nombre);
    }
  }
  return out;
}

// ── Las piezas ────────────────────────────────────────────────────────────────

function tabla(columnas: string[], alineacion: string[], filas: string[][]): string {
  const fila = (celdas: string[]) => `| ${celdas.join(" | ")} |`;
  return [fila(columnas), `|${alineacion.join("|")}|`, ...filas.map(fila)].join("\n");
}

export function bloqueComoTexto(b: Bloque): string {
  switch (b.tipo) {
    case "titulo":
      return `${"#".repeat(b.nivel)} ${b.texto}`;
    case "parrafo":
      return b.texto;
    case "lista":
      return b.items.map((x) => `- ${x}`).join("\n");
    case "numerada":
      return b.items.map((x, i) => `${i + 1}. ${x}`).join("\n");
    case "tabla":
      return tabla(b.columnas, b.alineacion, b.filas);
    case "separador":
      return "---";
  }
}

/** `[1.7.F1 · comprobable · riesgo · hábito · venta con equipo · requiere 1.5.F1, 1.6.F2]` */
export function etiquetaDe(c: CriterioDeLaEscala): string {
  const partes = [c.id, c.verificacion];
  if (c.riesgo) partes.push("riesgo");
  if (c.habito) partes.push("hábito");
  if (c.perfil) partes.push(c.perfil);
  if (c.requiere.length) partes.push(`requiere ${c.requiere.join(", ")}`);
  return `\`[${partes.join(" · ")}]\``;
}

export function criterioComoTexto(c: CriterioDeLaEscala): string {
  return `- ${c.texto} ${etiquetaDe(c)}`;
}

function criterioDeEdicionComoTexto(c: CriterioDeLaEdicion): string {
  return c.tipo === "reescrito" ? `- ${c.texto} \`[${c.id}]\`` : criterioComoTexto(c);
}

function nombreDelNivel(nombres: Map<Letra, string>, letra: Letra): string {
  const n = nombres.get(letra);
  if (!n) throw new Error(`La tabla «Niveles» de la referencia no tiene el nivel ${letra}.`);
  return n;
}

function idsEnLinea(ids: string[]): string {
  return `${ids.map((id) => `\`${id}\``).join(", ")}.`;
}

function dimensionDeLaMatriz(d: DimensionDeLaMatriz, nombres: Map<Letra, string>): string[] {
  const out = [`#### ${d.id} ${d.nombre}`, d.pregunta];
  if (d.descripcion !== null) out.push(`*Descripción:* ${d.descripcion}`);
  out.push(`*Costo de quedarse:* ${d.costoDeQuedarse}`);
  for (const n of d.niveles) {
    out.push(`**${nombreDelNivel(nombres, n.letra)}.** ${n.frase}`);
    if (n.resultado !== null) out.push(`*Resultado:* ${n.resultado}`);
    if (n.criterios.length) out.push(n.criterios.map(criterioComoTexto).join("\n"));
  }
  return out;
}

function areaDeLaMatriz(a: AreaDeLaMatriz, nombres: Map<Letra, string>): string[] {
  const out = [`## Área ${a.id} — ${a.nombre}`, a.descripcion];
  for (const capa of a.capas) {
    out.push(`### ${capa.nombre}`);
    for (const d of capa.dimensiones) out.push(...dimensionDeLaMatriz(d, nombres));
  }
  if (a.separadorAlFinal) out.push("---");
  return out;
}

function dimensionDeLaEdicion(d: DimensionDeLaEdicion, nombres: Map<Letra, string>): string[] {
  const out = [`#### ${d.id} ${d.nombre}`];
  if (d.pregunta !== null) out.push(d.pregunta);
  if (d.descripcion !== null) out.push(`*Descripción:* ${d.descripcion}`);
  if (d.costoDeQuedarse !== null) out.push(`*Costo de quedarse:* ${d.costoDeQuedarse}`);
  for (const n of d.niveles) {
    const nombre = nombreDelNivel(nombres, n.letra);
    out.push(n.frase === null ? `**${nombre}.**` : `**${nombre}.** ${n.frase}`);
    if (n.resultado !== null) out.push(`*Resultado:* ${n.resultado}`);
    if (n.criterios.length) out.push(n.criterios.map(criterioDeEdicionComoTexto).join("\n"));
  }
  if (d.noAplican.length) out.push(`*No aplican:* ${idsEnLinea(d.noAplican)}`);
  if (d.seLeenIgual.length) out.push(`*Se leen igual:* ${idsEnLinea(d.seLeenIgual)}`);
  return out;
}

function areaDeLaEdicion(a: AreaDeLaEdicion, nombres: Map<Letra, string>): string[] {
  const out = [`### Área ${a.id} — ${a.nombre}`];
  if (a.descripcion !== null) out.push(a.descripcion);
  for (const p of a.panoramica) out.push(`**${nombreDelNivel(nombres, p.letra)}.** ${p.texto}`);
  for (const d of a.dimensiones) out.push(...dimensionDeLaEdicion(d, nombres));
  return out;
}

function edicion(e: EdicionDeLaEscala, nombres: Map<Letra, string>): string[] {
  const out = [`## Edición — ${e.nombre}`];
  if (e.descripcion !== null) out.push(e.descripcion);
  out.push(`*Clave:* ${e.clave}`);
  if (e.perfilHabitual !== null) out.push(`*Perfil habitual:* ${e.perfilHabitual}`);
  if (e.criteriosPropios !== null) out.push(`*Criterios propios:* ${e.criteriosPropios}`);
  if (e.palabras) {
    out.push("### Palabras de esta edición");
    out.push(tabla(e.palabras.columnas, e.palabras.alineacion, e.palabras.filas.map((f) => [f.general, f.edicion])));
  }
  for (const a of e.areas) out.push(...areaDeLaEdicion(a, nombres));
  return out;
}

function parte(p: Parte, nombres: Map<Letra, string>): string[] {
  const out = p.bloques.map(bloqueComoTexto);
  if (p.tipo === "matriz") for (const a of p.areas) out.push(...areaDeLaMatriz(a, nombres));
  if (p.tipo === "ediciones") for (const e of p.ediciones) out.push(...edicion(e, nombres));
  return out;
}

// ── La entrada ────────────────────────────────────────────────────────────────

/** Los datos → el `.md`, con saltos de línea LF y una línea en blanco entre bloques. */
export function generarMarkdown(datos: EscalaDatos): string {
  const nombres = nombresDeLosNiveles(datos);
  const encabezado = ["---", ...datos.encabezado.map((c) => `${c.clave}: ${c.valor}`), "---"].join("\n");
  const cuerpo = datos.partes.flatMap((p) => parte(p, nombres));
  return `${[encabezado, ...cuerpo].join("\n\n")}\n`;
}

/** La versión que dicen los datos (el campo `version` del encabezado). */
export function versionDeLosDatos(datos: Pick<EscalaDatos, "encabezado">): string | null {
  return datos.encabezado.find((c) => c.clave === "version")?.valor ?? null;
}

/**
 * La forma de LECTURA que usan las pantallas (`Escala`), armada desde los datos. Lanza
 * `ErrorDeFormato` si los datos no forman una escala que el lector entiende.
 */
export function escalaDeLosDatos(datos: EscalaDatos): Escala {
  return parsearEscala(generarMarkdown(datos));
}
