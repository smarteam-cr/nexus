/**
 * lib/ui/print-css.test.ts — las reglas de impresión de la app siguen existiendo.
 *
 * ── EL BUG QUE HABRÍA CAZADO ─────────────────────────────────────────────────
 * Un comentario de `app/globals.css` nombraba una ruta con comodines. Los comentarios CSS no
 * anidan y terminan en la PRIMERA aparición de asterisco-barra, así que el comodín cerró el
 * comentario en mitad de la frase; el resto del texto quedó como código, arrancó un selector
 * inválido, y su prelude se acumuló hasta la primera llave que apareció — la de
 * `@media print`. El bloque de impresión entero pasó a ser el cuerpo de ese selector roto y
 * se descartó: se perdieron `.no-print { display: none }`, los márgenes de la hoja, los
 * `break-inside: avoid` de las tarjetas y el fondo blanco forzado.
 *
 * Y no lo vio NADIE: `tsc` no mira CSS, no hay tests de CSS, y lightningcss —el motor que usa
 * Tailwind— lo reporta como WARNING y sigue, así que el build quedó verde. El síntoma solo
 * aparecía al imprimir: la barra de herramientas salía impresa en la primera hoja.
 *
 * ── EL CRITERIO ──────────────────────────────────────────────────────────────
 * Después de quitar los comentarios, las reglas de impresión tienen que seguir estando. Se
 * comprueba sobre el CSS ya despojado de comentarios, que es exactamente lo que ve el
 * navegador: si un comentario se cierra antes de tiempo, su texto sobrevive al despojado y
 * las reglas de abajo desaparecen.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const globals = fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

/** Quita los comentarios con la MISMA regla que el navegador: no anidan, cierran en el primero. */
function sinComentarios(css: string): string {
  let out = "";
  let i = 0;
  while (i < css.length) {
    if (css[i] === "/" && css[i + 1] === "*") {
      const fin = css.indexOf("*/", i + 2);
      i = fin === -1 ? css.length : fin + 2;
    } else {
      out += css[i];
      i++;
    }
  }
  return out;
}

describe("app/globals.css conserva sus reglas de impresión", () => {
  const codigo = sinComentarios(globals);

  it("el bloque `@media print` sigue siendo una regla, no texto suelto", () => {
    expect(codigo, "se perdió el @media print — casi seguro un comentario que cerró antes")
      .toMatch(/@media\s+print\s*\{/);
  });

  it("y adentro siguen las reglas que hacen imprimible la vista genérica", () => {
    const bloque = /@media\s+print\s*\{([\s\S]*)$/.exec(codigo)?.[1] ?? "";
    // `.no-print` es la que más se nota: sin ella la barra de herramientas sale impresa.
    expect(bloque, "falta `.no-print` — la barra de «Imprimir» saldría en la hoja").toContain(
      ".no-print",
    );
    expect(bloque, "faltan los márgenes de la hoja del documento").toContain(".cp-doc");
    expect(bloque, "faltan las reglas de corte: las tarjetas se parten entre hojas").toContain(
      "break-inside",
    );
  });

  it("ningún comentario se cierra antes de tiempo (la causa raíz)", () => {
    /* Meta-guarda: un comentario que arranca y nunca cierra con su propio delimitador deja
       texto de prosa como si fuera código. Se detecta buscando restos de prosa fuera de los
       comentarios — acentos y comillas tipográficas no existen en CSS real. */
    const prosa = codigo.match(/[áéíóúñ¿¡—⚠]/g) ?? [];
    expect(
      prosa.length,
      `quedaron ${prosa.length} caracteres de prosa FUERA de los comentarios: hay un ` +
        "comentario que cierra antes de tiempo y está rompiendo las reglas que le siguen",
    ).toBe(0);
  });
});
