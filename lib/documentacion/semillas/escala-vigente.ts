/**
 * lib/documentacion/semillas/escala-vigente.ts — lo que la base de conocimiento lee del documento
 * OFICIAL de la Escala (`docs/escala/escala_rendimiento_smarteam.md`, el mismo que se publica en
 * Nexus → Escala).
 *
 * La base no repite la matriz: el detalle de cada criterio vive en Nexus → Escala, que es la fuente
 * única. De acá salen solo dos cosas, para que no envejezcan escritas a mano:
 *   · la VERSIÓN vigente, que la página nombra;
 *   · «Los cinco niveles de un vistazo», el texto con que se le devuelve el resultado al cliente.
 *
 * ⚠ Lo leen SOLO la siembra y los tests (usa `fs`): nunca la app.
 *
 * El banco de preguntas de «Descubrimiento» sigue saliendo de la v5 (`escala-v5.ts`): las preguntas
 * son por dimensión y siguen valiendo. Pasarlo a la vigente es otra tanda.
 */
import fs from "node:fs";
import path from "node:path";

export const RUTA_ESCALA_VIGENTE = path.join(process.cwd(), "docs", "escala", "escala_rendimiento_smarteam.md");

export const AREAS_DE_LA_ESCALA = ["Ventas", "Marketing", "Servicio"] as const;
export type AreaDeLaEscala = (typeof AREAS_DE_LA_ESCALA)[number];

export const NIVELES_DE_LA_ESCALA = ["Deficiente", "Inicial", "Funcional", "Eficiente", "Óptimo"] as const;

export interface EscalaVigente {
  version: string;
  fecha: string;
  /** Por nivel, el texto de cada área tal como lo dice el documento. */
  panorama: { nivel: string; porArea: Record<AreaDeLaEscala, string> }[];
}

/** Lee la versión y el panorama de los cinco niveles. Falla fuerte si el documento cambió de forma. */
export function leerEscalaVigente(ruta: string = RUTA_ESCALA_VIGENTE): EscalaVigente {
  const md = fs.readFileSync(ruta, "utf8").replace(/\r\n/g, "\n");

  const version = /^version:\s*(.+)$/m.exec(md)?.[1]?.trim();
  const fecha = /^fecha:\s*(.+)$/m.exec(md)?.[1]?.trim() ?? "";
  if (!version) throw new Error(`No encuentro la versión en ${ruta}`);

  const inicio = md.indexOf("## Los cinco niveles de un vistazo");
  if (inicio < 0) throw new Error(`No encuentro «Los cinco niveles de un vistazo» en ${ruta}`);
  const resto = md.slice(inicio + 3);
  const fin = resto.search(/\n## /);
  const seccion = fin < 0 ? resto : resto.slice(0, fin);

  const panorama = NIVELES_DE_LA_ESCALA.map((nivel) => {
    const bloque = new RegExp(`### ${nivel}\\n([\\s\\S]*?)(?=\\n### |$)`).exec(seccion)?.[1] ?? "";
    const porArea = Object.fromEntries(
      AREAS_DE_LA_ESCALA.map((area) => {
        const texto = new RegExp(`\\*\\*${area}\\.\\*\\*\\s*(.+)`).exec(bloque)?.[1]?.trim();
        if (!texto) throw new Error(`Falta el texto de ${area} en el nivel ${nivel} (${ruta})`);
        return [area, texto];
      }),
    ) as Record<AreaDeLaEscala, string>;
    return { nivel, porArea };
  });

  return { version, fecha, panorama };
}
