/**
 * lib/knowledge/escala-v5-documentos.ts — la Escala 5.2 tal como la leen los AGENTES.
 *
 * Documentación y Conocimientos salen del MISMO archivo (`escala-rendimiento-v5.md`): la página que
 * lee el equipo y el documento que lee un agente no pueden decir cosas distintas. Hasta el
 * 2026-09-12 las decían — Conocimientos tenía la v4 y la 5.2 vivía solo en Documentación, que
 * ningún agente lee.
 *
 * Dos documentos, cada uno con su lector:
 *   · el REGLAMENTO completo — la vara del Diagnóstico, que ubica al cliente dimensión por
 *     dimensión y necesita todas las señales;
 *   · el RESUMEN para posicionar — la Propuesta, el Kickoff y la Entrega hablan del nivel, no lo
 *     asignan. No necesitan 58.000 caracteres de señales, y la propuesta ya tarda un minuto.
 *
 * ⚠ Lo leen SOLO la siembra y las pruebas (usa `fs`): nunca la app. La app lee lo sembrado.
 */
import fs from "node:fs";
import {
  leerReglamentoV5,
  NIVELES_V5,
  RUTA_REGLAMENTO_V5,
  type ReglamentoV5,
} from "@/lib/documentacion/semillas/escala-v5";

export const TITULO_ESCALA_COMPLETA = "Escala de Rendimiento Smarteam";
export const TITULO_ESCALA_RESUMEN = "Escala de Rendimiento — resumen para posicionar";

export interface DocumentoDeEscala {
  titulo: string;
  /** La columna `summary`: una línea para los listados. */
  sumario: string;
  /** La columna `content`: el markdown que recibe el agente. */
  contenido: string;
}

export interface DocumentosDeEscala {
  version: string;
  fecha: string;
  completo: DocumentoDeEscala;
  resumen: DocumentoDeEscala;
}

/**
 * El cuerpo de un encabezado del reglamento, hasta el próximo encabezado de su nivel o de uno
 * mayor. Sin el separador `---` que cierra las partes grandes.
 *
 * ⛔ Si el encabezado ya no existe, FALLA. Un resumen armado con un pedazo vacío se sembraría sin
 * que nadie note que le falta cómo se lee la brecha.
 */
