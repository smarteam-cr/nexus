/**
 * lib/escala/guia.ts — cómo se muestra un documento publicado en la vista «Guía». PURO.
 *
 * Nada se reescribe: se saca el encabezado `--- … ---` y, en la escala, la Parte 3 (la matriz, que
 * se recorre en las otras vistas) queda como una nota que manda a ellas.
 */
import { slugDe } from "./documento/parsear";
import type { DocumentoDeLaEscala } from "./documento/documentos";

export function prepararDocumento(texto: string, documento: DocumentoDeLaEscala): string {
  let t = texto.replace(/\r\n?/g, "\n");
  if (t.startsWith("---\n")) {
    const fin = t.indexOf("\n---\n", 4);
    if (fin !== -1) t = t.slice(fin + 5);
  }
  if (documento === "escala") {
    const lineas = t.split("\n");
    const i = lineas.findIndex((l) => /^# Parte 3\b/.test(l));
    if (i !== -1) {
      const j = lineas.findIndex((l, k) => k > i && /^# /.test(l));
      const nota = [
        lineas[i],
        "",
        "> La matriz —cada área con sus dimensiones, niveles y criterios— se recorre en las vistas **Matriz**, **Por dimensión** y **Mapa** de esta sección, con el filtro de perfil y los comentarios.",
        "",
      ];
      t = [...lineas.slice(0, i), ...nota, ...(j === -1 ? [] : lineas.slice(j))].join("\n");
    }
  }
  return t.trim();
}

/** El índice: los encabezados de primer y segundo nivel, con el id que lleva cada uno en la página. */
export function indiceDe(markdown: string): { nivel: 1 | 2; texto: string; id: string }[] {
  return markdown
    .split("\n")
    .map((l) => /^(#{1,2}) (.+)$/.exec(l))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ nivel: m[1].length as 1 | 2, texto: m[2].trim(), id: slugDe(m[2]) }));
}
