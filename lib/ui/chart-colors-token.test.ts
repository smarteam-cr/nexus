/**
 * lib/ui/chart-colors-token.test.ts
 *
 * Un guard chiquito contra un error de hidratación que ya ocurrió y costó una pantalla.
 *
 * ── QUÉ PASÓ ────────────────────────────────────────────────────────────────────
 * `useChartColors` decide la paleta mirando `document.documentElement`. En el servidor no
 * hay `document`, así que devuelve la paleta OSCURA — pero el default del producto es
 * CLARO (`app/layout.tsx` lee la cookie `nexus-theme` y solo pone oscuro si está pedido).
 * Mientras esos colores viven dentro del `option` de ECharts no pasa nada: el canvas no
 * se hidrata. El día que uno de ellos aterrizó en un `style` inline —el swatch de la
 * leyenda de la curva de equilibrio— el servidor mandó #9ca3af, el cliente hidrató con
 * #6b7280 y React tiró el árbol entero. Le pasaba a TODOS, no a una minoría.
 *
 * ── LA REGLA QUE LO EVITA ───────────────────────────────────────────────────────
 * En HTML, el tema lo resuelve CSS y nunca JS. Por eso la leyenda pinta `var(--fg-muted)`
 * en vez del hex del hook.
 *
 * ── POR QUÉ ESTE TEST ───────────────────────────────────────────────────────────
 * Ese arreglo apoya el gráfico (hex, canvas) y su leyenda (token, HTML) en DOS fuentes que
 * hoy dicen lo mismo. El propio archivo del gráfico ya advierte que duplicar un color "era
 * garantizar que un día dejaran de coincidir". Sin este test, esa igualdad es una promesa
 * que nadie sostiene: alguien retoca `--fg-muted` en globals.css, el gráfico y su leyenda
 * quedan con dos grises distintos, y nada se pone rojo.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DARK, LIGHT } from "@/hooks/useChartColors";

const CSS = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

/**
 * El valor de una variable dentro de un bloque de tema.
 *
 * Se busca DENTRO del bloque y no en todo el archivo a propósito: el mismo nombre existe
 * dos veces —una por tema— y un match global devolvería siempre el primero, o sea que el
 * test pasaría en verde comparando el tema oscuro contra sí mismo.
 */
function tokenDe(selector: string, variable: string): string {
  // ⚠ Anclado a INICIO DE LÍNEA. Buscar el selector suelto encuentra primero la mención
  // que vive dentro de un comentario ("Resuelven a variables de :root / html.light"), y el
  // bloque que sale de ahí no contiene ninguna variable: el guard fallaba diciendo que el
  // token no existe, que es justo la mentira que un guard no se puede permitir.
  const abre = new RegExp(`^${selector.replace(".", "\\.")}\\s*\\{`, "m").exec(CSS);
  expect(abre, `no existe el bloque ${selector} en app/globals.css`).not.toBeNull();
  const desde = abre!.index + abre![0].length;
  const hasta = CSS.indexOf("\n}", desde);
  const bloque = CSS.slice(desde, hasta);
  const m = new RegExp(`${variable}\\s*:\\s*(#[0-9a-fA-F]{3,8})`).exec(bloque);
  expect(m, `${variable} no está definida dentro de ${selector}`).not.toBeNull();
  return m![1]!.toLowerCase();
}

describe("el gris del gráfico y el token de la leyenda son el mismo", () => {
  it("tema oscuro: axisLabelStrong === --fg-muted de :root", () => {
    expect(DARK.axisLabelStrong.toLowerCase()).toBe(tokenDe(":root", "--fg-muted"));
  });

  it("tema claro: axisLabelStrong === --fg-muted de html.light", () => {
    expect(LIGHT.axisLabelStrong.toLowerCase()).toBe(tokenDe("html.light", "--fg-muted"));
  });

  it("los dos temas NO valen lo mismo — si valieran, este guard no estaría probando nada", () => {
    // Un token que no flipea haría pasar los dos casos de arriba por casualidad.
    expect(DARK.axisLabelStrong.toLowerCase()).not.toBe(LIGHT.axisLabelStrong.toLowerCase());
  });
});

describe("ningún color del tema puede aterrizar en HTML desde JS", () => {
  const CURVA = readFileSync(
    join(process.cwd(), "components", "finanzas", "equilibrio", "CurvaEquilibrio.tsx"),
    "utf8",
  );

  it("el swatch de la leyenda usa el mapa CSS, no el de hex", () => {
    // Es el único nodo server-rendered de la app que lleva un color del tema. Si alguien
    // vuelve a poner COLOR[...] acá, vuelve el mismatch — y vuelve para todo el mundo.
    const swatch = CURVA.slice(CURVA.indexOf("aria-hidden"));
    expect(swatch).toContain("COLOR_CSS[s.key]");
    expect(swatch.slice(0, 600)).not.toMatch(/borderTopColor:\s*COLOR\[/);
    expect(swatch.slice(0, 600)).not.toMatch(/background:\s*COLOR\[/);
  });

  it("y el color que depende del tema entra como variable CSS", () => {
    expect(CURVA).toContain('egresos: "var(--fg-muted)"');
  });
});