export function cuerpoDe(texto: string, encabezado: string): string {
  const marca = `\n${encabezado}\n`;
  const inicio = texto.indexOf(marca);
  if (inicio < 0) {
    throw new Error(
      `El reglamento ya no tiene el encabezado «${encabezado}»: actualizá lib/knowledge/escala-v5-documentos.ts.`,
    );
  }
  const nivel = (encabezado.match(/^#+/)?.[0] ?? "#").length;
  const resto = texto.slice(inicio + marca.length);
  const fin = resto.search(new RegExp(`\\n#{1,${nivel}} `));
  return (fin < 0 ? resto : resto.slice(0, fin)).trim().replace(/\n*-{3,}$/, "").trim();
}

/** La versión que declara un contenido ya sembrado; `null` si no declara ninguna (la v4 no lo hacía). */
export function versionDeContenido(contenido: string): string | null {
  return (
    contenido.match(/^Versión (\d+\.\d+\.\d+)/m)?.[1] ?? contenido.match(/^version:\s*(\S+)/m)?.[1] ?? null
  );
}

function partirFrontMatter(texto: string): { cuerpo: string; version: string; fecha: string } {
  const m = texto.match(/^---\n([\s\S]*?)\n---\n/);
  const cabecera = m?.[1] ?? "";
  return {
    cuerpo: m ? texto.slice(m[0].length) : texto,
    version: cabecera.match(/^version:\s*(.+)$/m)?.[1]?.trim() ?? "",
    fecha: cabecera.match(/^fecha:\s*(.+)$/m)?.[1]?.trim() ?? "",
  };
}

function resumenDe(texto: string, reglamento: ReglamentoV5, version: string, fecha: string): string {
  const escala = NIVELES_V5.map((n, i) => `${i + 1} ${n}`).join(" · ");
  const sinFuncional = reglamento.areas.flatMap((a) =>
    a.dimensiones.filter((d) => d.sinFuncional).map((d) => `${d.id} ${d.nombre} (${a.nombre})`),
  );

  const panorama = reglamento.panorama.map((p) =>
    [`### ${p.nivel}`, ...p.porArea.map((a) => `- **${a.area}:** ${a.texto}`)].join("\n"),
  );

  const dimensiones = reglamento.areas.map((a) => {
    const deCapa = (capa: "base" | "produccion") =>
      a.dimensiones
        .filter((d) => d.capa === capa)
        .map((d) => `- ${d.id} ${d.nombre} — ${d.pregunta}`)
        .join("\n");
    return [`### ${a.numero} ${a.nombre}`, "Base operativa:", deCapa("base"), "Producción:", deCapa("produccion")].join(
      "\n",
    );
  });

  return [
    `Versión ${version} · ${fecha}`,
    "",
    "Este resumen sirve para HABLAR de la Escala en una propuesta, un kickoff o una entrega. Para ASIGNAR un nivel dimensión por dimensión hace falta el reglamento completo («Escala de Rendimiento Smarteam»), y eso lo hace el Diagnóstico. Es la única versión vigente: si en otro lado aparece otra escala u otros nombres de nivel, manda esta.",
    "",
    "## Qué es",
    cuerpoDe(texto, "# Introducción"),
    "",
    "## Los cinco niveles",
    escala,
    "",
    "## Cómo se lee un resultado",
    cuerpoDe(texto, "## El nivel: de la dimensión al departamento"),
    "",
    "### Cómo se relacionan las dos capas",
    cuerpoDe(texto, "### Cómo se relacionan las dos capas"),
    "",
    "### Cercanía al siguiente nivel",
    cuerpoDe(texto, "## Cercanía al siguiente nivel"),
    "",
    "### Dimensiones sin nivel Funcional",
    `Su piso es Eficiente: ${sinFuncional.join(", ")}.`,
    "",
    "## Volver a medir",
    cuerpoDe(texto, "## Volver a medir"),
    "",
    "## La IA propone, una persona confirma",
    cuerpoDe(texto, "## Rol de la IA en el diagnóstico"),
    "",
    "## Cómo se ve cada nivel, por área",
    "Está escrito en el lenguaje con el que se le habla al cliente.",
    "",
    panorama.join("\n\n"),
    "",
    "## Las 24 dimensiones",
    "El identificador estable es el número; el nombre se puede afinar.",
    "",
    dimensiones.join("\n\n"),
    "",
    "## Cómo usar la Escala en un documento",
    "- En una PROPUESTA o un KICKOFF el nivel es un ESTIMADO, sacado de las conversaciones de venta: dilo siempre así («estimado, se confirma en el diagnóstico»). La ubicación oficial la da el Diagnóstico.",
    "- Nunca afirmes un nivel sin evidencia del contexto. Si no alcanza para un área, esa área no lleva nivel.",
    "- Habla por capa, no con una cifra suelta: «tu base operativa está en Funcional y tu producción en Inicial» dice qué hacer; «Ventas: Inicial» lo esconde.",
    "- La brecha entre capas es el argumento: base arriba es adopción; producción arriba es cimentar antes de empujar; parejas es subir el conjunto.",
    "- Proyecta el SIGUIENTE nivel, no dos arriba: proponerle Óptimo a un departamento Inicial lo abruma y no lo mueve.",
    "- En una ENTREGA no se declara un nivel nuevo: el cambio se comprueba en la remedición, entre 60 y 90 días después, con las mismas dimensiones.",
    "- La grafía de los niveles es exacta: Deficiente, Inicial, Funcional, Eficiente, Óptimo.",
  ].join("\n");
}

/** Arma los dos documentos desde el reglamento. */
export function construirDocumentosDeEscala(ruta: string = RUTA_REGLAMENTO_V5): DocumentosDeEscala {
  const crudo = fs.readFileSync(ruta, "utf8").replace(/\r\n/g, "\n");
  const { cuerpo, version, fecha } = partirFrontMatter(crudo);
  const reglamento = leerReglamentoV5(ruta);
  // `cuerpoDe` busca «\n# …»: el cuerpo tiene que empezar con un salto para encontrar el primero.
  const texto = `\n${cuerpo}`;

  return {
    version,
    fecha,
    completo: {
      titulo: TITULO_ESCALA_COMPLETA,
      sumario:
        `Reglamento de la Escala de Rendimiento, versión ${version}: cinco niveles (Deficiente → Óptimo) en Ventas, Marketing y Servicio, ` +
        "ocho dimensiones por área en dos capas (base operativa y producción), el nivel de cada capa por su dimensión más débil, " +
        "la brecha entre capas, las reglas de asignación y el formato de salida.",
      contenido: [
        `Versión ${version} · ${fecha}`,
        "",
        "Es la única versión vigente del reglamento: si en otro lado aparece otra escala u otros nombres de nivel, manda esta.",
        "",
        cuerpo.trim(),
      ].join("\n"),
    },
    resumen: {
      titulo: TITULO_ESCALA_RESUMEN,
      sumario:
        `La Escala de Rendimiento ${version} para posicionar en una propuesta, un kickoff o una entrega: los niveles, cómo se lee ` +
        "por capa y por brecha, cómo se ve cada nivel por área, las 24 dimensiones y cuándo se vuelve a medir.",
      contenido: resumenDe(texto, reglamento, version, fecha),
    },
  };
}
