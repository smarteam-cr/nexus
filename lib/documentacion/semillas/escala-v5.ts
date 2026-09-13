/**
 * lib/documentacion/semillas/escala-v5.ts — el reglamento de la Escala, leído del documento.
 *
 * La Escala de Rendimiento v5.2.0 son ~1.000 líneas: 3 áreas × 8 dimensiones × 5 niveles, con
 * sus señales. Tipearlas a mano en la siembra sería copiarlas mal una vez y desincronizarlas
 * para siempre, así que la fuente es el documento (`escala-rendimiento-v5.md`, versionado al
 * lado) y esto lo convierte en estructura.
 *
 * ⚠ Lo leen SOLO la siembra y los tests (usa `fs`): nunca la app.
 *
 * ── LO QUE NO SE ADIVINA ─────────────────────────────────────────────────────
 * Las tres dimensiones sin nivel Funcional se detectan por su MARCA en el texto («Sin nivel
 * Funcional»), no por su número. Hardcodear 1.7/3.7/3.8 haría que el día que el reglamento
 * cambie de opinión, la página siga diciendo lo viejo sin que nada avise — y el caso ya existe:
 * la 1.8 sí admite Funcional aunque sea una dimensión de la misma capa.
 */
import fs from "node:fs";
import path from "node:path";
import { NIVELES_ESCALA } from "@/lib/escala/fuente";

/* Una sola lista de niveles para todo el repo: la usan también el renderer de la sección y los
   generadores, que no pueden importar este archivo porque lee del disco. */
export const NIVELES_V5 = NIVELES_ESCALA;
export type NombreDeNivel = (typeof NIVELES_V5)[number];

export interface NivelDeDimension {
  /** 1 Deficiente … 5 Óptimo. Es el nivel mismo expresado como cifra, no una nota aparte. */
  valor: number;
  nombre: NombreDeNivel;
  /** La frase que resume el nivel en esta dimensión. */
  resumen: string;
  /** Las señales observables con las que se reconoce. */
  senales: string[];
  /** El nivel NO existe para esta dimensión (su piso es Eficiente). */
  ausente: boolean;
}

export interface DimensionV5 {
  /** "1.1" — el identificador estable; los nombres se pueden afinar, los números no. */
  id: string;
  nombre: string;
  capa: "base" | "produccion";
  /** La pregunta concreta que responde la dimensión. */
  pregunta: string;
  niveles: NivelDeDimension[];
  sinFuncional: boolean;
}

export interface AreaV5 {
  numero: number;
  nombre: string;
  intro: string;
  dimensiones: DimensionV5[];
}

/** Un nivel visto desde arriba: cómo se ve en cada área. */
export interface PanoramaDeNivel {
  nivel: NombreDeNivel;
  porArea: { area: string; texto: string }[];
}

export interface ReglamentoV5 {
  version: string;
  panorama: PanoramaDeNivel[];
  areas: AreaV5[];
}

export const RUTA_REGLAMENTO_V5 = path.join(
  process.cwd(),
  "lib",
  "documentacion",
  "semillas",
  "escala-rendimiento-v5.md",
);

/** Saca los asteriscos de énfasis: el contenido se guarda como texto, con su formato aparte. */
function limpiar(texto: string): string {
  return texto.replace(/\*\*/g, "").replace(/\*/g, "").replace(/\s+/g, " ").trim();
}

/** El primer párrafo de un bloque (lo que va antes del primer nivel o subtítulo). */
function primerParrafo(texto: string): string {
  for (const crudo of texto.split(/\n{2,}/)) {
    const linea = crudo.trim();
    if (!linea || linea.startsWith("#") || linea.startsWith("**") || linea.startsWith("-")) continue;
    return limpiar(linea);
  }
  return "";
}

function nivelesDe(chunk: string): NivelDeDimension[] {
  const patron = new RegExp(
    `\\*\\*(${NIVELES_V5.join("|")})\\.\\*\\*([^\\n]*)\\n?([\\s\\S]*?)(?=\\n\\*\\*(?:${NIVELES_V5.join("|")})\\.\\*\\*|$)`,
    "g",
  );
  const niveles: NivelDeDimension[] = [];
  for (const m of chunk.matchAll(patron)) {
    const nombre = m[1] as NombreDeNivel;
    const resumen = limpiar(m[2] ?? "");
    const cuerpo = m[3] ?? "";
    const senales = cuerpo
      .split("\n")
      .filter((l) => l.trimStart().startsWith("- "))
      .map((l) => limpiar(l.trim().slice(2)))
      .filter(Boolean);
    niveles.push({
      valor: NIVELES_V5.indexOf(nombre) + 1,
      nombre,
      resumen,
      senales,
      ausente: /Sin nivel Funcional/i.test(resumen),
    });
  }
  return niveles;
}

