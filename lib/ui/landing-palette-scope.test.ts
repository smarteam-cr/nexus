/**
 * lib/ui/landing-palette-scope.test.ts — la paleta entra por PROP, no por el div de afuera.
 *
 * ── EL BUG QUE CONGELA ───────────────────────────────────────────────────────
 * `app/landing-engine.css` declara TODOS los tokens en `.stl { --blue, --bg, --text … }` y
 * los re-declara en `.stl.stl-internal` con la paleta gris de los documentos internos.
 *
 * Los tres workspaces internos (exploración, implementación, planificación) envolvían así:
 *
 *     <div className="stl stl-internal">   ← acá los tokens SON grises
 *       <LandingView … />                  ← y adentro pinta su propio <div className="stl">
 *     </div>                                  que se los VUELVE a declarar en marca
 *
 * Los custom properties se heredan, pero el `.stl` interior los declara SOBRE SÍ MISMO y
 * gana para todo su subárbol. Resultado: los tres documentos "internos" se veían con los
 * colores del CLIENTE, y se comprobaba a simple vista — el chip de una sección salía
 * NARANJA, que es el acento de marca, en un documento que el cliente no ve nunca.
 *
 * Nada lo señalaba: el CSS es correcto, el wrapper es correcto, y el resultado es un
 * documento que se ve bien… con la marca equivocada.
 *
 * La regla: si un archivo monta `<LandingView` y en algún lado usa `stl-internal`, TIENE que
 * pasar `palette="internal"`. El wrapper exterior puede quedarse —sí tiñe lo que está FUERA
 * del motor, como los esqueletos y las barras sticky— pero no alcanza por sí solo.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();

/**
 * Solo CÓDIGO. `DiagnosticoWorkspace` dice en su encabezado que usa la paleta de MARCA
 * "(`stl`, no `stl-internal`)" — escanear el comentario lo acusaba de lo contrario de lo
 * que documenta. Mismo criterio que `codigoDe` en lib/pieces/enabled-filter.test.ts.
 */
const soloCodigo = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function archivosTsx(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return archivosTsx(full);
    return e.name.endsWith(".tsx") ? [full] : [];
  });
}

const CANDIDATOS = [
  ...archivosTsx(path.join(RAIZ, "components", "canvas")),
  ...archivosTsx(path.join(RAIZ, "components", "external")),
  ...archivosTsx(path.join(RAIZ, "components", "business-cases")),
  ...archivosTsx(path.join(RAIZ, "app")),
].filter((f) => fs.readFileSync(f, "utf8").includes("<LandingView"));

describe("los documentos internos declaran su paleta por prop", () => {
  it("hay montajes de LandingView que verificar", () => {
    expect(CANDIDATOS.length).toBeGreaterThanOrEqual(5);
  });

  it("todo archivo que usa `stl-internal` y monta LandingView pasa palette=\"internal\"", () => {
    const ofensores: string[] = [];
    for (const full of CANDIDATOS) {
      const src = soloCodigo(fs.readFileSync(full, "utf8"));
      if (!src.includes("stl-internal")) continue;
      if (!src.includes('palette="internal"')) {
        ofensores.push(path.relative(RAIZ, full).replace(/\\/g, "/"));
      }
    }
    expect(
      ofensores,
      "El div exterior NO alcanza: `LandingView` pinta su propio `.stl` y se re-declara los " +
        "tokens de marca encima. Pasale `palette=\"internal\"`:\n" + ofensores.join("\n"),
    ).toEqual([]);
  });

  it("`LandingView` sigue aceptando la prop y aplicándola a SU div raíz", () => {
    const src = fs.readFileSync(path.join(RAIZ, "components", "landing", "LandingView.tsx"), "utf8");
    expect(src).toMatch(/palette\?:\s*"brand"\s*\|\s*"internal"/);
    // La clase tiene que ir en el div que renderiza el motor — que es el que gana la cascada.
    expect(src).toMatch(/className=\{palette === "internal" \? "stl stl-internal" : "stl"\}/);
  });
});
