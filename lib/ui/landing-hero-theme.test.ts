/**
 * lib/ui/landing-hero-theme.test.ts — el invariante que evita plumbear el tema.
 *
 * La brand-row del hero decide sola qué archivo de logo usar (`clientLogoDarkUrl ?? clientLogoUrl`)
 * y aplica el filtro que blanquea, SIN preguntarle a nadie sobre qué fondo está. Puede hacerlo
 * porque hoy es cierto que **todo hero del motor va sobre navy**: los defs con `backdrop: true`
 * declaran `theme: "dark"` sin una sola excepción.
 *
 * Eso es una coincidencia sostenida por convención, no por el compilador. `SectionProps` no
 * expone `theme` y `LandingContext` tampoco, así que si alguien crea un hero `theme: "light"`
 * con `backdrop: true`, el logo del cliente sale blanco sobre blanco —o la versión para fondo
 * oscuro sobre un fondo claro— y no lo caza nada: ni tsc, ni el build, ni el guard de
 * contraste, que valida pares de TOKENS y no combinaciones clase × tema.
 *
 * La alternativa era pasar `theme` hasta cada sección. Se descartó: sería un dato que ninguna
 * otra sección necesita, y encima MENOS seguro — con `theme` en props, un theme mal seteado
 * produce el mismo bug pero con más código en el medio. Se protege acá.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const DEFS_DIR = path.join(process.cwd(), "components", "landing", "configs");

/** Todas las defs server-safe del motor. */
const ARCHIVOS = fs.readdirSync(DEFS_DIR).filter((f) => f.endsWith(".defs.ts"));

/**
 * Bloques de sección que declaran `backdrop: true`, con el `theme` que traen cerca.
 * Se busca en la ventana de 6 líneas anterior porque el orden de las props en estas defs
 * es estable (key/label/eyebrow/theme/backdrop) y verificado en los 7 archivos.
 */
function heros(archivo: string): { linea: number; theme: string | null }[] {
  const lineas = fs.readFileSync(path.join(DEFS_DIR, archivo), "utf8").split(/\r?\n/);
  const out: { linea: number; theme: string | null }[] = [];
  lineas.forEach((l, i) => {
    if (!/^\s*backdrop:\s*true\s*,?\s*$/.test(l)) return;
    const ventana = lineas.slice(Math.max(0, i - 6), i + 3).join("\n");
    const m = ventana.match(/theme:\s*"(\w+)"/);
    out.push({ linea: i + 1, theme: m ? m[1] : null });
  });
  return out;
}

describe("todo hero con backdrop va sobre fondo oscuro", () => {
  it("hay heros que verificar (si esto falla, el guard dejó de proteger algo)", () => {
    const total = ARCHIVOS.reduce((a, f) => a + heros(f).length, 0);
    expect(total).toBeGreaterThanOrEqual(7);
  });

  for (const archivo of ARCHIVOS) {
    const encontrados = heros(archivo);
    if (encontrados.length === 0) continue;
    it(`${archivo}: cada backdrop declara theme "dark"`, () => {
      const malos = encontrados.filter((h) => h.theme !== "dark");
      expect(
        malos.map((h) => `línea ${h.linea} → theme ${h.theme ?? "(ausente)"}`),
        "un hero con backdrop y tema claro pinta el logo del cliente blanco sobre blanco",
      ).toEqual([]);
    });
  }
});