/** Las dimensiones de UNA capa. El texto que entra ya es solo el de esa capa. */
function dimensionesDeLaCapa(texto: string, capa: "base" | "produccion"): DimensionV5[] {
  const dimensiones: DimensionV5[] = [];
  for (const parte of texto.split(/\n(?=#### \d\.\d )/)) {
    const encabezado = parte.match(/^#### (\d\.\d) (.+)$/m);
    if (!encabezado) continue;

    const desdeElTitulo = parte.slice(parte.indexOf(encabezado[0]) + encabezado[0].length);
    const niveles = nivelesDe(desdeElTitulo);
    dimensiones.push({
      id: encabezado[1],
      nombre: encabezado[2].trim(),
      capa,
      pregunta: primerParrafo(desdeElTitulo),
      niveles,
      sinFuncional: niveles.some((n) => n.ausente),
    });
  }
  return dimensiones;
}

/**
 * Parte el área por el encabezado que separa las dos capas y lee cada mitad con su capa fija.
 *
 * ⚠ NO se puede arrastrar la capa mientras se recorren las dimensiones: «### Producción» cae
 * DENTRO del bloque de la última dimensión de base (después de sus señales y antes del próximo
 * «####»), así que el cambio de capa llegaba una dimensión antes de tiempo — 3 de base y 5 de
 * producción en vez de 4 y 4.
 */
function dimensionesDe(cuerpoDelArea: string): DimensionV5[] {
  const corte = cuerpoDelArea.indexOf("### Producción");
  const base = corte < 0 ? cuerpoDelArea : cuerpoDelArea.slice(0, corte);
  const produccion = corte < 0 ? "" : cuerpoDelArea.slice(corte);
  return [
    ...dimensionesDeLaCapa(base, "base"),
    ...dimensionesDeLaCapa(produccion, "produccion"),
  ];
}

function panoramaDe(texto: string): PanoramaDeNivel[] {
  const desde = texto.indexOf("## Los cinco niveles de un vistazo");
  if (desde < 0) return [];
  const hasta = texto.indexOf("\n## ", desde + 1);
  const bloque = texto.slice(desde, hasta < 0 ? undefined : hasta);

  const panorama: PanoramaDeNivel[] = [];
  for (const m of bloque.matchAll(/\n### (.+)\n([\s\S]*?)(?=\n### |$)/g)) {
    const nivel = m[1].trim() as NombreDeNivel;
    if (!(NIVELES_V5 as readonly string[]).includes(nivel)) continue;
    const porArea = [...m[2].matchAll(/\*\*(Ventas|Marketing|Servicio)\.\*\*([\s\S]*?)(?=\n\*\*|$)/g)].map(
      (a) => ({ area: a[1], texto: limpiar(a[2]) }),
    );
    panorama.push({ nivel, porArea });
  }
  return panorama;
}

/** Lee el reglamento y lo devuelve como estructura. */
export function leerReglamentoV5(ruta: string = RUTA_REGLAMENTO_V5): ReglamentoV5 {
  // El documento puede venir con saltos de Windows según quién lo haya guardado.
  const texto = fs.readFileSync(ruta, "utf8").replace(/\r\n/g, "\n");

  const version = texto.match(/^version:\s*(.+)$/m)?.[1]?.trim() ?? "";

  const areas: AreaV5[] = [];
  const encabezados = [...texto.matchAll(/^## Área (\d) — (.+)$/gm)];
  encabezados.forEach((enc, i) => {
    const desde = enc.index ?? 0;
    const siguiente = encabezados[i + 1]?.index;
    const finDeSeccion = texto.indexOf("\n# ", desde + 1);
    const hasta = Math.min(
      siguiente ?? Number.MAX_SAFE_INTEGER,
      finDeSeccion < 0 ? Number.MAX_SAFE_INTEGER : finDeSeccion,
    );
    const cuerpo = texto.slice(desde, hasta === Number.MAX_SAFE_INTEGER ? undefined : hasta);
    areas.push({
      numero: Number(enc[1]),
      nombre: enc[2].trim(),
      intro: primerParrafo(cuerpo.slice(enc[0].length)),
      dimensiones: dimensionesDe(cuerpo),
    });
  });

  return { version, panorama: panoramaDe(texto), areas };
}
