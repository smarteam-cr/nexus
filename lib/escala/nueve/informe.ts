/**
 * lib/escala/nueve/informe.ts — lo que el borrador 9.0.0 le deja a Elías: la parte «Lo que falta decidir»
 * dentro del borrador, la nota de cada cambio en la bitácora y el informe de trazabilidad del repo. PURO.
 *
 * «Lo que falta decidir» es una parte de prosa del propio borrador, la segunda del documento (después de
 * «Cómo leer este documento»): se ve en /escala/borrador y en el `.md` que se baja. Es del borrador y sale
 * antes de publicar: publicar una versión que la tenga se frena (`tieneLoQueFaltaDecidir`,
 * lib/escala/datos/reglas.ts) e INV59 avisa si alguna publicada la trae.
 */
import { TITULO_DE_LO_QUE_FALTA_DECIDIR } from "@/lib/escala/datos/reglas";
import type { Bloque, EscalaDatos, ParteDeProsa } from "@/lib/escala/datos/tipos";
import { aplicarEntrada, estadoInicial, type Consecuencia, type EstadoDelBorrador } from "./aplicar";
import type { Entrada, EstadoDeLaEntrada } from "./tipos";

export const ETIQUETA_DEL_ESTADO: Record<EstadoDeLaEntrada, string> = {
  aplicada: "Propuesta aplicada",
  "aplicada-con-redaccion": "Propuesta aplicada, con redacción de Claude",
  parcial: "Aplicada en parte; el resto queda como pregunta",
  pregunta: "No entra: queda como pregunta",
  "despues-de-la-prueba": "Después de la prueba con clientes",
  "texto-pendiente": "Falta escribirlo en la prosa antes de publicar",
};

/** La nota de la bitácora de cada cambio: de dónde sale y qué se hizo. */
export function notaDeLaBitacora(e: Entrada): string {
  const fuente = e.fuente === "insider" ? "docs/escala-engagement-avanzado-plan.md" : "docs/escala/pendiente-9-0.md";
  return [`9.0 · ${e.punto} (${fuente}, ${e.tema}). ${ETIQUETA_DEL_ESTADO[e.estado]}: ${e.resumen}`, e.pregunta ? `Pregunta: ${e.pregunta}` : null, e.habilita ? `Lo habilita: ${e.habilita}` : null]
    .filter(Boolean)
    .join(" ");
}

export interface DetalleDeEntrada {
  entrada: Entrada;
  /** Los identificadores que entraron con esta entrada (alias → id). */
  nuevos: Record<string, string>;
  retirados: string[];
  consecuencias: Consecuencia[];
}

/** Aplica el catálogo entrada por entrada y guarda qué hizo cada una (para la bitácora y el informe). */
export function aplicarConDetalle(datos: EscalaDatos, retiradosPrevios: readonly string[], catalogo: readonly Entrada[]): { estado: EstadoDelBorrador; detalle: DetalleDeEntrada[]; pasos: EscalaDatos[] } {
  let s = estadoInicial(datos, retiradosPrevios);
  const detalle: DetalleDeEntrada[] = [];
  const pasos: EscalaDatos[] = [];
  for (const entrada of catalogo) {
    const antes = s;
    s = aplicarEntrada(s, entrada);
    detalle.push({
      entrada,
      nuevos: Object.fromEntries(Object.entries(s.alias).filter(([k]) => !(k in antes.alias))),
      retirados: s.retirados.slice(antes.retirados.length),
      consecuencias: s.consecuencias.slice(antes.consecuencias.length),
    });
    pasos.push(s.datos);
  }
  return { estado: s, detalle, pasos };
}

function nombreDeLaEdicion(datos: EscalaDatos, clave: string): string {
  for (const p of datos.partes) if (p.tipo === "ediciones") for (const e of p.ediciones) if (e.clave === clave) return e.nombre;
  return clave;
}

const conPunto = (e: Entrada, texto: string) => `${texto} (${e.punto})`;

