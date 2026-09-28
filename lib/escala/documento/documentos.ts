/**
 * lib/escala/documento/documentos.ts — los tres documentos de la escala. PURO.
 *
 * La escala viaja con dos documentos más (su Parte «Cómo leer este documento» los nombra):
 * la especificación del cálculo y el manual de operación. Los tres se publican en Nexus y se
 * descargan tal cual, con su nombre de archivo fijo: la escala se cita por ese nombre.
 */

export type DocumentoDeLaEscala = "escala" | "especificacion" | "manual";

export const DOCUMENTOS_DE_LA_ESCALA: readonly {
  clave: DocumentoDeLaEscala;
  /** El nombre fijo del archivo, en `docs/escala/` y al descargar. */
  archivo: string;
  /** Cómo se llama en la pantalla. */
  titulo: string;
  /** Para quién es, en una línea. */
  paraQuien: string;
}[] = [
  {
    clave: "escala",
    archivo: "escala_rendimiento_smarteam.md",
    titulo: "Escala de Rendimiento",
    paraQuien: "La que se lee, se enseña y se pega en otros chats.",
  },
  {
    clave: "especificacion",
    archivo: "especificacion_calculo_escala.md",
    titulo: "Especificación del cálculo",
    paraQuien: "Para quien implementa el chequeo, el diagnóstico o los agentes.",
  },
  {
    clave: "manual",
    archivo: "manual_operacion_escala.md",
    titulo: "Manual de operación",
    paraQuien: "Cómo trabaja el equipo con la escala, y los cambios pendientes.",
  },
];

export function esDocumentoDeLaEscala(x: string): x is DocumentoDeLaEscala {
  return DOCUMENTOS_DE_LA_ESCALA.some((d) => d.clave === x);
}

export function documentoPorClave(clave: DocumentoDeLaEscala) {
  return DOCUMENTOS_DE_LA_ESCALA.find((d) => d.clave === clave)!;
}