/** La parte «Lo que falta decidir» del borrador. */
export function parteLoQueFaltaDecidir(version: string, estado: EstadoDelBorrador, catalogo: readonly Entrada[]): ParteDeProsa {
  // Lo que pregunta algo («¿…?») es una pregunta; lo demás que queda pendiente es texto por escribir.
  const pendientes = catalogo.filter((e) => e.estado !== "despues-de-la-prueba" && (e.pregunta || e.estado === "texto-pendiente"));
  const preguntas = pendientes.filter((e) => e.pregunta?.includes("¿"));
  const textos = pendientes.filter((e) => !e.pregunta?.includes("¿"));
  const prueba = catalogo.filter((e) => e.estado === "despues-de-la-prueba");
  const cuenta = (est: EstadoDeLaEntrada) => catalogo.filter((e) => e.estado === est).length;

  const porEdicion = new Map<string, string[]>();
  for (const c of estado.consecuencias) {
    const id = /^(\d+\.\d+\.[DIFEO]\d+)/.exec(c.texto)?.[1];
    if (id) porEdicion.set(c.edicion, [...new Set([...(porEdicion.get(c.edicion) ?? []), id])]);
  }

  const bloques: Bloque[] = [
    { tipo: "titulo", nivel: 1, texto: `${TITULO_DE_LO_QUE_FALTA_DECIDIR(version)}` },
    {
      tipo: "parrafo",
      texto:
        "Esta parte es del borrador y sale antes de publicar: Nexus no deja publicar una versión que la tenga. El borrador sale de la 8.9.1 con lo pendiente para la 9.0 (docs/escala/pendiente-9-0.md, 17 temas y 124 puntos) y los cambios de engagement avanzado (docs/escala-engagement-avanzado-plan.md). Cada cambio está en la bitácora con el punto que lo pide; el detalle, en docs/escala/borrador-9-0.md. Se publica después de probar la 8.9.1 con 5 a 8 clientes de varias industrias (nunca Wherex).",
    },
    {
      tipo: "parrafo",
      texto: `De ${catalogo.length} entradas (los puntos del documento, juntos donde van juntos, y lo de engagement avanzado): ${cuenta("aplicada")} entraron como los proponía el documento, ${cuenta("aplicada-con-redaccion")} entraron con redacción de Claude, ${cuenta("parcial")} entraron en parte, ${cuenta("pregunta")} quedan como pregunta, ${cuenta("texto-pendiente")} piden cambiar la prosa y ${cuenta("despues-de-la-prueba")} esperan la prueba.`,
    },
    { tipo: "titulo", nivel: 2, texto: "Preguntas para decidir" },
    { tipo: "numerada", items: preguntas.map((e) => conPunto(e, e.pregunta!)) },
    { tipo: "titulo", nivel: 2, texto: "Lo que falta escribir antes de publicar" },
    { tipo: "numerada", items: textos.map((e) => conPunto(e, e.pregunta ?? e.resumen)) },
    { tipo: "titulo", nivel: 2, texto: "Lo que espera la prueba con clientes" },
    { tipo: "numerada", items: prueba.map((e) => conPunto(e, e.pregunta ?? e.resumen)) },
    { tipo: "titulo", nivel: 2, texto: "Las ediciones" },
    {
      tipo: "parrafo",
      texto:
        "Cuando un criterio general cambió de texto o salió, lo que cada edición decía de él con sus palabras se soltó: hasta reescribirlo, la edición lo lee como el general. Los criterios nuevos de la general entran en «Se leen igual» de cada edición que toca su dimensión. Lo que hay que revisar en cada una:",
    },
    {
      tipo: "lista",
      items: [...porEdicion.entries()].map(([clave, ids]) => `**${nombreDeLaEdicion(estado.datos, clave)}.** ${ids.length} criterio(s) que la edición decía con sus palabras y hay que revisar: ${ids.join(", ")}.`),
    },
    { tipo: "titulo", nivel: 2, texto: "Identificadores que se retiran" },
    {
      tipo: "parrafo",
      texto: `Al publicar se suman a la lista de retirados de la especificación (prueba 5): ${estado.retirados.join(", ")}.`,
    },
  ];
  return { tipo: "prosa", bloques: bloques.filter((b) => !(b.tipo === "numerada" && b.items.length === 0) && !(b.tipo === "lista" && b.items.length === 0)) };
}

/** Los datos del borrador con «Lo que falta decidir» como segunda parte (la reemplaza si ya estaba). */
export function conLoQueFaltaDecidir(datos: EscalaDatos, parte: ParteDeProsa): EscalaDatos {
  const nuevos = structuredClone(datos);
  const titulo = parte.bloques[0]?.tipo === "titulo" ? parte.bloques[0].texto : "";
  nuevos.partes = nuevos.partes.filter((p) => !(p.tipo === "prosa" && p.bloques[0]?.tipo === "titulo" && p.bloques[0].texto === titulo));
  nuevos.partes.splice(1, 0, parte);
  return nuevos;
}

const celda = (t: string) => t.replace(/\|/g, "\\|").replace(/\n/g, " ");

/** El informe de trazabilidad (docs/escala/borrador-9-0.md): cada punto, qué se hizo y con qué identificadores. */
export function informeEnMarkdown(version: string, estado: EstadoDelBorrador, detalle: readonly DetalleDeEntrada[]): string {
  const l: string[] = [
    `# Borrador ${version} de la escala — trazabilidad`,
    "",
    "> Generado por `npx tsx scripts/escala-borrador-9-0.ts --informe` desde `lib/escala/nueve/catalogo.ts`. No se edita a mano: se cambia el catálogo y se vuelve a generar.",
    "",
    "El borrador sale de la 8.9.1 publicada. Cada fila es un punto de las fuentes y dice qué se hizo con él. Los",
    "identificadores nuevos los da el aplicador (el número que sigue en su nivel, sin reusar un retirado). La misma",
    "información va en la nota de cada cambio de la bitácora del borrador, en `/escala/borrador`.",
    "",
    "Fuentes: `docs/escala/pendiente-9-0.md` (§1 a §17) y `docs/escala-engagement-avanzado-plan.md` (Insider 1 a 16 y la",
    "lectura de preparación).",
    "",
    "| Punto | Qué se hizo | Entra | Sale | Lo habilita |",
    "|:--|:--|:--|:--|:--|",
  ];
  for (const d of detalle) {
    const e = d.entrada;
    const entra = Object.values(d.nuevos).join(", ");
    l.push(`| ${celda(e.punto)} | **${ETIQUETA_DEL_ESTADO[e.estado]}.** ${celda(e.resumen)}${e.pregunta ? ` *Pregunta o pendiente:* ${celda(e.pregunta)}` : ""} | ${entra || "—"} | ${d.retirados.join(", ") || "—"} | ${celda(e.habilita ?? "—")} |`);
  }
  l.push("", "## Lo que cada edición tiene que reescribir", "");
  const porEdicion = new Map<string, Consecuencia[]>();
  for (const c of estado.consecuencias) porEdicion.set(c.edicion, [...(porEdicion.get(c.edicion) ?? []), c]);
  for (const [clave, cs] of porEdicion) {
    l.push(`### ${nombreDeLaEdicion(estado.datos, clave)}`, "");
    for (const c of cs) l.push(`- ${c.texto} (${c.punto})`);
    l.push("");
  }
  l.push("## Identificadores que se retiran", "", estado.retirados.map((x) => `\`${x}\``).join(", ") + ".", "");
  return l.join("\n");
}
